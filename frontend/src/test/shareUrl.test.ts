import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildCanonicalShareUrl,
  buildMarkdownShareLink,
  extractKeyFragment,
  normalizeBaseUrl,
  resolvePublicBaseUrl,
} from '../features/pastes/lib/shareUrl';

/**
 * Unit contract of the canonical share-URL builder.
 *
 * The integration suites (ShareExperience, SharingEverywhereUi) exercise the
 * builder through the paste view; this suite pins the edge cases of the base
 * URL itself, which no page-level test can isolate: trailing slashes, blank
 * configuration, and absent configuration.
 */
describe('shareUrl: canonical share URL', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('normalizeBaseUrl', () => {
    it('strips trailing slashes and surrounding whitespace', () => {
      expect(normalizeBaseUrl('https://bin.example/')).toBe('https://bin.example');
      expect(normalizeBaseUrl('https://bin.example///')).toBe('https://bin.example');
      expect(normalizeBaseUrl('  https://bin.example/  ')).toBe('https://bin.example');
      expect(normalizeBaseUrl('https://bin.example')).toBe('https://bin.example');
    });

    it('returns an empty string for absent, empty, or whitespace-only input', () => {
      expect(normalizeBaseUrl(undefined)).toBe('');
      expect(normalizeBaseUrl(null)).toBe('');
      expect(normalizeBaseUrl('')).toBe('');
      expect(normalizeBaseUrl('   ')).toBe('');
    });
  });

  describe('resolvePublicBaseUrl', () => {
    it('prefers the configured VITE_PUBLIC_BASE_URL and strips its trailing slash', () => {
      vi.stubEnv('VITE_PUBLIC_BASE_URL', 'https://bin.example/');
      expect(resolvePublicBaseUrl()).toBe('https://bin.example');
    });

    it('falls back to the current origin when the variable is absent', () => {
      expect(resolvePublicBaseUrl()).toBe(window.location.origin);
    });

    it('falls back to the current origin when the variable is empty or whitespace-only', () => {
      vi.stubEnv('VITE_PUBLIC_BASE_URL', '');
      expect(resolvePublicBaseUrl()).toBe(window.location.origin);

      vi.stubEnv('VITE_PUBLIC_BASE_URL', '   ');
      expect(resolvePublicBaseUrl()).toBe(window.location.origin);
    });
  });

  describe('buildCanonicalShareUrl', () => {
    it('builds <base>/p/<id> and never doubles the separator', () => {
      vi.stubEnv('VITE_PUBLIC_BASE_URL', 'https://bin.example/');
      expect(buildCanonicalShareUrl({ pasteId: 'abc123' })).toBe('https://bin.example/p/abc123');
    });

    it('falls back to the current origin when no base is configured', () => {
      expect(buildCanonicalShareUrl({ pasteId: 'abc123' })).toBe(`${window.location.origin}/p/abc123`);
    });

    it('adds the file segment only when a file is on screen', () => {
      expect(buildCanonicalShareUrl({ pasteId: 'abc123', fileId: 202 })).toBe(
        `${window.location.origin}/p/abc123/file/202`
      );
      expect(buildCanonicalShareUrl({ pasteId: 'abc123', fileId: null })).toBe(
        `${window.location.origin}/p/abc123`
      );
      expect(buildCanonicalShareUrl({ pasteId: 'abc123', fileId: undefined })).toBe(
        `${window.location.origin}/p/abc123`
      );
      expect(buildCanonicalShareUrl({ pasteId: 'abc123', fileId: '' })).toBe(
        `${window.location.origin}/p/abc123`
      );
    });

    it('puts the share token in the query and the key in the fragment', () => {
      const url = buildCanonicalShareUrl({
        pasteId: 'abc123',
        token: 'shr_token',
        keyFragment: 'secretkey',
      });
      expect(url).toBe(`${window.location.origin}/p/abc123?token=shr_token#key=secretkey`);
    });

    it('omits the token and the key when they are absent', () => {
      const url = buildCanonicalShareUrl({ pasteId: 'abc123' });
      expect(url).not.toContain('token=');
      expect(url).not.toContain('#');
    });

    it('percent-encodes the paste id, the token, and the key', () => {
      const url = buildCanonicalShareUrl({
        pasteId: 'a b/c',
        token: 'shr+token',
        keyFragment: 'a/b',
      });
      expect(url).toBe(`${window.location.origin}/p/a%20b%2Fc?token=shr%2Btoken#key=a%2Fb`);
    });
  });

  describe('extractKeyFragment', () => {
    it('reads the key out of a #key= fragment', () => {
      expect(extractKeyFragment('#key=abc123')).toBe('abc123');
      expect(extractKeyFragment('#key=abc123&other=1')).toBe('abc123');
    });

    it('decodes percent escapes', () => {
      expect(extractKeyFragment('#key=a%2Bb')).toBe('a+b');
    });

    it('returns the raw value for a malformed percent escape instead of throwing', () => {
      expect(extractKeyFragment('#key=100%')).toBe('100%');
    });

    it('returns null when the hash carries no key', () => {
      expect(extractKeyFragment(null)).toBeNull();
      expect(extractKeyFragment('')).toBeNull();
      expect(extractKeyFragment('#section')).toBeNull();
      expect(extractKeyFragment('#key=')).toBeNull();
    });
  });

  describe('buildMarkdownShareLink', () => {
    it('renders a Markdown link', () => {
      expect(buildMarkdownShareLink('My Paste', 'https://bin.example/p/abc123')).toBe(
        '[My Paste](https://bin.example/p/abc123)'
      );
    });

    it('strips brackets from the title so the Markdown cannot be broken', () => {
      expect(buildMarkdownShareLink('a[b]c', 'https://bin.example/p/abc123')).toBe(
        '[abc](https://bin.example/p/abc123)'
      );
    });

    it('falls back to a generic title', () => {
      expect(buildMarkdownShareLink('', 'https://bin.example/p/abc123')).toBe(
        '[Paste](https://bin.example/p/abc123)'
      );
    });
  });
});
