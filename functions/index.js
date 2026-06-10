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
 *   4. In the RevenueCat dashboard → Integrations → Webhooks, point the webhook
 *      at the deployed URL and set the Authorization header to the same secret.
 *
 * App requirement: the app must identify the user to RevenueCat with their
 * Firebase UID, i.e. call `Purchases.logIn(firebaseUid)` after auth, so that
 * `event.app_user_id` here equals the Firestore document id.
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const REVENUECAT_WEBHOOK_AUTH = defineSecret('REVENUECAT_WEBHOOK_AUTH');

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
    // Authorization header. Reject anything that doesn't match.
    const authHeader = req.get('Authorization') || '';
    if (authHeader !== REVENUECAT_WEBHOOK_AUTH.value()) {
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
