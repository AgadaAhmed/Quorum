# Deploy & Verification — Pieces 1 & 2 (billing lockdown + security rules)

This covers deploying the subscription lockdown (piece 1) and the plans/storage
security rules + invite-code function (piece 2).

---

## ⛔ HARD GATE: Blaze plan must be active first

Cloud Functions **will not deploy on the Spark (free) plan**. Before anything
below:

1. Upgrade the Firebase project `quorum-323e1` to the **Blaze** (pay-as-you-go) plan.
2. Set a **Google Cloud budget alert** (Billing → Budgets & alerts) so spend can't
   run away silently.

If you are not on Blaze, stop here — `firebase deploy --only ...functions` will fail.

---

## ⚠️ ATOMIC DEPLOY — rules and functions must ship together

**The tightened Firestore rules and the `joinPlanByCode` function are a single unit.
Deploy them in the same command.**

Why: the new rules only allow self-join to **public** plans. Joining a **private**
plan by invite code is denied client-side **by design** — a non-participant can't
even read a private plan to find it. Only the `joinPlanByCode` Cloud Function (Admin
SDK) can perform that join.

- If the rules go live **without** the function → **private join-by-code breaks
  entirely.** (Public self-join still works.)
- Therefore: never deploy `firestore:rules` on its own. Always include `functions`
  in the same deploy.

---

## Deploy sequence (in order)

```bash
# 1. Install the Cloud Functions dependencies.
cd functions && npm install
cd ..

# 2. Set the shared secret RevenueCat will send in its Authorization header.
#    Use a long random string; you'll paste the SAME value into the RevenueCat
#    dashboard later (see post-deploy step 2).
firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH

# 3. Single atomic deploy — rules + storage + functions together.
firebase deploy --only firestore:rules,storage,functions
```

After deploy, note the printed function URLs. The webhook is the `revenuecatWebhook`
URL, e.g.:

```
https://us-central1-quorum-323e1.cloudfunctions.net/revenuecatWebhook
```

(2nd-gen functions may show a `run.app` URL instead — use whatever the deploy prints.)

---

## Post-deploy wiring

### 1. Identify users to RevenueCat with their Firebase UID — DONE (in code)

The webhook keys on `event.app_user_id` and writes `users/{uid}`. For that to match,
the app calls `Purchases.logIn(uid)` on sign-in (and `logOut()` on sign-out),
wired in `app/_layout.tsx` inside the `onAuthStateChanged` handler (guarded by
`isExpoGo`). No further action needed unless that wiring is removed.

### 2. Point the RevenueCat webhook at the deployed function

In the RevenueCat dashboard → **Integrations → Webhooks**:

- **URL**: the deployed `revenuecatWebhook` URL from the deploy output.
- **Authorization header**: the **same** value you set for `REVENUECAT_WEBHOOK_AUTH`
  in deploy step 2. (The function rejects any request whose `Authorization` header
  doesn't match.)

---

## Storage DEPLOY-VERIFY checklist (manual — required)

The storage rules gate `plan-covers/`, `plan-photos/`, `moments/`, and `chat-media/`
on Firestore participant data via cross-service `firestore.get()`. Those branches
**could not be emulator-tested** due to a known harness bug
([firebase-js-sdk#6803](https://github.com/firebase/firebase-js-sdk/issues/6803)) —
the Storage emulator's `firestore.get()` can't see harness-seeded docs. They use the
official documented cross-service pattern and work in **deployed** rules, but must be
verified once in staging.

Set up: two test accounts — **A** (creator/participant of a plan `P`) and **B** (NOT
a participant of `P`). Then confirm:

**Writes that must be DENIED (B is not a participant of plan `P`):**

- [ ] B cannot write to `plan-photos/<P>/<anyfile>`
- [ ] B cannot write to `moments/<P>/<anyfile>`
- [ ] B cannot write to `chat-media/<P>/<anyfile>`
- [ ] B cannot overwrite `plan-covers/<P>` (B is not the creator)

**Writes that must SUCCEED:**

- [ ] A (participant) can write to `plan-photos/<P>/<file>`
- [ ] A (participant) can write to `moments/<P>/<file>`
- [ ] A (participant) can write to `chat-media/<P>/<file>`
- [ ] The plan **creator** can overwrite `plan-covers/<P>`

If any DENIED row actually succeeds, do not open to real users — the participant
check isn't taking effect (recheck the `firestore.get()` paths in `storage.rules`).

---

## Local test reference (no deploy)

These run against the emulators and need **JDK 21+** (firebase-tools requirement;
Android Studio's JBR at `C:\Program Files\Android\Android Studio\jbr` is 21):

```bash
npm run test:rules     # Firestore rules — 35/35 (users + plans)
npm run test:storage   # Storage avatar rules; cross-service branches skipped (#6803)
```
