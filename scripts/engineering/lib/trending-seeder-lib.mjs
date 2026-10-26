/**
 * Core business and dataset generation logic for the Trending & Discovery Load-Test Seeder.
 */

export const SUPPORTED_LANGUAGES = [
  "java",
  "javascript",
  "typescript",
  "python",
  "c",
  "cpp",
  "csharp",
  "go",
  "rust",
  "sql",
  "bash",
  "html",
  "css",
  "json",
  "yaml",
  "plaintext"
];

const CODE_SNIPPETS = {
  java: `public class TrendingBenchmark {\n    public static void main(String[] args) {\n        System.out.println("ExtraBin Trending Load Test - Java");\n    }\n}`,
  javascript: `function calculateVelocity(views, upvotes, stars) {\n    return views * 1.0 + upvotes * 2.0 + stars * 3.0;\n}\nconsole.log(calculateVelocity(100, 25, 10));`,
  typescript: `interface ActivityMetrics {\n    views: number;\n    upvotes: number;\n    stars: number;\n}\nexport const score = (m: ActivityMetrics): number => m.views + m.upvotes * 2 + m.stars * 3;`,
  python: `def compute_ranking(score: float, decay_factor: float = 0.95) -> float:\n    """Calculates engagement velocity score."""\n    return score * decay_factor\n\nprint(compute_ranking(150.0))`,
  c: `#include <stdio.h>\nint main(void) {\n    printf("ExtraBin discovery performance probe\\n");\n    return 0;\n}`,
  cpp: `#include <iostream>\n#include <vector>\nint main() {\n    std::vector<int> scores = {10, 20, 30};\n    std::cout << "Sum: " << scores.size() << std::endl;\n    return 0;\n}`,
  csharp: `using System;\nclass Program {\n    static void Main() {\n        Console.WriteLine("C# Discovery Ranking Algorithm Verification");\n    }\n}`,
  go: `package main\nimport "fmt"\nfunc main() {\n    fmt.Println("Go concurrency test for discovery feed")\n}`,
  rust: `fn main() {\n    let score: f64 = 42.0;\n    println!("Rust high-performance ranking: {}", score);\n}`,
  sql: `SELECT p.id, p.title, SUM(CASE WHEN a.event_type = 'STAR' THEN 3.0 ELSE 1.0 END) AS score\nFROM pastes p JOIN paste_activity_events a ON p.id = a.paste_id\nWHERE p.visibility = 'PUBLIC' GROUP BY p.id ORDER BY score DESC;`,
  bash: `#!/usr/bin/env bash\necho "Running discovery benchmark verification..."\ncurl -s -i "http://localhost:8080/api/v1/discovery/trending"`,
  html: `<!DOCTYPE html>\n<html lang="en">\n<head><title>Discovery Test</title></head>\n<body><h1>ExtraBin Discovery Feed</h1></body>\n</html>`,
  css: `:root {\n    --trending-highlight: #ff5722;\n    --rank-gold: #ffd700;\n}\n.paste-card { border-radius: 8px; padding: 16px; }`,
  json: `{\n  "benchmark": "discovery-loadtest",\n  "version": "1.0.0",\n  "targets": ["explore", "trending", "most-saved"]\n}`,
  yaml: `discovery:\n  algorithm: activity-weighted\n  weights:\n    view: 1.0\n    upvote: 2.0\n    star: 3.0\n  windows:\n    - 24h\n    - 7d\n    - 30d`,
  plaintext: `ExtraBin Trending & Discovery Load-Test Dataset\nDeterministic reproducible test record\nVerify that Explore, Trending, and Most Saved feeds rank accurately.`
};

/**
 * Linear Congruential Generator (LCG) PRNG for deterministic, reproducible test generation.
 */
export function createPrng(seed = 1337) {
  let state = seed ? Math.abs(Math.floor(seed)) : 1337;
  if (state === 0) state = 1;
  return function next() {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/**
 * Asserts the target environment is safe to run against.
 * Localhost is always permitted. Remote hosts strictly require forceRemote = true.
 */
export function assertSafeEnvironment(baseUrl, forceRemote = false) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`Invalid URL: ${baseUrl}`);
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost");

  if (!isLocal && !forceRemote) {
    throw new Error(
      `Refusing to run against non-local host '${hostname}'. For safety, load-testing against remote or shared environments requires explicit confirmation flag: --force-remote.`
    );
  }
}

/**
 * Generates synthetic user actor specifications.
 */
export function generateActors(runId, count = 20) {
  const actors = [];
  for (let i = 1; i <= count; i++) {
    const username = `syn_${runId}_actor_${i}`;
    const email = `syn_${runId}_actor_${i}@loadtest.local`;
    const password = "SynTestP@ssw0rd!123";
    actors.push({
      index: i,
      username,
      email,
      password
    });
  }
  return actors;
}

/**
 * Generates paste specifications across languages and varied lengths.
 */
export function generatePastes(runId, count = 40, prng = Math.random) {
  const pastes = [];
  const totalLangs = SUPPORTED_LANGUAGES.length;

  for (let i = 1; i <= count; i++) {
    // Round-robin first across all languages so every language is guaranteed
    const langIndex = (i - 1) % totalLangs;
    const language = SUPPORTED_LANGUAGES[langIndex];
    const baseCode = CODE_SNIPPETS[language] || CODE_SNIPPETS.plaintext;

    // Create varied content length (add repetition or commentary deterministically)
    const repeats = 1 + Math.floor(prng() * 3);
    const content = `${baseCode}\n\n// Run ID: ${runId} | Index: ${i} | Repetition count: ${repeats}\n${baseCode.repeat(
      repeats
    )}`;

    const title = `[loadtest-${runId}] ${language.toUpperCase()} Algorithmic Sample #${i}`;
    const tag = `loadtest-${runId}`;
    const extraTag = `lang-${language}`;

    pastes.push({
      index: i,
      title,
      content,
      language,
      visibility: "PUBLIC",
      expiration: "NEVER",
      tags: [tag, extraTag]
    });
  }

  return pastes;
}

/**
 * Distributes engagement into distinct tiers:
 * - Top Popular (3 pastes): high views, 12-18 upvotes, 8-15 stars
 * - Moderate (7 pastes): moderate views, 4-8 upvotes, 2-5 stars
 * - Controversial (3 pastes): moderate views, ~6-9 upvotes, ~5-8 downvotes, 0-1 stars
 * - Long Tail (remaining pastes): 0-2 views, 0-1 upvotes, 0 stars
 */
export function computeEngagementPlan(pastes, actors, prng = Math.random) {
  const plan = [];
  const numPastes = pastes.length;

  for (let i = 0; i < numPastes; i++) {
    const paste = pastes[i];
    let tier = "LONG_TAIL";
    let upvoteCount = 0;
    let downvoteCount = 0;
    let starCount = 0;
    let viewCount = 1;

    if (i < 3) {
      // Top Popular
      tier = "TOP_POPULAR";
      upvoteCount = Math.min(actors.length, 12 + Math.floor(prng() * (actors.length - 11)));
      starCount = Math.min(actors.length, 8 + Math.floor(prng() * 6));
      viewCount = 10 + Math.floor(prng() * 10);
    } else if (i < 10) {
      // Moderate Popular
      tier = "MODERATE";
      upvoteCount = Math.min(actors.length, 4 + Math.floor(prng() * 5)); // 4 to 8
      starCount = Math.min(actors.length, 2 + Math.floor(prng() * 4)); // 2 to 5
      viewCount = 4 + Math.floor(prng() * 5);
    } else if (i < 13) {
      // Controversial (mixed upvotes and downvotes)
      tier = "CONTROVERSIAL";
      upvoteCount = Math.min(Math.floor(actors.length / 2), 5 + Math.floor(prng() * 4)); // 5 to 8
      downvoteCount = Math.min(Math.floor(actors.length / 2), 4 + Math.floor(prng() * 4)); // 4 to 7
      starCount = Math.floor(prng() * 2); // 0 or 1
      viewCount = 5 + Math.floor(prng() * 5);
    } else {
      // Long Tail
      tier = "LONG_TAIL";
      upvoteCount = prng() > 0.7 ? 1 : 0;
      starCount = 0;
      viewCount = prng() > 0.5 ? 1 : 0;
    }

    // Assign specific unique actors for upvotes and downvotes (must be disjoint)
    // Shuffle actor indices deterministically
    const shuffledActors = [...actors].sort(() => prng() - 0.5);

    const upvoteActors = shuffledActors.slice(0, upvoteCount).map((a) => a.username);
    const downvoteActors = shuffledActors
      .slice(upvoteCount, upvoteCount + downvoteCount)
      .map((a) => a.username);

    // Stars can be given by any authenticated actor who also liked or viewed it
    const starActors = shuffledActors.slice(0, starCount).map((a) => a.username);

    // Expected Activity Score: VIEW (1.0) + UPVOTE (2.0) + STAR (3.0)
    // Note: each view recorded via PasteActivityEvent gives 1.0 (subject to 10-min dedup window per user/IP)
    const expectedScore = viewCount * 1.0 + upvoteCount * 2.0 + starCount * 3.0;

    plan.push({
      pasteIndex: paste.index,
      pasteTitle: paste.title,
      language: paste.language,
      tier,
      upvoteActors,
      downvoteActors,
      starActors,
      viewCount,
      expectedScore
    });
  }

  return plan;
}
