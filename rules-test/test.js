/**
 * Rules unit test for the subscription lockdown (firestore.rules).
 * Run via:  firebase emulators:exec --only firestore "node rules-test/test.js"
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc } = require('firebase/firestore');

const RULES = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

let passed = 0;
let failed = 0;
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

(async () => {
  const testEnv = await initializeTestEnvironment({
    projectId: 'quorum-rules-test',
    firestore: { rules: RULES },
  });

  const alice = testEnv.authenticatedContext('alice').firestore();
  const bob = testEnv.authenticatedContext('bob').firestore();

  // Seed alice's user doc as a free user (admin context bypasses rules).
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const adb = ctx.firestore();
    await setDoc(doc(adb, 'users/alice'), {
      displayName: 'Alice',
      subscriptionTier: 'free',
      friends: [],
      friendRequests: [],
      blockedUsers: [],
    });
    await setDoc(doc(adb, 'users/bob'), { displayName: 'Bob', subscriptionTier: 'free', friends: [] });
  });

  console.log('Subscription-lockdown rule tests:');

  // 1. Owner edits a normal profile field -> ALLOW
  await check('owner can edit own displayName',
    assertSucceeds(updateDoc(doc(alice, 'users/alice'), { displayName: 'Alice A.' })));

  // 2. Owner self-upgrades to pro -> DENY (the billing hole)
  await check('owner CANNOT set subscriptionTier=pro',
    assertFails(updateDoc(doc(alice, 'users/alice'), { subscriptionTier: 'pro' })));

  // 3. Owner cannot set the expiry field either -> DENY
  await check('owner CANNOT set subscriptionExpiresAt',
    assertFails(updateDoc(doc(alice, 'users/alice'), { subscriptionExpiresAt: Date.now() })));

  // 4. Owner edits profile AND sneaks tier in the same write -> DENY
  await check('owner CANNOT smuggle tier alongside a profile edit',
    assertFails(updateDoc(doc(alice, 'users/alice'), { displayName: 'X', subscriptionTier: 'pro' })));

  // 5. Another user touches only social fields -> ALLOW
  await check('other user can add a friend request',
    assertSucceeds(updateDoc(doc(alice, 'users/alice'), { friendRequests: [{ fromId: 'bob' }] })));

  // 6. Another user tries to set someone else's tier -> DENY
  await check('other user CANNOT set my subscriptionTier',
    assertFails(updateDoc(doc(bob, 'users/alice'), { subscriptionTier: 'pro' })));

  // 7. Create a fresh doc as pro -> DENY
  const carol = testEnv.authenticatedContext('carol').firestore();
  await check('cannot create own doc already pro',
    assertFails(setDoc(doc(carol, 'users/carol'), { displayName: 'Carol', subscriptionTier: 'pro' })));

  // 8. Create a fresh doc as free -> ALLOW
  const dave = testEnv.authenticatedContext('dave').firestore();
  await check('can create own doc as free',
    assertSucceeds(setDoc(doc(dave, 'users/dave'), { displayName: 'Dave', subscriptionTier: 'free' })));

  // 9. Webhook (admin) sets pro, then owner edits profile without touching tier -> ALLOW
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/alice'), { subscriptionTier: 'pro' }, { merge: true });
  });
  await check('owner can still edit profile after webhook grants pro',
    assertSucceeds(updateDoc(doc(alice, 'users/alice'), { displayName: 'Alice Pro' })));

  await testEnv.cleanup();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
