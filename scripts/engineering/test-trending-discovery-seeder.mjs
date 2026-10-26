import test from "node:test";
import assert from "node:assert/strict";
import {
  createPrng,
  generateActors,
  generatePastes,
  computeEngagementPlan,
  SUPPORTED_LANGUAGES,
  assertSafeEnvironment
} from "./lib/trending-seeder-lib.mjs";

test("trending-seeder-lib: PRNG is deterministic for the same seed", () => {
  const prng1 = createPrng(1337);
  const prng2 = createPrng(1337);
  const seq1 = [prng1(), prng1(), prng1(), prng1()];
  const seq2 = [prng2(), prng2(), prng2(), prng2()];
  assert.deepEqual(seq1, seq2);
});

test("trending-seeder-lib: PRNG varies across different seeds", () => {
  const prng1 = createPrng(1337);
  const prng2 = createPrng(9999);
  assert.notEqual(prng1(), prng2());
});

test("trending-seeder-lib: generates configured number of actors with runId prefix", () => {
  const runId = "test1234";
  const actors = generateActors(runId, 20);
  assert.equal(actors.length, 20);
  for (let i = 0; i < actors.length; i++) {
    assert.equal(actors[i].username, `syn_test1234_actor_${i + 1}`);
    assert.equal(actors[i].email, `syn_test1234_actor_${i + 1}@loadtest.local`);
    assert.equal(actors[i].password, "SynTestP@ssw0rd!123");
  }
});

test("trending-seeder-lib: generates configured public pastes across supported languages", () => {
  const runId = "test1234";
  const prng = createPrng(42);
  const pastes = generatePastes(runId, 40, prng);
  assert.equal(pastes.length, 40);

  const usedLanguages = new Set(pastes.map((p) => p.language));
  for (const lang of [
    "java", "javascript", "typescript", "python", "c", "cpp", "csharp",
    "go", "rust", "sql", "bash", "html", "css", "json", "yaml", "plaintext"
  ]) {
    assert.ok(usedLanguages.has(lang), `Expected language ${lang} to be represented`);
  }

  // All must be tagged with runId
  for (const paste of pastes) {
    assert.equal(paste.visibility, "PUBLIC");
    assert.equal(paste.expiration, "NEVER");
    assert.ok(paste.tags.includes(`loadtest-${runId}`));
    assert.ok(paste.title.includes(`[loadtest-${runId}]`));
  }
});

test("trending-seeder-lib: engagement plan distributes realistic popular, moderate, controversial and long-tail tiers", () => {
  const runId = "test1234";
  const prng = createPrng(100);
  const actors = generateActors(runId, 20);
  const pastes = generatePastes(runId, 40, prng);
  const plan = computeEngagementPlan(pastes, actors, prng);

  assert.equal(plan.length, 40);

  // Top popular pastes should have highest engagement
  const topTier = plan.filter((p) => p.tier === "TOP_POPULAR");
  assert.equal(topTier.length, 3);
  for (const item of topTier) {
    assert.ok(item.upvoteActors.length >= 12, "Top tier should have >= 12 upvotes");
    assert.ok(item.starActors.length >= 8, "Top tier should have >= 8 stars");
    assert.ok(item.viewCount >= 10, "Top tier should have >= 10 views");
    assert.equal(item.downvoteActors.length, 0);
  }

  // Controversial pastes have both upvotes and downvotes
  const controversial = plan.filter((p) => p.tier === "CONTROVERSIAL");
  assert.equal(controversial.length, 3);
  for (const item of controversial) {
    assert.ok(item.upvoteActors.length > 0);
    assert.ok(item.downvoteActors.length > 0);
    // Disjoint actors for upvote and downvote
    const upSet = new Set(item.upvoteActors);
    for (const d of item.downvoteActors) {
      assert.ok(!upSet.has(d), "An actor cannot both upvote and downvote simultaneously");
    }
  }

  // Long tail pastes should have low or zero engagement
  const longTail = plan.filter((p) => p.tier === "LONG_TAIL");
  assert.equal(longTail.length, 40 - 3 - 7 - 3); // 27
  for (const item of longTail) {
    assert.ok(item.upvoteActors.length <= 2);
    assert.ok(item.starActors.length <= 1);
  }
});

test("trending-seeder-lib: environment safety rejects production and unapproved remote hosts without force flag", () => {
  assert.throws(
    () => assertSafeEnvironment("https://extrabin.com", false),
    /Refusing to run against non-local host/
  );
  assert.throws(
    () => assertSafeEnvironment("https://api.production.extrabin.org", false),
    /Refusing to run against non-local host/
  );

  // Local hosts succeed
  assert.doesNotThrow(() => assertSafeEnvironment("http://localhost:8080", false));
  assert.doesNotThrow(() => assertSafeEnvironment("http://127.0.0.1:8080", false));

  // Force flag bypasses for dedicated disposable test environment
  assert.doesNotThrow(() => assertSafeEnvironment("https://staging.test.internal", true));
});
