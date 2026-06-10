/**
 * Firestore rules tests for Quorum.
 * Run via:  npm run test:rules
 * (which is: firebase emulators:exec --only firestore "node rules-test/test.js")
 */
const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, getDoc, deleteDoc, collection, addDoc } = require('firebase/firestore');

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

  const alice = testEnv.authenticatedContext('alice').firestore(); // creator
  const bob = testEnv.authenticatedContext('bob').firestore();     // participant
  const carol = testEnv.authenticatedContext('carol').firestore(); // outsider
  const dave = testEnv.authenticatedContext('dave').firestore();

  // Reset all docs to a known state (admin context bypasses rules).
  async function seed() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users/alice'), {
        displayName: 'Alice', subscriptionTier: 'free', friends: [], friendRequests: [], blockedUsers: [],
      });
      await setDoc(doc(db, 'users/bob'), { displayName: 'Bob', subscriptionTier: 'free', friends: [] });
      // Public plan, alice creator, votes seeded with alice.
      await setDoc(doc(db, 'plans/pub1'), {
        createdBy: 'alice', isPublic: true, participants: ['alice'], votes: ['alice'],
        requiredVotes: 3, status: 'pending', title: 'Public Plan',
      });
      // Private plan with alice + bob.
      await setDoc(doc(db, 'plans/priv1'), {
        createdBy: 'alice', isPublic: false, participants: ['alice', 'bob'], votes: ['alice'],
        requiredVotes: 2, status: 'pending', title: 'Private Plan',
      });
      // Private plan with only alice (carol is an outsider).
      await setDoc(doc(db, 'plans/priv2'), {
        createdBy: 'alice', isPublic: false, participants: ['alice'], votes: [],
        requiredVotes: 2, status: 'pending', title: 'Private Solo',
      });
      // Public plan that has already reached quorum (3/3).
      await setDoc(doc(db, 'plans/quorum'), {
        createdBy: 'alice', isPublic: true, participants: ['alice'], votes: ['alice', 'bob', 'carol'],
        requiredVotes: 3, status: 'pending', title: 'At Quorum',
      });
      // Public plan short of quorum (1/3).
      await setDoc(doc(db, 'plans/noquorum'), {
        createdBy: 'alice', isPublic: true, participants: ['alice'], votes: ['alice'],
        requiredVotes: 3, status: 'pending', title: 'No Quorum',
      });
    });
  }

  // ───────────────────────── Subscription lockdown ─────────────────────────
  console.log('\nSubscription-lockdown rules:');
  await seed();
  await check('owner can edit own displayName',
    assertSucceeds(updateDoc(doc(alice, 'users/alice'), { displayName: 'Alice A.' })));
  await check('owner CANNOT set subscriptionTier=pro',
    assertFails(updateDoc(doc(alice, 'users/alice'), { subscriptionTier: 'pro' })));
  await check('owner CANNOT smuggle tier alongside a profile edit',
    assertFails(updateDoc(doc(alice, 'users/alice'), { displayName: 'X', subscriptionTier: 'pro' })));
  await check('other user can add a friend request',
    assertSucceeds(updateDoc(doc(bob, 'users/alice'), { friendRequests: [{ fromId: 'bob' }] })));
  await check('other user CANNOT set my subscriptionTier',
    assertFails(updateDoc(doc(bob, 'users/alice'), { subscriptionTier: 'pro' })));
  await check('cannot create own doc already pro',
    assertFails(setDoc(doc(carol, 'users/carol'), { displayName: 'Carol', subscriptionTier: 'pro' })));
  await check('can create own doc as free',
    assertSucceeds(setDoc(doc(dave, 'users/dave'), { displayName: 'Dave', subscriptionTier: 'free' })));

  // ───────────────────────── Plans: read ─────────────────────────
  console.log('\nPlans — read:');
  await seed();
  await check('outsider can read a PUBLIC plan',
    assertSucceeds(getDoc(doc(carol, 'plans/pub1'))));
  await check('outsider CANNOT read a PRIVATE plan',
    assertFails(getDoc(doc(carol, 'plans/priv2'))));
  await check('participant can read their private plan',
    assertSucceeds(getDoc(doc(bob, 'plans/priv1'))));

  // ───────────────────────── Plans: create ─────────────────────────
  console.log('\nPlans — create:');
  await seed();
  await check('user can create a plan as themselves',
    assertSucceeds(setDoc(doc(dave, 'plans/new1'), { createdBy: 'dave', isPublic: true, participants: ['dave'], votes: ['dave'], requiredVotes: 3, status: 'pending' })));
  await check('CANNOT create a plan spoofing another creator',
    assertFails(setDoc(doc(dave, 'plans/new2'), { createdBy: 'alice', isPublic: true, participants: ['dave'], votes: [], requiredVotes: 3, status: 'pending' })));
  await check('CANNOT create a plan without seeding self as participant',
    assertFails(setDoc(doc(dave, 'plans/new3'), { createdBy: 'dave', isPublic: true, participants: [], votes: [], requiredVotes: 3, status: 'pending' })));

  // ───────────────────────── Plans: vote ─────────────────────────
  console.log('\nPlans — vote:');
  await seed();
  await check('outsider can vote on a PUBLIC plan (adds self)',
    assertSucceeds(updateDoc(doc(carol, 'plans/pub1'), { votes: ['alice', 'carol'] })));
  await seed();
  await check('outsider CANNOT vote on a PRIVATE plan',
    assertFails(updateDoc(doc(carol, 'plans/priv2'), { votes: ['carol'] })));
  await seed();
  await check('CANNOT stuff the ballot with another uid',
    assertFails(updateDoc(doc(carol, 'plans/pub1'), { votes: ['alice', 'bob'] })));
  await seed();
  await check('participant can vote on their private plan',
    assertSucceeds(updateDoc(doc(bob, 'plans/priv1'), { votes: ['alice', 'bob'] })));

  // ───────────────────────── Plans: confirm at quorum ─────────────────────────
  console.log('\nPlans — confirm:');
  await seed();
  await check('can confirm when quorum reached',
    assertSucceeds(updateDoc(doc(carol, 'plans/quorum'), { status: 'confirmed' })));
  await seed();
  await check('CANNOT confirm when quorum NOT reached',
    assertFails(updateDoc(doc(carol, 'plans/noquorum'), { status: 'confirmed' })));

  // ───────────────────────── Plans: join ─────────────────────────
  console.log('\nPlans — join:');
  await seed();
  await check('outsider can self-join a PUBLIC plan',
    assertSucceeds(updateDoc(doc(carol, 'plans/pub1'), { participants: ['alice', 'carol'] })));
  await seed();
  await check('outsider CANNOT self-join a PRIVATE plan (the leak)',
    assertFails(updateDoc(doc(carol, 'plans/priv2'), { participants: ['alice', 'carol'] })));
  await seed();
  await check('CANNOT join while also adding someone else',
    assertFails(updateDoc(doc(carol, 'plans/pub1'), { participants: ['alice', 'carol', 'dave'] })));
  await seed();
  await check('CANNOT "join" while removing an existing participant',
    assertFails(updateDoc(doc(carol, 'plans/pub1'), { participants: ['carol'] })));

  // ───────────────────────── Plans: leave ─────────────────────────
  console.log('\nPlans — leave:');
  await seed();
  await check('participant can leave (removes self)',
    assertSucceeds(updateDoc(doc(bob, 'plans/priv1'), { participants: ['alice'], votes: ['alice'] })));
  await seed();
  await check('outsider CANNOT "leave" a plan they are not in',
    assertFails(updateDoc(doc(carol, 'plans/priv1'), { participants: ['alice'], votes: ['alice'] })));
  await seed();
  await check('CANNOT remove someone OTHER than yourself',
    assertFails(updateDoc(doc(bob, 'plans/priv1'), { participants: ['bob'], votes: [] })));

  // ───────────────────────── Plans: collaborative content ─────────────────────────
  console.log('\nPlans — collaborative content:');
  await seed();
  await check('participant can add a comment',
    assertSucceeds(updateDoc(doc(bob, 'plans/priv1'), { 'comments.c1': { text: 'hi', authorId: 'bob' } })));
  await seed();
  await check('participant can add a photo + react',
    assertSucceeds(updateDoc(doc(bob, 'plans/priv1'), { 'reactions.fire': ['bob'] })));
  await seed();
  await check('outsider CANNOT add a comment to a private plan',
    assertFails(updateDoc(doc(carol, 'plans/priv2'), { 'comments.c1': { text: 'x', authorId: 'carol' } })));
  await seed();
  await check('participant CANNOT change the title (creator-only field)',
    assertFails(updateDoc(doc(bob, 'plans/priv1'), { title: 'Hijacked' })));
  await seed();
  await check('participant CANNOT flip isPublic',
    assertFails(updateDoc(doc(bob, 'plans/priv1'), { isPublic: true })));

  // ───────────────────────── Plans: delete ─────────────────────────
  console.log('\nPlans — delete:');
  await seed();
  await check('non-creator CANNOT delete a plan',
    assertFails(deleteDoc(doc(bob, 'plans/priv1'))));
  await seed();
  await check('creator CAN delete their plan',
    assertSucceeds(deleteDoc(doc(alice, 'plans/priv1'))));

  // ───────────────────────── Plans: moments subcollection ─────────────────────────
  console.log('\nPlans — moments subcollection:');
  await seed();
  await check('participant can add a moment',
    assertSucceeds(addDoc(collection(bob, 'plans/priv1/moments'), { url: 'x', uploadedBy: 'bob' })));
  await seed();
  await check('outsider CANNOT add a moment to a private plan',
    assertFails(addDoc(collection(carol, 'plans/priv2/moments'), { url: 'x', uploadedBy: 'carol' })));

  await testEnv.cleanup();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
