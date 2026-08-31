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
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.firestore();

const REVENUECAT_WEBHOOK_AUTH = defineSecret('REVENUECAT_WEBHOOK_AUTH');

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
