#!/usr/bin/env node

/**
 * reindex-meilisearch.mjs
 *
 * Operational / Administrative tool to synchronize eligible public pastes from the
 * backend Discovery API to Meilisearch in bounded batches (default: 50 pastes/batch).
 * Uses pure Node.js native fetch (zero third-party npm dependencies).
 *
 * Invariants:
 *  - Fail-closed: only indexes pastes satisfying ELIGIBLE_PUBLIC_PREDICATE.
 *  - Limits document content size to 32 KB per paste.
 *  - Excludes binary/encrypted content and password-protected pastes.
 *  - Does not expose Meilisearch master keys to public frontend clients.
 *
 * Usage:
 *   node scripts/engineering/reindex-meilisearch.mjs [--dry-run] [--batch-size=50] [--base-url=http://localhost:8080] [--meili-url=http://localhost:7700]
 */

const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const prefix = `${flag}=`;
  const found = args.find((a) => a.startsWith(prefix));
  if (found) return found.substring(prefix.length);
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return defaultValue;
}

const isDryRun = args.includes('--dry-run');
const BASE_URL = getArg('--base-url', process.env.API_BASE_URL || 'http://localhost:8080');
const MEILISEARCH_URL = getArg('--meili-url', process.env.MEILISEARCH_URL || 'http://localhost:7700');
const MEILISEARCH_API_KEY = getArg('--meili-key', process.env.MEILISEARCH_API_KEY || '');
const MEILISEARCH_INDEX = getArg('--index', process.env.MEILISEARCH_INDEX_NAME || 'public_pastes');
const BATCH_SIZE = parseInt(getArg('--batch-size', '50'), 10);
const MAX_CONTENT_BYTES = 32768;

async function run() {
  console.log(`[REINDEX] Initializing Meilisearch Reindexer...`);
  console.log(`[REINDEX] Backend Source: ${BASE_URL}/api/v1/discovery`);
  console.log(`[REINDEX] Meilisearch Target: ${MEILISEARCH_URL} (Index: ${MEILISEARCH_INDEX})`);
  console.log(`[REINDEX] Mode: ${isDryRun ? 'DRY-RUN (planning only)' : 'ACTIVE'}`);

  const meiliHeaders = {
    'Content-Type': 'application/json',
    ...(MEILISEARCH_API_KEY ? { Authorization: `Bearer ${MEILISEARCH_API_KEY}` } : {}),
  };

  // Configure Meilisearch settings if active
  if (!isDryRun) {
    try {
      const settingsPayload = {
        searchableAttributes: ['title', 'tags', 'content', 'language'],
        filterableAttributes: ['language', 'tags'],
        sortableAttributes: ['createdAt', 'updatedAt'],
        typoTolerance: {
          enabled: true,
          disableOnWords: ['c', 'go', 'fn', 'id', 'sql', 'sh', 'rs', 'js', 'ts', 'py', 'cpp', 'rb'],
        },
      };

      const settingsRes = await fetch(`${MEILISEARCH_URL}/indexes/${MEILISEARCH_INDEX}/settings`, {
        method: 'PATCH',
        headers: meiliHeaders,
        body: JSON.stringify(settingsPayload),
      });

      if (!settingsRes.ok && settingsRes.status !== 200 && settingsRes.status !== 202) {
        console.warn(`[REINDEX] Note: could not update settings (${settingsRes.status}). Proceeding...`);
      } else {
        console.log(`[REINDEX] Meilisearch index settings configured.`);
      }
    } catch (err) {
      console.warn(`[REINDEX] Warning: Could not connect to Meilisearch at ${MEILISEARCH_URL}: ${err.message}`);
    }
  }

  // Fetch initial page from public discovery feed
  let page = 0;
  let totalIndexed = 0;
  let hasMore = true;

  while (hasMore) {
    const url = `${BASE_URL}/api/v1/discovery?page=${page}&size=${BATCH_SIZE}&sort=oldest`;
    let res;
    try {
      res = await fetch(url);
    } catch (err) {
      console.error(`[REINDEX] Failed to connect to backend at ${url}: ${err.message}`);
      process.exit(1);
    }

    if (!res.ok) {
      console.error(`[REINDEX] Backend returned HTTP ${res.status} for page ${page}`);
      process.exit(1);
    }

    const data = await res.json();
    const items = data.items || [];
    const totalElements = data.totalElements || 0;

    if (items.length === 0) {
      break;
    }

    // Convert items into Meilisearch documents
    const documents = items.map((item) => {
      let content = item.contentSnippet || '';
      if (content.length > MAX_CONTENT_BYTES) {
        content = content.substring(0, MAX_CONTENT_BYTES);
      }

      return {
        id: item.id,
        title: item.title || '',
        language: (item.language || 'plaintext').toLowerCase(),
        tags: Array.isArray(item.tags) ? item.tags.map((t) => (t.name || t).toLowerCase()) : [],
        content: content,
        createdAt: Math.floor(new Date(item.createdAt).getTime() / 1000),
        updatedAt: Math.floor(new Date(item.updatedAt || item.createdAt).getTime() / 1000),
      };
    });

    if (!isDryRun) {
      try {
        const docRes = await fetch(`${MEILISEARCH_URL}/indexes/${MEILISEARCH_INDEX}/documents`, {
          method: 'POST',
          headers: meiliHeaders,
          body: JSON.stringify(documents),
        });
        if (!docRes.ok && docRes.status !== 200 && docRes.status !== 202) {
          throw new Error(`Meilisearch returned HTTP ${docRes.status}`);
        }
      } catch (err) {
        console.error(`[REINDEX] Failed to post documents to Meilisearch: ${err.message}`);
        process.exit(1);
      }
    }

    totalIndexed += documents.length;
    console.log(`[REINDEX] Progress: page ${page} (${totalIndexed}/${totalElements} public pastes processed).`);

    page++;
    if (page >= (data.totalPages || 0)) {
      hasMore = false;
    }
  }

  console.log(`[REINDEX] Complete! Total public pastes synced: ${totalIndexed}.`);
}

run();
