import { useState, useEffect, useMemo } from 'react';
import { codeToHtml, type BundledLanguage, type BundledTheme } from 'shiki';
import { highlightCodeToLines, detectLanguageFromCode, escapeHtml } from './highlighter';

export { detectLanguageFromCode };

const SHIKI_LANGUAGE_MAP: Record<string, BundledLanguage | null> = {
  plaintext: null,
  text: null,


  java: 'java',
  javascript: 'javascript',
  js: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  html: 'html',
  xml: 'xml',
  css: 'css',
  python: 'python',
  py: 'python',
  sql: 'sql',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  markdown: 'markdown',
  md: 'markdown',
  go: 'go',
  rust: 'rust',
  cpp: 'cpp',
  'c++': 'cpp',
  c: 'c',
  csharp: 'csharp',
  'c#': 'csharp',
  php: 'php',
  kotlin: 'kotlin',
  kt: 'kotlin',
};

const cache = new Map<string, string>();

/**
 * Extracts line-by-line inner HTML strings from Shiki's rendered output.
 * Each item in the returned array represents one source code line with its
 * full TextMate inline token styling intact.
 */
export function extractShikiLines(html: string): string[] {
  if (!html) return [''];
  const codeMatch = html.match(/<code>([\s\S]*?)<\/code>/);
  if (!codeMatch) return html.split('\n');

  const lines = codeMatch[1].split('\n');
  return lines.map((line) => {
    return line.replace(/^<span class="line">/, '').replace(/<\/span>$/, '');
  });
}

/**
 * Highlights code using Shiki (VS Code TextMate engine).
 * Produces accurate, inline-styled HTML matching VS Code's Tokyo Night theme.
 */
export async function highlightWithShiki(
  code: string,
  language: string,
  theme: BundledTheme = 'tokyo-night'
): Promise<string> {
  if (!code) return '';
  const langKey = language.toLowerCase();
  const bundledLang = SHIKI_LANGUAGE_MAP[langKey];

  if (!bundledLang) {
    return escapeHtml(code);
  }


  const cacheKey = `${theme}:${bundledLang}:${code}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  try {
    const html = await codeToHtml(code, {
      lang: bundledLang,
      theme,
    });
    cache.set(cacheKey, html);
    return html;
  } catch (err) {
    console.warn('Shiki highlighting fallback to Prism:', err);
    return highlightCodeToLines(code, language).join('\n');
  }
}

/**
 * React hook that leverages Shiki (VS Code TextMate engine) for syntax highlighting.
 * Returns an array of line HTMLs with instant Prism fallback while Shiki initializes,
 * ensuring zero layout shift or delay, followed by 100% accurate TextMate inline tokens.
 */
export function useShikiHighlight(code: string, language: string): string[] {
  const initialLines = useMemo(() => highlightCodeToLines(code, language), [code, language]);
  const [highlightedLines, setHighlightedLines] = useState<string[]>(initialLines);

  useEffect(() => {
    let cancelled = false;

    // Fast path for empty content
    if (!code) {
      setHighlightedLines(['']);
      return;
    }

    // Set immediate synchronous lines first
    setHighlightedLines(highlightCodeToLines(code, language));

    highlightWithShiki(code, language)
      .then((html) => {
        if (!cancelled && html) {
          const lines = extractShikiLines(html);
          setHighlightedLines(lines);
        }
      })
      .catch((err) => {
        console.warn('Shiki hook highlight error:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [code, language]);

  return highlightedLines;
}
