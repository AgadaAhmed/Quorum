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
  Food:   ['restaurant', 'cafe', 'bakery', 'meal_takeaway'],
  Party:  ['bar', 'night_club', 'movie_theater', 'amusement_park', 'bowling_alley'],
  Sports: ['gym', 'stadium', 'sports_complex'],
  Art:    ['art_gallery', 'museum'],
  Study:  ['library', 'book_store'],
  Travel: ['tourist_attraction', 'park'],
};

// Default set for the "All" view + the Discover carousel (no category chosen):
// the union of every mapped category, so we only surface social/leisure venues
// instead of every business nearby (no truck-rental firms, plumbers, etc.).
const DEFAULT_INCLUDED_TYPES = [...new Set(Object.values(CATEGORY_TO_TYPES).flat())];

// Dietary filters. Google Places (New) has no structured "halal" attribute and
// Nearby Search takes no keyword, so these route to Text Search instead, using
// the mapped query. Keyed like a category so they flow through the same param.
const DIETARY_QUERY = {
  Halal: 'halal restaurant',
  Vegan: 'vegan restaurant',
  Vegetarian: 'vegetarian restaurant',
};

function placesCacheKey(lat, lng, category) {
  const r = (n) => Math.round(n * 1000) / 1000; // ~110m granularity
  // v2: bumped when the query (includedTypes) changed, so stale unfiltered
  // "all" results from v1 are ignored instead of served until TTL.
  return `v2_${r(lat)}_${r(lng)}_${category || 'all'}`;
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
  let category = typeof req.data?.category === 'string' ? req.data.category : '';
  if (!isFinite(lat) || !isFinite(lng)) {
    throw new HttpsError('invalid-argument', 'lat and lng are required numbers.');
  }
  // Clamp to a known category (or '') BEFORE it reaches the cache key: category
  // flows into the Firestore doc path, where a stray '/' would corrupt the path.
  category = (CATEGORY_TO_TYPES[category] || DIETARY_QUERY[category]) ? category : '';

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
    if (cached.exists) {
      return { places: cached.data().places || [], cached: true, capped: true, stale: true };
    }
    return { places: [], cached: false, capped: true };
  }

  // Dietary filters (e.g. Halal) can't be expressed as Nearby-Search types, so
  // they use Text Search with a keyword; everything else is a type-based Nearby
  // Search ("all" = the curated union, so we never do an unfiltered search).
  const dietaryQuery = DIETARY_QUERY[category];
  const circle = { center: { latitude: lat, longitude: lng }, radius: 4000 };
  const endpoint = dietaryQuery
    ? 'https://places.googleapis.com/v1/places:searchText'
    : 'https://places.googleapis.com/v1/places:searchNearby';
  const body = dietaryQuery
    ? { textQuery: dietaryQuery, maxResultCount: 20, locationBias: { circle } }
    : {
        maxResultCount: 20,
        locationRestriction: { circle },
        includedTypes: CATEGORY_TO_TYPES[category] || DEFAULT_INCLUDED_TYPES,
      };

  // Any failure talking to Google — thrown fetch (timeout/DNS/reset), a non-OK
  // status, or a JSON parse error — routes through the same stale-cache fallback.
  let json;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    let resp;
    try {
      // Places API (New). Field mask is REQUIRED and is identical for Nearby
      // and Text Search (both return `places[]` with these fields).
      resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': PLACES_API_KEY.value(),
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.userRatingCount,places.reviews,places.photos',
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(t);
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`google ${resp.status}: ${text.slice(0, 300)}`);
    }
    json = await resp.json();
  } catch (err) {
    logger.error('placesSearch google error', err && err.message ? err.message : err);
    if (cached.exists) return { places: cached.data().places || [], cached: true, stale: true };
    throw new HttpsError('unavailable', 'Places lookup failed.');
  }

  const places = (json.places || []).map((p) => ({
    placeId: p.id,
    name: (p.displayName && p.displayName.text) || 'Unknown place',
    address: p.formattedAddress || '',
    lat: p.location ? p.location.latitude : lat,
    lng: p.location ? p.location.longitude : lng,
    types: p.types || [],
    rating: typeof p.rating === 'number' ? p.rating : null,
    userRatingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    // Keep only the first 3 reviews, trimmed, so the cache doc stays small.
    reviews: (p.reviews || []).slice(0, 3).map((r) => ({
      author: (r.authorAttribution && r.authorAttribution.displayName) || 'Guest',
      rating: typeof r.rating === 'number' ? r.rating : null,
      text: ((r.text && r.text.text) || (r.originalText && r.originalText.text) || '').slice(0, 320),
      relativeTime: r.relativePublishTimeDescription || '',
    })),
    // Feature B (sponsored venues) will later set featured:true for paid places here.
    photoRef: p.photos && p.photos[0] ? p.photos[0].name : null, // "places/XX/photos/YY"
    source: 'google',
    featured: false,
  }));

  await cacheRef.set({ places, fetchedAt: admin.firestore.FieldValue.serverTimestamp() });
  // Best-effort: a failed usage-counter write must not fail a request that
  // already has valid places.
  try {
    await usageRef.set(
      { count: admin.firestore.FieldValue.increment(1), day: today },
      { merge: true }
    );
  } catch (err) {
    logger.error('placesSearch usage write failed', err && err.message ? err.message : err);
  }

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

  // Cache resolved photo URLs so repeats are free. photoRefs come only from
  // finite search results, so no separate daily cap is needed. '/' is replaced
  // so the ref becomes a single Firestore doc-path segment.
  const photoId = photoRef.replace(/\//g, '_');
  const photoCacheRef = db.doc(`venuePhotoCache/${photoId}`);
  const photoCached = await photoCacheRef.get();
  if (photoCached.exists) {
    const d = photoCached.data();
    if (d.fetchedAt && Date.now() - d.fetchedAt.toMillis() < PLACES_CACHE_TTL_MS) {
      return { url: d.url || null };
    }
  }

  const url =
    `https://places.googleapis.com/v1/${photoRef}/media` +
    `?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true&key=${PLACES_API_KEY.value()}`;
  let json;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    let resp;
    try {
      resp = await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
    if (!resp.ok) throw new Error(`google ${resp.status}`);
    json = await resp.json();
  } catch (err) {
    logger.error('placePhoto error', err && err.message ? err.message : err);
    throw new HttpsError('unavailable', 'Photo fetch failed.');
  }

  const photoUri = json.photoUri || null;
  // Best-effort cache write; a failure here must not fail the request.
  try {
    await photoCacheRef.set({
      url: photoUri,
      fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    logger.error('placePhoto cache write failed', err && err.message ? err.message : err);
  }

  return { url: photoUri };
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

// plans/{planId} created with participants beyond the creator → those friends
// were invited straight from the create-plan screen. Ping each invitee (the
// creator seeds participants, so onPlanUpdate's join-notify never fires for them).
exports.onPlanCreate = onDocumentCreated('plans/{planId}', async (event) => {
  const plan = (event.data && event.data.data()) || {};
  const planId = event.params.planId;
  const creator = plan.createdBy;
  const invited = (plan.participants || []).filter((p) => p && p !== creator);
  if (!invited.length) return;
  const title = plan.title || 'a plan';
  const inviterName = creator ? await displayNameOf(creator) : 'Someone';
  await pushToUids(invited, {
    title: 'You were invited to a plan',
    body: `${inviterName} invited you to "${title}"`,
    data: { type: 'plan_invite', planId },
    collapseId: `plan-invite-${planId}`,
  });
});

// chats/{roomId}/messages/{id} created → notify plan participants except sender.
// roomId is the planId (chat.tsx: ROOM_ID = planId || 'global'). collapseId keeps
// a busy chat from stacking one notification per message.
exports.onChatMessage = onDocumentCreated(
  'chats/{roomId}/messages/{messageId}',
  async (event) => {
    const roomId = event.params.roomId;
    if (!roomId || roomId === 'global') return; // never notify the whole world
    const msg = event.data && event.data.data();
    if (!msg) return;
    const senderId = msg.senderId;
    const preview = String(
      msg.text || (msg.type === 'gif' ? 'GIF' : msg.type === 'image' ? 'Photo' : '')
    ).slice(0, 140);

    // Direct message → notify the other participant only.
    if (roomId.startsWith('dm__')) {
      const roomSnap = await db.collection('chats').doc(roomId).get();
      const participants = (roomSnap.exists && roomSnap.data().participants) || [];
      const recipients = participants.filter((u) => u !== senderId);
      if (recipients.length === 0) return;
      await pushToUids(recipients, {
        title: msg.senderName || 'New message',
        body: preview,
        data: { type: 'dm', roomId },
        collapseId: `dm-${roomId}`,
      });
      return;
    }

    // Plan chat → notify plan participants except the sender.
    const planSnap = await db.collection('plans').doc(roomId).get();
    if (!planSnap.exists) return;
    const plan = planSnap.data() || {};
    const recipients = (plan.participants || []).filter((u) => u !== senderId);
    if (recipients.length === 0) return;
    await pushToUids(recipients, {
      title: plan.title || 'New message',
      body: `${msg.senderName || 'Someone'}: ${preview}`,
      data: { type: 'chat', planId: roomId },
      collapseId: `chat-${roomId}`,
    });
  }
);
