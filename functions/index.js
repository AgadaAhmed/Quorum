/**
 * Quorum Cloud Functions — RevenueCat entitlement webhook.
 *
 * This is the ONLY writer of the `subscriptionTier` / `subscriptionExpiresAt`
 * fields on `users/{uid}`. It runs with the Admin SDK, which bypasses Firestore
 * security rules, so clients can be (and are) blocked from writing those fields.
 *
 * Deploy requirements:
 *   1. The Firebase project must be on the Blaze (pay-as-you-go) plan.
 *   2. Set the shared secret RevenueCat will send in its Authorization header:
 *        firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH
 *   3. Deploy:  firebase deploy --only functions
 *      (runtime is pinned to nodejs22 via firebase.json "runtime")
 *   4. In the RevenueCat dashboard → Integrations → Webhooks, point the webhook
 *      at the deployed URL and set the Authorization header to the same secret.
 *
 * App requirement: the app must identify the user to RevenueCat with their
 * Firebase UID, i.e. call `Purchases.logIn(firebaseUid)` after auth, so that
 * `event.app_user_id` here equals the Firestore document id.
 */

const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { Expo } = require('expo-server-sdk');

admin.initializeApp();
const db = admin.firestore();

const expo = new Expo();

/**
 * Send an Expo push to a set of user UIDs. Looks up each recipient's stored
 * `pushToken`, skips anyone who has notifications disabled or no valid token,
 * de-dupes, and chunks the send. Never throws into the trigger.
 */
async function pushToUids(uids, { title, body, data, collapseId }) {
  const unique = [...new Set(uids)].filter(Boolean);
  if (unique.length === 0) return;
  const snaps = await db.getAll(...unique.map((u) => db.collection('users').doc(u)));
  const messages = [];
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const d = snap.data() || {};
    if (d.notificationsEnabled === false) continue; // absent = enabled
    const token = d.pushToken;
    if (!token || !Expo.isExpoPushToken(token)) continue;
    messages.push({
      to: token,
      sound: 'default',
      title,
      body,
      data: data || {},
      channelId: 'default',
      ...(collapseId ? { collapseId } : {}),
    });
  }
  if (messages.length === 0) return;
  for (const chunk of expo.chunkPushNotifications(messages)) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      logger.error('Expo push send failed', err);
    }
  }
}

async function displayNameOf(uid) {
  try {
    const s = await db.collection('users').doc(uid).get();
    return (s.exists && s.data().displayName) || 'Someone';
  } catch {
    return 'Someone';
  }
}

const REVENUECAT_WEBHOOK_AUTH = defineSecret('REVENUECAT_WEBHOOK_AUTH');
const PLACES_API_KEY = defineSecret('PLACES_API_KEY');

const INVITE_CODE_LENGTH = 8;

/**
 * Join a plan by its invite code.
 *
 * Required because the tightened security rules only allow self-join to PUBLIC
 * plans, and a non-participant cannot even read a PRIVATE plan to find it by
 * code. This callable runs with the Admin SDK: it validates the code, enforces
 * capacity, and adds the caller to participants server-side.
 */
exports.joinPlanByCode = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in to join a plan.');
  }
  const code = String((request.data && request.data.code) || '').trim().toUpperCase();
  if (code.length !== INVITE_CODE_LENGTH) {
    throw new HttpsError('invalid-argument', 'Enter a valid invite code.');
  }

  const snap = await db.collection('plans').where('inviteCode', '==', code).limit(1).get();
  if (snap.empty) {
    throw new HttpsError('not-found', 'Invalid code — plan not found.');
  }
  const planRef = snap.docs[0].ref;

  // Capacity check and join must be atomic: two users redeeming the last slot
  // concurrently would otherwise both pass the check and overfill the plan.
  const result = await db.runTransaction(async (tx) => {
    const planSnap = await tx.get(planRef);
    if (!planSnap.exists) {
      throw new HttpsError('not-found', 'Invalid code — plan not found.');
    }
    const plan = planSnap.data();
    const participants = Array.isArray(plan.participants) ? plan.participants : [];

    if (participants.includes(uid)) {
      return { planId: planRef.id, alreadyJoined: true };
    }
    if (plan.maxParticipants && participants.length >= plan.maxParticipants) {
      throw new HttpsError('resource-exhausted', 'This plan is full.');
    }

    tx.update(planRef, { participants: admin.firestore.FieldValue.arrayUnion(uid) });
    return { planId: planRef.id };
  });

  if (!result.alreadyJoined) {
    logger.info(`joinPlanByCode: ${uid} joined ${result.planId}`);
  }
  return result;
});

/**
 * Check whether a username is available (case-insensitive).
 *
 * Called during sign-up BEFORE the account exists, i.e. by an UNAUTHENTICATED
 * client. The registration screen can't query `users` directly for this: the
 * Firestore rules (correctly) block unauthenticated reads of user docs, which
 * hold emails and other private fields. This callable runs with the Admin SDK,
 * so it can check the whole `users` collection without exposing any of it — it
 * returns only a boolean. (Profile username edits happen while authenticated and
 * still query Firestore directly.)
 */
exports.checkUsername = onCall(async (request) => {
  const raw = String((request.data && request.data.username) || '').trim();
  if (!raw || !/^[a-zA-Z0-9_]{1,30}$/.test(raw)) {
    throw new HttpsError('invalid-argument', 'Invalid username.');
  }
  const snap = await db
    .collection('users')
    .where('usernameLower', '==', raw.toLowerCase())
    .limit(1)
    .get();
  return { available: snap.empty };
});

// ── Places proxy ─────────────────────────────────────────────────────────────
// Proxies Google Places API (New) so the key stays server-side, caches results
// in Firestore (per rounded location + category), and enforces a per-user daily
// call ceiling to cap cost. Photos are resolved separately via placePhoto.

const PLACES_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (Google allows <=30)
const PLACES_DAILY_CAP = 300;                        // per-user Google calls/day

// App-category -> Google (New) includedTypes for Nearby Search.
const CATEGORY_TO_TYPES = {
  Food:   ['restaurant', 'cafe', 'bakery'],
  Party:  ['bar', 'night_club'],
  Sports: ['gym', 'stadium'],
  Art:    ['art_gallery', 'museum'],
  Study:  ['library', 'book_store'],
  Travel: ['tourist_attraction', 'park'],
};

function placesCacheKey(lat, lng, category) {
  const r = (n) => Math.round(n * 1000) / 1000; // ~110m granularity
  return `${r(lat)}_${r(lng)}_${category || 'all'}`;
}

/**
 * Nearby venue search, backed by Google Places API (New) and cached in
 * Firestore. Called by the app's venue picker when creating/editing a plan.
 */
exports.placesSearch = onCall({ secrets: [PLACES_API_KEY] }, async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const lat = Number(req.data && req.data.lat);
  const lng = Number(req.data && req.data.lng);
  const category = typeof req.data?.category === 'string' ? req.data.category : '';
  if (!isFinite(lat) || !isFinite(lng)) {
    throw new HttpsError('invalid-argument', 'lat and lng are required numbers.');
  }

  const cacheRef = db.doc(`venuesCache/${placesCacheKey(lat, lng, category)}`);
  const cached = await cacheRef.get();
  if (cached.exists) {
    const data = cached.data();
    if (data.fetchedAt && Date.now() - data.fetchedAt.toMillis() < PLACES_CACHE_TTL_MS) {
      return { places: data.places || [], cached: true };
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const usageRef = db.doc(`venuesUsage/${uid}_${today}`);
  const usageSnap = await usageRef.get();
  const used = (usageSnap.exists && usageSnap.data().count) || 0;
  if (used >= PLACES_DAILY_CAP) {
    if (cached.exists) return { places: cached.data().places || [], cached: true, capped: true };
    return { places: [], cached: false, capped: true };
  }

  const includedTypes = CATEGORY_TO_TYPES[category] || [];
  const body = {
    maxResultCount: 20,
    locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: 4000 } },
  };
  if (includedTypes.length) body.includedTypes = includedTypes;

  // Places API (New) Nearby Search. Field mask is REQUIRED.
  // NOTE: verify these X-Goog-FieldMask paths against ONE real response once a key
  // exists — a wrong field name makes Google return 400.
  const resp = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_API_KEY.value(),
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.photos',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    logger.error('placesSearch google error', resp.status, text.slice(0, 300));
    if (cached.exists) return { places: cached.data().places || [], cached: true, stale: true };
    throw new HttpsError('unavailable', 'Places lookup failed.');
  }

  const json = await resp.json();
  const places = (json.places || []).map((p) => ({
    placeId: p.id,
    name: (p.displayName && p.displayName.text) || 'Unknown place',
    address: p.formattedAddress || '',
    lat: p.location ? p.location.latitude : lat,
    lng: p.location ? p.location.longitude : lng,
    types: p.types || [],
    rating: typeof p.rating === 'number' ? p.rating : null,
    // Feature B (sponsored venues) will later set featured:true for paid places here.
    photoRef: p.photos && p.photos[0] ? p.photos[0].name : null, // "places/XX/photos/YY"
    source: 'google',
    featured: false,
  }));

  await cacheRef.set({ places, fetchedAt: admin.firestore.FieldValue.serverTimestamp() });
  await usageRef.set({ count: admin.firestore.FieldValue.increment(1), day: today }, { merge: true });

  return { places, cached: false };
});

/**
 * Resolve a Google Places photo reference (from placesSearch's `photoRef`) to
 * a fetchable image URL. Kept separate from placesSearch so the client only
 * pays the photo-media call for venues actually rendered/selected.
 */
exports.placePhoto = onCall({ secrets: [PLACES_API_KEY] }, async (req) => {
  if (!(req.auth && req.auth.uid)) throw new HttpsError('unauthenticated', 'Sign in required.');
  const photoRef = req.data && req.data.photoRef; // "places/XX/photos/YY"
  const maxWidthPx = Math.min(Number(req.data?.maxWidthPx) || 600, 1600);
  if (typeof photoRef !== 'string' || !photoRef.startsWith('places/')) {
    throw new HttpsError('invalid-argument', 'photoRef required.');
  }
  const url =
    `https://places.googleapis.com/v1/${photoRef}/media` +
    `?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true&key=${PLACES_API_KEY.value()}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    logger.error('placePhoto error', resp.status);
    throw new HttpsError('unavailable', 'Photo fetch failed.');
  }
  const json = await resp.json();
  return { url: json.photoUri || null };
});

// Event types that grant / keep an active entitlement.
const ACTIVE_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'SUBSCRIPTION_EXTENDED',
  'TRANSFER',
  'NON_RENEWING_PURCHASE',
]);

// Event types that revoke access immediately.
const INACTIVE_EVENTS = new Set([
  'EXPIRATION',
  'BILLING_ISSUE',
  'SUBSCRIPTION_PAUSED',
  'REFUND',
]);

exports.revenuecatWebhook = onRequest(
  { secrets: [REVENUECAT_WEBHOOK_AUTH], cors: false },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // RevenueCat sends the value you configure in the dashboard as the
    // Authorization header. Reject anything that doesn't match, using a
    // constant-time comparison so the check can't be timed byte-by-byte.
    const authHeader = Buffer.from(req.get('Authorization') || '');
    const expected = Buffer.from(REVENUECAT_WEBHOOK_AUTH.value());
    const authOk =
      authHeader.length === expected.length && crypto.timingSafeEqual(authHeader, expected);
    if (!authOk) {
      logger.warn('Rejected RevenueCat webhook: bad Authorization header');
      res.status(401).send('Unauthorized');
      return;
    }

    const event = req.body && req.body.event;
    if (!event || typeof event !== 'object') {
      res.status(400).send('Missing event');
      return;
    }

    const uid = event.app_user_id;
    if (!uid || typeof uid !== 'string') {
      logger.warn('RevenueCat webhook missing app_user_id', { type: event.type });
      res.status(400).send('Missing app_user_id');
      return;
    }

    const type = event.type;
    const expMs = typeof event.expiration_at_ms === 'number' ? event.expiration_at_ms : null;
    const now = Date.now();

    let isPro;
    if (ACTIVE_EVENTS.has(type)) {
      isPro = expMs ? expMs > now : true;
    } else if (INACTIVE_EVENTS.has(type)) {
      isPro = false;
    } else {
      // e.g. CANCELLATION (auto-renew off) — keep access until expiry.
      isPro = expMs ? expMs > now : false;
    }

    try {
      await db.collection('users').doc(uid).set(
        {
          subscriptionTier: isPro ? 'pro' : 'free',
          subscriptionExpiresAt:
            isPro && expMs ? admin.firestore.Timestamp.fromMillis(expMs) : null,
          subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      logger.info(`RevenueCat: ${uid} -> ${isPro ? 'pro' : 'free'} (event ${type})`);
      res.status(200).send('ok');
    } catch (e) {
      logger.error('Failed to update user tier', e);
      res.status(500).send('error');
    }
  }
);

// ── Push notifications ──────────────────────────────────────────────────────
// Firestore-triggered senders (Admin SDK) that push to recipients' Expo tokens.
// Client stores the token at users/{uid}.pushToken and a notificationsEnabled
// preference; pushToUids() honors both. Tap-routing payloads carry `type` and,
// where relevant, `planId` (see the response listener in app/_layout.tsx).

// users/{uid} update → friend request received / accepted.
exports.onUserUpdate = onDocumentUpdated('users/{uid}', async (event) => {
  const before = (event.data.before && event.data.before.data()) || {};
  const after = (event.data.after && event.data.after.data()) || {};
  const uid = event.params.uid;

  // A new friend request lands in the RECIPIENT's friendRequests array.
  const beforeReqIds = new Set((before.friendRequests || []).map((r) => r && r.fromId));
  const newReqs = (after.friendRequests || []).filter((r) => r && !beforeReqIds.has(r.fromId));
  for (const r of newReqs) {
    await pushToUids([uid], {
      title: 'New friend request',
      body: `${r.fromName || 'Someone'} sent you a friend request`,
      data: { type: 'friend_request' },
    });
  }

  // Friends gained WITHOUT a request being removed in the same write means this
  // doc's owner is the original sender and the other side just accepted. (The
  // accepter's own write removes a request, so they're correctly skipped.)
  const beforeFriends = new Set(before.friends || []);
  const addedFriends = (after.friends || []).filter((f) => !beforeFriends.has(f));
  const removedARequest =
    (after.friendRequests || []).length < (before.friendRequests || []).length;
  if (addedFriends.length > 0 && !removedARequest) {
    for (const f of addedFriends) {
      const name = await displayNameOf(f);
      await pushToUids([uid], {
        title: 'Friend request accepted',
        body: `${name} accepted your friend request`,
        data: { type: 'friend_accepted' },
      });
    }
  }
});

// plans/{planId} update → quorum reached (all participants) / someone joined (creator).
exports.onPlanUpdate = onDocumentUpdated('plans/{planId}', async (event) => {
  const before = (event.data.before && event.data.before.data()) || {};
  const after = (event.data.after && event.data.after.data()) || {};
  const planId = event.params.planId;
  const title = after.title || 'Your plan';

  if (before.status !== 'confirmed' && after.status === 'confirmed') {
    await pushToUids(after.participants || [], {
      title: 'Quorum reached!',
      body: `"${title}" has enough votes — it's confirmed!`,
      data: { type: 'plan_confirmed', planId },
      collapseId: `plan-${planId}`,
    });
  }

  const beforeP = new Set(before.participants || []);
  const addedP = (after.participants || []).filter((p) => !beforeP.has(p));
  const creator = after.createdBy;
  if (creator) {
    for (const p of addedP) {
      if (p === creator) continue;
      const name = await displayNameOf(p);
      await pushToUids([creator], {
        title: 'Someone joined your plan',
        body: `${name} joined "${title}"`,
        data: { type: 'plan_join', planId },
      });
    }
  }
});

// chats/{roomId}/messages/{id} created → notify plan participants except sender.
// roomId is the planId (chat.tsx: ROOM_ID = planId || 'global'). collapseId keeps
// a busy chat from stacking one notification per message.
exports.onChatMessage = onDocumentCreated(
  'chats/{roomId}/messages/{messageId}',
  async (event) => {
    const roomId = event.params.roomId;
    if (!roomId || roomId === 'global') return;
    const msg = event.data && event.data.data();
    if (!msg) return;
    const senderId = msg.senderId;

    const planSnap = await db.collection('plans').doc(roomId).get();
    if (!planSnap.exists) return;
    const plan = planSnap.data() || {};
    const recipients = (plan.participants || []).filter((u) => u !== senderId);
    if (recipients.length === 0) return;

    const text = String(msg.text || '').slice(0, 140);
    await pushToUids(recipients, {
      title: plan.title || 'New message',
      body: `${msg.senderName || 'Someone'}: ${text}`,
      data: { type: 'chat', planId: roomId },
      collapseId: `chat-${roomId}`,
    });
  }
);
