/**
 * Canonical share-URL construction.
 *
 * The canonical share URL of a paste is the only URL that is safe to hand to
 * somebody else. It is built from four parts and nothing else:
 *
 *   <base>/p/<pasteId>[/file/<fileId>][?token=<shareToken>][#key=<e2eKey>]
 *
 * Invariants enforced here (see docs/api-contract.md and docs/security.md):
 *
 *  - The base comes from `VITE_PUBLIC_BASE_URL` when it is configured, and from
 *    the current origin otherwise. Trailing slashes are always stripped so a
 *    configured `https://bin.example/` never yields `https://bin.example//p/...`.
 *  - The share token is only ever attached by the caller for UNLISTED pastes.
 *    A PUBLIC or PRIVATE paste must never leak a (possibly stale) token.
 *  - The end-to-end key lives in the fragment only. Fragments are never sent to
 *    a server, which is what keeps the decryption key out of access logs.
 *  - Passwords, unlock tokens and deletion capabilities are never part of a
 *    share URL.
 */

const TRAILING_SLASHES = /\/+$/;

/** Strips trailing slashes and surrounding whitespace from a base URL. */
export function normalizeBaseUrl(baseUrl?: string | null): string {
  if (typeof baseUrl !== 'string') return '';
  const trimmed = baseUrl.trim();
  if (!trimmed) return '';
  return trimmed.replace(TRAILING_SLASHES, '');
}

/**
 * The public origin of this deployment.
 *
 * `VITE_PUBLIC_BASE_URL` wins when it is present and non-blank; otherwise the
 * origin the browser is currently on is used.
 */
export function resolvePublicBaseUrl(): string {
  const configured = normalizeBaseUrl(import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined);
  if (configured) return configured;
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return normalizeBaseUrl(window.location.origin);
  }
  return '';
}

/**
 * Extracts the end-to-end decryption key from a location hash.
 *
 * Returns the decoded key (without the `#key=` prefix) or `null` when the hash
 * carries no key. A malformed percent-escape is returned verbatim rather than
 * throwing, because a broken link must not break the page.
 */
export function extractKeyFragment(hash?: string | null): string | null {
  if (typeof hash !== 'string') return null;
  if (!hash.startsWith('#key=')) return null;
  const raw = hash.substring('#key='.length).split('&')[0];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export interface CanonicalShareUrlOptions {
  /** Base URL; falls back to {@link resolvePublicBaseUrl} when omitted. */
  baseUrl?: string | null;
  /** Public paste id. */
  pasteId: string;
  /** Numeric file id when a specific file of a multi-file paste is selected. */
  fileId?: number | string | null;
  /** Share token — only pass this for UNLISTED pastes. */
  token?: string | null;
  /** End-to-end decryption key, rendered into the fragment. */
  keyFragment?: string | null;
}

/** Builds the canonical share URL of a paste (or of one file of a paste). */
export function buildCanonicalShareUrl(options: CanonicalShareUrlOptions): string {
  const base = normalizeBaseUrl(options.baseUrl) || resolvePublicBaseUrl();
  let url = `${base}/p/${encodeURIComponent(options.pasteId)}`;

  if (options.fileId !== undefined && options.fileId !== null && options.fileId !== '') {
    url += `/file/${encodeURIComponent(String(options.fileId))}`;
  }
  if (options.token) {
    url += `?token=${encodeURIComponent(options.token)}`;
  }
  if (options.keyFragment) {
    url += `#key=${encodeURIComponent(options.keyFragment)}`;
  }
  return url;
}

/** Builds the Markdown snippet that embeds the canonical share URL. */
export function buildMarkdownShareLink(title: string, url: string): string {
  const safeTitle = (title || 'Paste').replace(/[\[\]]/g, '');
  return `[${safeTitle}](${url})`;
}
