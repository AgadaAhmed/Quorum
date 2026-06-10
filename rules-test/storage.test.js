/**
 * Storage rules tests for Quorum.
 * Run via:  npm run test:storage
 * (firebase emulators:exec --only firestore,storage "node rules-test/storage.test.js")
 *
 * SCOPE NOTE: storage.rules gates plan-photos / moments / chat-media / cover-overwrite
 * on Firestore participant data via cross-service firestore.get()/exists(). Those
 * branches CANNOT be exercised in the local emulator harness: the Storage emulator's
 * firestore.get() does not see documents seeded by the test harness — a known,
 * still-open bug: https://github.com/firebase/firebase-js-sdk/issues/6803
 * (verified here against rules-unit-testing seeding, firebase-admin seeding, and a
 * demo- project id — all three leave firestore.exists() returning false inside the
 * Storage emulator). The cross-service syntax used is the official documented pattern
 * (https://firebase.blog/posts/2022/09/announcing-cross-service-security-rules/) and
 * works in DEPLOYED rules; those branches are listed below as skipped + must be
 * confirmed in staging post-deploy (see DEPLOY-VERIFY block at the end).
 */
const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const { ref, uploadBytes } = require('firebase/storage');

const DATA = new Uint8Array([1, 2, 3, 4]);

let passed = 0;
let failed = 0;
let skipped = 0;
async function check(name, promise) {
  try {
    await promise;
    console.log('  PASS  ' + name);
    passed++;
  } catch (e) {
    console.log('  FAIL  ' + name + '  -> ' + (e && e.message ? e.message : e));
    failed++;
  }
}
function skip(name) {
  console.log('  SKIP  ' + name + '  (cross-service; firebase-js-sdk#6803 — verify on deploy)');
  skipped++;
}

(async () => {
  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-quorum',
    storage: { rules: fs.readFileSync(path.join(__dirname, '..', 'storage.rules'), 'utf8') },
  });

  const alice = testEnv.authenticatedContext('alice').storage();
  const bob = testEnv.authenticatedContext('bob').storage();

  // ── Verifiable locally: avatar rules (no Firestore dependency) ──
  console.log('\nStorage — avatars (locally verifiable):');
  await check('owner can write own avatar',
    assertSucceeds(uploadBytes(ref(alice, 'avatars/alice'), DATA)));
  await check('cannot write someone else\'s avatar',
    assertFails(uploadBytes(ref(bob, 'avatars/alice'), DATA)));

  // ── Cross-service branches: cannot be exercised here (see SCOPE NOTE) ──
  console.log('\nStorage — cross-service participant rules (deploy-verified, see #6803):');
  skip('participant can upload plan-photos/{planId}/{photoId}');
  skip('outsider cannot upload to plan-photos of a plan they are not in');
  skip('participant can upload moments/{planId}/...');
  skip('outsider cannot upload moments to a plan they are not in');
  skip('participant can upload chat-media/{roomId}/{file}');
  skip('outsider cannot upload chat-media to a plan they are not in');
  skip('plan-cover: only the creator may overwrite an existing plan cover');

  await testEnv.cleanup();
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped (cross-service)`);
  console.log(
    '\nDEPLOY-VERIFY (run once in staging after `firebase deploy --only storage`):\n' +
    '  As a participant of a plan: uploading to plan-photos/<planId>/x, moments/<planId>/x,\n' +
    '  chat-media/<planId>/x should SUCCEED. As a non-participant: each should be DENIED.\n' +
    '  Overwriting plan-covers/<planId> should succeed only for the plan creator.'
  );
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
