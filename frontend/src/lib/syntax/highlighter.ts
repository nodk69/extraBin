import React from 'react';
import Prism from 'prismjs';

// Ensure Prism is on global scope for language component plugins
if (typeof window !== 'undefined') {
  (window as unknown as { Prism: typeof Prism }).Prism = Prism;
}
if (typeof globalThis !== 'undefined') {
  (globalThis as unknown as { Prism: typeof Prism }).Prism = Prism;
}

// Import core base languages
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-markup'; // HTML, XML, SVG
import 'prismjs/components/prism-markup-templating';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-kotlin';


const LANGUAGE_MAP: Record<string, string> = {
  plaintext: 'plaintext',
  text: 'plaintext',
  java: 'java',
  javascript: 'javascript',
  js: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  python: 'python',
  py: 'python',
  html: 'markup',
  xml: 'markup',
  markup: 'markup',
  css: 'css',
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
  csharp: 'csharp',
  'c#': 'csharp',
  php: 'php',
  kotlin: 'kotlin',
  kt: 'kotlin',
};

/**
 * Highlights a full block of code using Prism.js.
 * Returns safe HTML with syntax span tokens.
 */
export function highlightCode(code: string, language: string): string {
  if (!code) return '';
  const langKey = LANGUAGE_MAP[language.toLowerCase()] || 'plaintext';
  const grammar = Prism.languages[langKey];

  if (!grammar) {
    return escapeHtml(code);
  }

  try {
    return Prism.highlight(code, grammar, langKey);
  } catch (err) {
    console.error('Syntax highlighting error:', err);
    return escapeHtml(code);
  }
}

/**
 * Tokenizes code into structured Prism tokens.
 */
export function tokenizeCode(code: string, language: string): (string | Prism.Token)[] {
  if (!code) return [];
  const langKey = LANGUAGE_MAP[language.toLowerCase()] || 'plaintext';
  const grammar = Prism.languages[langKey];
  if (!grammar) {
    return [code];
  }
  try {
    return Prism.tokenize(code, grammar);
  } catch (err) {
    console.error('Prism tokenize error:', err);
    return [code];
  }
}

/**
 * Recursively converts structured Prism tokens to React virtual DOM elements.
 * Every text leaf is rendered as a native React text node, guaranteeing 100%
 * mathematical immunity to XSS injection (no innerHTML parsing or execution).
 */
export function renderPrismTokenTree(
  tokens: (string | Prism.Token)[],
  keyPrefix = 'tok'
): React.ReactNode {
  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (typeof token === 'string') {
      return token;
    }

    const aliasClass = Array.isArray(token.alias)
      ? token.alias.join(' ')
      : token.alias || '';
    const className = `token ${token.type} ${aliasClass}`.trim();

    let childContent: React.ReactNode;
    if (typeof token.content === 'string') {
      childContent = token.content;
    } else if (Array.isArray(token.content)) {
      childContent = renderPrismTokenTree(token.content, key);
    } else if (token.content && typeof token.content === 'object') {
      childContent = renderPrismTokenTree([token.content as Prism.Token], key);
    } else {
      childContent = null;
    }

    return React.createElement('span', { key, className }, childContent);
  });
}

/**
 * Fully XSS-safe code highlighter that renders structured React nodes
 * without using dangerouslySetInnerHTML.
 */
export function renderSafeSyntaxHighlight(code: string, language: string): React.ReactNode {
  if (!code) return null;
  const tokens = tokenizeCode(code, language);
  return renderPrismTokenTree(tokens);
}


/**
 * Splits highlighted HTML into line-by-line HTML strings,
 * ensuring all open tags (e.g. multi-line comments, strings)
 * are properly closed at line ends and reopened on subsequent lines.
 */
export function splitHighlightedHtmlLines(html: string): string[] {
  if (!html) return [''];
  const rawLines = html.split('\n');
  const result: string[] = [];
  const openTags: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];
    if (openTags.length > 0) {
      line = openTags.join('') + line;
    }

    const tagRegex = /<\/?([a-z0-9-]+)(?:\s+[^>]*?)?>/gi;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(line)) !== null) {
      const fullTag = match[0];
      if (fullTag.startsWith('</')) {
        openTags.pop();
      } else if (!fullTag.endsWith('/>')) {
        openTags.push(fullTag);
      }
    }

    if (openTags.length > 0) {
      const closingTags = openTags
        .map((tag) => {
          const tagName = tag.match(/<([a-z0-9-]+)/i)?.[1] || 'span';
          return `</${tagName}>`;
        })
        .reverse()
        .join('');
      line = line + closingTags;
    }

    result.push(line);
  }

  return result;
}

/**
 * Highlights an entire code snippet as a single block and returns an array of
 * syntax-highlighted lines. This preserves multi-line syntax context (e.g., block comments,
 * multiline strings, annotations) that would fail when highlighting lines in isolation.
 */
export function highlightCodeToLines(code: string, language: string): string[] {
  if (!code) return [''];
  const langKey = LANGUAGE_MAP[language.toLowerCase()] || 'plaintext';
  const grammar = Prism.languages[langKey];

  if (!grammar) {
    return code.split('\n').map(escapeHtml);
  }

  try {
    const fullHtml = Prism.highlight(code, grammar, langKey);
    return splitHighlightedHtmlLines(fullHtml);
  } catch (err) {
    console.error('Syntax highlighting error:', err);
    return code.split('\n').map(escapeHtml);
  }
}


/**
 * Escapes raw HTML characters.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Automatic language detection from pasted code snippets.
 */
export function detectLanguageFromCode(code: string): string | null {
  const trimmed = code.trim();
  if (trimmed.length < 10) return null;

  // HTML / XML
  if (
    /^<!DOCTYPE\s+html/i.test(trimmed) ||
    /<html[\s>]/i.test(trimmed) ||
    (/<\/?[a-z][\s\S]*>/i.test(trimmed) && (trimmed.includes('</div>') || trimmed.includes('</script>') || trimmed.includes('<body') || trimmed.includes('<head')))
  ) {
    return 'html';
  }

  // Java
  if (
    /\b(public\s+class|package\s+[a-z0-9_.]+|import\s+java[x]?\.|System\.out\.println|@Override|@SpringBootApplication|@RestController|public\s+static\s+void\s+main)\b/.test(trimmed)
  ) {
    return 'java';
  }

  // TypeScript / JavaScript
  if (
    /\b(import\s+React|export\s+default|export\s+const|console\.log|const\s+\w+\s*:\s*[A-Z]|interface\s+\w+\s*\{|type\s+\w+\s*=|document\.getElementById|function\s+\w+\s*\(.*?\)\s*\{)\b/.test(trimmed)
  ) {
    if (trimmed.includes(': string') || trimmed.includes(': number') || trimmed.includes('interface ') || trimmed.includes('<React.')) {
      return 'typescript';
    }
    return 'javascript';
  }

  // Python
  if (
    /\b(def\s+\w+\s*\(.*?\):|import\s+os|from\s+\w+\s+import|if\s+__name__\s*==\s*['"]__main__['"]|print\()/.test(trimmed)
  ) {
    return 'python';
  }

  // SQL
  if (
    /\b(SELECT\s+[\s\S]+?\s+FROM|CREATE\s+TABLE|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|ALTER\s+TABLE)\b/i.test(trimmed)
  ) {
    return 'sql';
  }

  // JSON
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // ignore
    }
  }

  // Bash
  if (trimmed.startsWith('#!/bin/bash') || trimmed.startsWith('#!/bin/sh') || /\b(sudo\s+apt|chmod\s+\+x|curl\s+-s)\b/.test(trimmed)) {
    return 'bash';
  }

  // Rust
  if (/\b(fn\s+main\(\)|println!|let\s+mut\s+|impl\s+\w+|pub\s+fn)\b/.test(trimmed)) {
    return 'rust';
  }

  // Go
  if (/\b(package\s+main|func\s+main\(\)|fmt\.Println)\b/.test(trimmed)) {
    return 'go';
  }

  // C++ / C#
  if (/#include\s+<iostream>|std::cout/.test(trimmed)) {
    return 'cpp';
  }
  if (/using\s+System;|namespace\s+\w+|Console\.WriteLine/.test(trimmed)) {
    return 'csharp';
  }

  return null;
}
