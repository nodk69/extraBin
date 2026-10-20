import { ShowcaseFile, ShowcaseScene, ShowcaseTarget } from './types';

export const SHOWCASE_FILES: ShowcaseFile[] = [
  {
    id: 'demo:main.js',
    filename: 'main.js',
    language: 'javascript',
    content: `// A fast token-bucket rate limiter
class TokenBucket {
  constructor(capacity = 60, refillRate = 1) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  take(count = 1) {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}
`,
  },
  {
    id: 'demo:User.java',
    filename: 'User.java',
    language: 'java',
    content: `package com.pastebin.user;

import java.time.Instant;

public record User(
    String id,
    String email,
    String role,
    Instant createdAt
) {}
`,
  },
  {
    id: 'demo:UserService.java',
    filename: 'UserService.java',
    language: 'java',
    content: `package com.pastebin.user;

import org.springframework.stereotype.Service;
import java.time.Instant;
import java.util.Optional;

@Service
public class UserService {
    public Optional<User> findById(String id) {
        return Optional.of(new User(
            id,
            "engineer@extrabin.app",
            "ADMIN",
            Instant.now()
        ));
    }
}
`,
  },
  {
    id: 'demo:application.yml',
    filename: 'application.yml',
    language: 'yaml',
    content: `server:
  port: 8080

extrabin:
  security:
    rate-limit: 100
    encryption: AES-256-GCM
  storage:
    max-files-per-paste: 20
    max-size-bytes: 1048576
`,
  },
];

/**
 * The demo timeline (15 seconds total).
 * Story: paste → protect → share → trust.
 * Claims mirror actual application capabilities:
 * - 20-file limit enforced in CreatePastePage & Paste.java
 * - Expiration policies (TEN_MINUTES to NEVER)
 * - Private pastes require login
 * - Burn after reading self-destructs on view
 * - Raw curl route (/raw/:id) and embed route (/embed/:id)
 * - Revision diffs and localStorage draft recovery
 */
export const SHOWCASE_SCENES: ReadonlyArray<{
  id: Exclude<ShowcaseScene, 'complete'>;
  step: string;
  title: string;
  body: string;
  target: ShowcaseTarget;
  durationMs: number;
}> = [
  {
    id: 'paste',
    step: '01',
    title: 'Paste anything. We detect the language.',
    body: 'Auto language detection plus Shiki syntax highlighting. Type or drag & drop.',
    target: 'textarea',
    durationMs: 3000,
  },
  {
    id: 'files',
    step: '02',
    title: 'Up to 20 files. One link.',
    body: 'Each with its own tab, custom filename, and syntax.',
    target: 'tabs',
    durationMs: 2000,
  },
  {
    id: 'protect',
    step: '03',
    title: 'Public, unlisted or private. Add a password. Or burn after reading.',
    body: 'Control who sees it. Private needs an account, and sensitive code self-destructs.',
    target: 'visibility',
    durationMs: 3000,
  },
  {
    id: 'expiry',
    step: '04',
    title: 'Set it to disappear.',
    body: 'From 10 minutes to a year, or never. Automated background cleanup.',
    target: 'expiry',
    durationMs: 1500,
  },
  {
    id: 'share',
    step: '05',
    title: 'Copy it, scan it, curl it, embed it.',
    body: '(Preview only.) One short link, mobile QR, curl via /raw/:id, or embed iframe.',
    target: 'create',
    durationMs: 3500,
  },
  {
    id: 'trust',
    step: '06',
    title: 'Edits tracked. Drafts never lost.',
    body: 'Revision history with line diffs. Unsaved edits autosave locally with crash recovery.',
    target: 'textarea',
    durationMs: 2000,
  },
];

/** Ghost values shown in the settings panel during the demo (visual only). */
export const SHOWCASE_GHOST = {
  expiry: 'SIX_MONTHS',
  exposure: 'PRIVATE',
} as const;

/** Friendly labels for the language badge flip ("Detecting…" -> "JavaScript ✓"). */
export const SHOWCASE_LANGUAGE_LABELS: Record<string, string> = {
  javascript: 'JavaScript',
  java: 'Java',
  yaml: 'YAML',
  typescript: 'TypeScript',
  python: 'Python',
  plaintext: 'Plain Text',
};

export const SHOWCASE_PREVIEW = {
  demoId: 'demo-7x9k',
  simulatedUrl: 'extrabin.example/p/xxxxxx',
  title: 'RateLimiter & User Services (4 files)',
  totalFiles: 4,
  visibility: 'Unlisted',
  expiry: '6 months',
  hasPassword: true,
  demoPasswordPlaceholder: 'demo-sec-2026',
  curlSnippet: 'curl -s https://extrabin.example/raw/xxxxxx',
  embedSnippet: '<iframe src="https://extrabin.example/embed/xxxxxx" width="100%" height="450" frameborder="0"></iframe>',
};
