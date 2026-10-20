// performance-tests/stage0-contract.js
// Stage 0: Single-User Functional Contract Validation
//
// Validates functional correctness of all critical endpoints before running
// multi-user load tests. Tests the exact HTTP contracts, status codes, and
// atomic behaviors (such as view-once consumption).
//
// Target: Backend direct (port 8080) by default, or Nginx (port 80) if EDGE_MODE=true.

import http from 'k6/http';
import { check, group } from 'k6';
import { API_BASE, ACTUATOR_URL, PASTE_CONTENT, PASTE_TITLE, getCsrfHeaders } from './config.js';

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ['rate==1.0'], // 100% of functional assertions must pass
  },
};

export default function () {
  group('01 - Actuator Health Check', function () {
    const res = http.get(`${ACTUATOR_URL}/actuator/health`);
    check(res, {
      'health check status is 200': (r) => r.status === 200,
      'health status is UP': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.status === 'UP';
        } catch (_) {
          return false;
        }
      },
    });
  });

  // Obtain CSRF token headers
  const authHeaders = getCsrfHeaders();

  let publicPasteId = null;
  let publicPasteSecret = null;

  group('02 - Create Public Paste', function () {
    const payload = JSON.stringify({
      title: PASTE_TITLE,
      content: PASTE_CONTENT,
      language: 'javascript',
      visibility: 'PUBLIC',
      expiration: 'NEVER',
    });

    const res = http.post(`${API_BASE}/pastes`, payload, { headers: authHeaders });
    const ok = check(res, {
      'create public paste status is 201': (r) => r.status === 201,
      'create response has id': (r) => {
        try {
          const body = JSON.parse(r.body);
          return !!body.id;
        } catch (_) {
          return false;
        }
      },
      'create response has deletionCapability': (r) => {
        try {
          const body = JSON.parse(r.body);
          return typeof body.deletionCapability !== 'undefined';
        } catch (_) {
          return false;
        }
      },
    });

    if (ok) {
      const data = JSON.parse(res.body);
      publicPasteId = data.id;
      publicPasteSecret = data.deletionCapability;
    }
  });

  group('03 - Read Public Paste (JSON)', function () {
    if (!publicPasteId) return;

    const res = http.get(`${API_BASE}/pastes/${publicPasteId}`);
    check(res, {
      'read paste status is 200': (r) => r.status === 200,
      'read paste has matching content': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.content === PASTE_CONTENT;
        } catch (_) {
          return false;
        }
      },
      'read paste has matching title': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.title === PASTE_TITLE;
        } catch (_) {
          return false;
        }
      },
    });
  });

  group('04 - Read Typed Paste (.txt & .json extensions)', function () {
    if (!publicPasteId) return;

    const txtRes = http.get(`${API_BASE}/pastes/${publicPasteId}.txt`);
    check(txtRes, {
      'read .txt status is 200': (r) => r.status === 200,
      'read .txt content-type is text/plain': (r) =>
        r.headers['Content-Type'] && r.headers['Content-Type'].includes('text/plain'),
    });

    const jsonRes = http.get(`${API_BASE}/pastes/${publicPasteId}.json`);
    check(jsonRes, {
      'read .json status is 200': (r) => r.status === 200,
    });
  });

  group('05 - Star and Unstar Authentication Enforcement', function () {
    if (!publicPasteId) return;

    // The backend requires authentication (Sign in required) to star or unstar pastes.
    // When called anonymously, it must enforce 401 Unauthorized.
    const starRes = http.post(`${API_BASE}/pastes/${publicPasteId}/star`, null, { headers: authHeaders });
    check(starRes, {
      'anonymous star paste status is 401': (r) => r.status === 401,
    });

    const unstarRes = http.del(`${API_BASE}/pastes/${publicPasteId}/star`, null, { headers: authHeaders });
    check(unstarRes, {
      'anonymous unstar paste status is 401': (r) => r.status === 401,
    });
  });

  group('06 - Vote and Retract Vote', function () {
    if (!publicPasteId) return;

    const upvotePayload = JSON.stringify({ voteType: 'UP' });
    const voteRes = http.post(`${API_BASE}/pastes/${publicPasteId}/vote`, upvotePayload, { headers: authHeaders });
    check(voteRes, {
      'upvote status is 200': (r) => r.status === 200,
      'upvotes count >= 1': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.upvotes >= 1 && body.userVote === 'UP';
        } catch (_) {
          return false;
        }
      },
    });

    const retractRes = http.del(`${API_BASE}/pastes/${publicPasteId}/vote`, null, { headers: authHeaders });
    check(retractRes, {
      'retract vote status is 200': (r) => r.status === 200,
      'userVote is null after retract': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.userVote === null;
        } catch (_) {
          return false;
        }
      },
    });
  });

  let viewOncePasteId = null;

  group('07 - View-Once Functional Validation (Sequential)', function () {
    const payload = JSON.stringify({
      title: 'view-once-test',
      content: 'This will burn on first read.',
      language: 'text',
      visibility: 'PUBLIC',
      expiration: 'VIEW_ONCE',
    });

    const createRes = http.post(`${API_BASE}/pastes`, payload, { headers: authHeaders });
    const ok = check(createRes, {
      'create view-once paste status is 201': (r) => r.status === 201,
    });

    if (ok) {
      const data = JSON.parse(createRes.body);
      viewOncePasteId = data.id;

      // 1st Read: Must succeed (200)
      const firstRead = http.get(`${API_BASE}/pastes/${viewOncePasteId}`);
      check(firstRead, {
        'first read of view-once paste returns 200': (r) => r.status === 200,
      });

      // 2nd Read: Must return 404 (burned)
      const secondRead = http.get(`${API_BASE}/pastes/${viewOncePasteId}`);
      check(secondRead, {
        'second read of view-once paste returns 404': (r) => r.status === 404,
      });
    }
  });

  group('08 - Unlisted Paste With Share Token', function () {
    const payload = JSON.stringify({
      title: 'unlisted-test',
      content: 'Secret unlisted content',
      language: 'text',
      visibility: 'UNLISTED',
      expiration: 'NEVER',
    });

    const createRes = http.post(`${API_BASE}/pastes`, payload, { headers: authHeaders });
    let unlistedId = null;
    let shareToken = null;

    if (createRes.status === 201) {
      const data = JSON.parse(createRes.body);
      unlistedId = data.id;
      shareToken = data.shareToken;
    }

    if (unlistedId && shareToken) {
      // Access without token → Should fail (404 to avoid leaking existence)
      const noTokenRes = http.get(`${API_BASE}/pastes/${unlistedId}`);
      check(noTokenRes, {
        'unlisted without token returns 404': (r) => r.status === 404,
      });

      // Access with shareToken query param → 200
      const tokenRes = http.get(`${API_BASE}/pastes/${unlistedId}?token=${shareToken}`);
      check(tokenRes, {
        'unlisted with token returns 200': (r) => r.status === 200,
      });
    }
  });

  group('09 - Anonymous Delete with Capability Token', function () {
    if (!publicPasteId || !publicPasteSecret) return;

    const delHeaders = Object.assign({}, authHeaders, {
      'X-Deletion-Capability': publicPasteSecret,
    });
    const delPayload = JSON.stringify({ deletionCapability: publicPasteSecret });

    const delRes = http.post(
      `${API_BASE}/pastes/${publicPasteId}/delete-anonymous`,
      delPayload,
      { headers: delHeaders }
    );
    check(delRes, {
      'delete anonymous status is 200 or 204': (r) => r.status === 200 || r.status === 204,
    });

    // Verify paste is now gone
    const verifyRes = http.get(`${API_BASE}/pastes/${publicPasteId}`);
    check(verifyRes, {
      'deleted paste returns 404': (r) => r.status === 404,
    });
  });
}
