/**
 * Language Registry, Extension Mapping, and Heuristic Detection Pipeline.
 *
 * Provides:
 * 1. Canonical Language ID definitions and metadata.
 * 2. Bi-directional Language <-> Extension resolution.
 * 3. Filename-based language inference.
 * 4. Content-based heuristic language detection (offline, safe, regex/structural).
 * 5. Filename extension synchronization helpers.
 */

export interface LanguageDefinition {
  id: string;
  name: string;
  extensions: string[];
  primaryExtension: string;
  aliases: string[];
}

export const LANGUAGE_REGISTRY: Record<string, LanguageDefinition> = {
  javascript: {
    id: 'javascript',
    name: 'JavaScript',
    extensions: ['js', 'mjs', 'cjs'],
    primaryExtension: 'js',
    aliases: ['js', 'node'],
  },
  typescript: {
    id: 'typescript',
    name: 'TypeScript',
    extensions: ['ts', 'tsx', 'mts', 'cts'],
    primaryExtension: 'ts',
    aliases: ['ts', 'tsx'],
  },
  python: {
    id: 'python',
    name: 'Python',
    extensions: ['py', 'pyw'],
    primaryExtension: 'py',
    aliases: ['py', 'python3'],
  },
  java: {
    id: 'java',
    name: 'Java',
    extensions: ['java'],
    primaryExtension: 'java',
    aliases: [],
  },
  c: {
    id: 'c',
    name: 'C',
    extensions: ['c', 'h'],
    primaryExtension: 'c',
    aliases: [],
  },
  cpp: {
    id: 'cpp',
    name: 'C++',
    extensions: ['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx'],
    primaryExtension: 'cpp',
    aliases: ['c++', 'cxx'],
  },
  csharp: {
    id: 'csharp',
    name: 'C#',
    extensions: ['cs'],
    primaryExtension: 'cs',
    aliases: ['c#', 'cs'],
  },
  bash: {
    id: 'bash',
    name: 'Bash / Shell',
    extensions: ['sh', 'bash', 'zsh'],
    primaryExtension: 'sh',
    aliases: ['sh', 'shell', 'zsh'],
  },
  sql: {
    id: 'sql',
    name: 'SQL',
    extensions: ['sql'],
    primaryExtension: 'sql',
    aliases: [],
  },
  json: {
    id: 'json',
    name: 'JSON',
    extensions: ['json'],
    primaryExtension: 'json',
    aliases: [],
  },
  yaml: {
    id: 'yaml',
    name: 'YAML',
    extensions: ['yaml', 'yml'],
    primaryExtension: 'yaml',
    aliases: ['yml'],
  },
  html: {
    id: 'html',
    name: 'HTML',
    extensions: ['html', 'htm'],
    primaryExtension: 'html',
    aliases: ['htm', 'markup'],
  },
  css: {
    id: 'css',
    name: 'CSS',
    extensions: ['css'],
    primaryExtension: 'css',
    aliases: [],
  },
  go: {
    id: 'go',
    name: 'Go',
    extensions: ['go'],
    primaryExtension: 'go',
    aliases: ['golang'],
  },
  rust: {
    id: 'rust',
    name: 'Rust',
    extensions: ['rs'],
    primaryExtension: 'rs',
    aliases: [],
  },
  php: {
    id: 'php',
    name: 'PHP',
    extensions: ['php'],
    primaryExtension: 'php',
    aliases: [],
  },
  kotlin: {
    id: 'kotlin',
    name: 'Kotlin',
    extensions: ['kt', 'kts'],
    primaryExtension: 'kt',
    aliases: ['kt'],
  },
  markdown: {
    id: 'markdown',
    name: 'Markdown',
    extensions: ['md', 'markdown'],
    primaryExtension: 'md',
    aliases: ['md'],
  },
  xml: {
    id: 'xml',
    name: 'XML',
    extensions: ['xml', 'svg'],
    primaryExtension: 'xml',
    aliases: ['svg'],
  },
  plaintext: {
    id: 'plaintext',
    name: 'Plain Text',
    extensions: ['txt', 'text', 'log'],
    primaryExtension: 'txt',
    aliases: ['text', 'txt'],
  },
};

/**
 * Normalizes any language alias or extension to its canonical Language ID.
 */
export function normalizeLanguageId(rawLang: string | null | undefined): string {
  if (!rawLang) return 'plaintext';
  const clean = rawLang.trim().toLowerCase();
  if (LANGUAGE_REGISTRY[clean]) return clean;

  for (const [id, def] of Object.entries(LANGUAGE_REGISTRY)) {
    if (def.aliases.includes(clean) || def.extensions.includes(clean)) {
      return id;
    }
  }
  return 'plaintext';
}

/**
 * Gets the primary file extension for a given language.
 */
export function getPrimaryExtensionForLanguage(langId: string): string {
  const canonical = normalizeLanguageId(langId);
  return LANGUAGE_REGISTRY[canonical]?.primaryExtension || 'txt';
}

/**
 * Infers language ID from a filename extension or full path.
 */
export function detectLanguageFromFilename(filename: string): string | null {
  if (!filename) return null;
  const basename = filename.split(/[/\\]/).pop() || filename;

  // Exact special filename matches
  const lower = basename.toLowerCase();
  if (lower === 'dockerfile') return 'bash';
  if (lower === 'makefile') return 'bash';
  if (lower === '.bashrc' || lower === '.zshrc' || lower === '.profile') return 'bash';

  const dotIdx = basename.lastIndexOf('.');
  if (dotIdx <= 0 || dotIdx === basename.length - 1) return null;

  const ext = basename.substring(dotIdx + 1).toLowerCase();
  for (const [id, def] of Object.entries(LANGUAGE_REGISTRY)) {
    if (def.extensions.includes(ext)) {
      return id;
    }
  }
  return null;
}

/**
 * Synchronizes a filename's extension with a new language, preserving the base name.
 * Handles dotfiles and filenames without extensions safely.
 */
export function updateFilenameExtension(currentFilename: string, newLanguage: string): string {
  const targetExt = getPrimaryExtensionForLanguage(newLanguage);
  if (!currentFilename || !currentFilename.trim()) {
    return `main.${targetExt}`;
  }

  const trimmed = currentFilename.trim();
  const dotIdx = trimmed.lastIndexOf('.');

  // Dotfile like ".gitignore" or ".bashrc"
  if (dotIdx === 0) {
    return `${trimmed}.${targetExt}`;
  }

  // No dot
  if (dotIdx < 0) {
    return `${trimmed}.${targetExt}`;
  }

  // Has extension: replace after the last dot
  const base = trimmed.substring(0, dotIdx);
  return `${base}.${targetExt}`;
}

/**
 * Multi-layer heuristic language detection from code snippets.
 * Bounded, offline, zero network requests, safe execution.
 */
export function detectLanguageFromCode(code: string): string | null {
  if (!code) return null;
  const trimmed = code.trim();
  if (trimmed.length < 8) return null;

  // 1. Shebang / Header Analysis
  const firstLine = trimmed.split('\n', 1)[0].trim();
  if (firstLine.startsWith('#!')) {
    if (/#!.*\b(bash|sh|zsh)\b/.test(firstLine)) return 'bash';
    if (/#!.*\bpython[23]?\b/.test(firstLine)) return 'python';
    if (/#!.*\b(node|deno|bun)\b/.test(firstLine)) return 'javascript';
    if (/#!.*\bphp\b/.test(firstLine)) return 'php';
    if (/#!.*\bruby\b/.test(firstLine)) return 'bash';
  }

  // 2. Strict Structured Formats: JSON
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // not strict JSON, fall through
    }
  }

  // 3. Go (Distinct package main or func main)
  if (
    /\bpackage\s+[a-z0-9_]+\b/.test(trimmed) &&
    (/\bfunc\s+(main|\([a-z0-9_\s*]+\)\s*\w+|\w+)\s*\(/.test(trimmed) ||
      /\bfmt\.(Print|Sprint|Errorf)/.test(trimmed) ||
      /\bimport\s+("fmt"|\([^)]*"fmt"[^)]*\))/.test(trimmed))
  ) {
    return 'go';
  }

  // 4. TypeScript & JavaScript (Higher priority than plain HTML tag matches inside JSX)
  const hasTsFeatures =
    /\b(interface\s+\w+\s*\{|type\s+\w+\s*=|:\s*(string|number|boolean|any|unknown|never|void)\b|<React\.)/.test(
      trimmed
    );
  const hasJsFeatures =
    /\b(import\s+React|export\s+default|export\s+const|console\.log|const\s+\w+\s*=|let\s+\w+\s*=|function\s+\w+\s*\(.*?\)\s*\{|document\.getElementById|async\s+function|await\s+fetch)\b/.test(
      trimmed
    ) ||
    /\bconst\s+\[\w+,\s*set\w+\]\s*=\s*useState/.test(trimmed);

  if (hasTsFeatures) {
    return 'typescript';
  }
  if (hasJsFeatures) {
    return 'javascript';
  }

  // 5. HTML / XML (DocType or explicit outer HTML tags)
  if (
    /^<!DOCTYPE\s+html/i.test(trimmed) ||
    /<html[\s>]/i.test(trimmed) ||
    (/<\/?[a-z][\s\S]*>/i.test(trimmed) &&
      (trimmed.includes('</div>') ||
        trimmed.includes('</script>') ||
        trimmed.includes('<body') ||
        trimmed.includes('<head') ||
        trimmed.includes('<span>') ||
        trimmed.includes('<p>')) &&
      !trimmed.includes('return <div>') &&
      !trimmed.includes('export default'))
  ) {
    return 'html';
  }

  if (/^<\?xml\s+/i.test(trimmed) || (/<[a-zA-Z0-9_:-]+[\s\S]*xmlns[=:]/i.test(trimmed) && trimmed.endsWith('>'))) {
    return 'xml';
  }

  // 6. C vs C++ Structural Separation (High Priority)
  // C++ distinctive traits
  const hasCppKeywords =
    /\b(std::|std::cout|std::cin|std::endl|std::string|std::vector|namespace\s+\w+|template\s*<|class\s+\w+\s*\{|nullptr|constexpr|dynamic_cast|reinterpret_cast|static_cast|typeid)\b/.test(
      trimmed
    ) ||
    /#include\s+<(iostream|vector|string|map|memory|algorithm|sstream|utility|queue|deque|stack|thread|mutex)>/i.test(
      trimmed
    ) ||
    /\b(public|private|protected):\s*\n/.test(trimmed) ||
    /\bcout\s*<<|\bcin\s*>>/.test(trimmed);

  const hasCIncludeOrPattern =
    /#include\s+<(stdio\.h|stdlib\.h|string\.h|unistd\.h|fcntl\.h|sys\/types\.h|errno\.h|stdint\.h|stdbool\.h)>/i.test(
      trimmed
    ) ||
    /\b(printf|scanf|malloc|free|memcpy|memset|fprintf|snprintf|strcmp|strlen|strcpy)\s*\(/.test(
      trimmed
    ) ||
    /\bint\s+main\s*\(\s*(void|int\s+argc)/.test(trimmed);

  if (hasCppKeywords) {
    return 'cpp';
  }
  if (hasCIncludeOrPattern) {
    return 'c';
  }

  // 7. Java
  if (
    /\b(public\s+class|package\s+[a-z0-9_.]+|import\s+java[x]?\.|System\.out\.println|@Override|@SpringBootApplication|@RestController|@Service|@Component|@Entity|@Table|public\s+static\s+void\s+main)\b/.test(
      trimmed
    )
  ) {
    return 'java';
  }

  // 8. Rust
  if (
    /\b(fn\s+main\s*\(|println!|eprintln!|let\s+mut\s+|impl\s+\w+|pub\s+fn\s+|#\[derive\(|Vec::new\(\)|match\s+\w+\s*\{)\b/.test(
      trimmed
    )
  ) {
    return 'rust';
  }

  // 8. C#
  if (
    /\b(using\s+System(\.[A-Za-z0-9_]+)?;|namespace\s+[A-Za-z0-9_.]+|Console\.WriteLine|Console\.Write|public\s+async\s+Task)\b/.test(
      trimmed
    )
  ) {
    return 'csharp';
  }

  // 9. PHP
  if (trimmed.startsWith('<?php') || /\b(\$_POST|\$_GET|\$_SERVER|\$_SESSION|echo\s+['"\$]|function\s+\w+\s*\(.*?\)\s*:\s*\w+)/.test(trimmed)) {
    return 'php';
  }

  // 10. Bash / Shell Scripting
  if (
    trimmed.startsWith('#!/bin/bash') ||
    trimmed.startsWith('#!/bin/sh') ||
    trimmed.startsWith('#!/usr/bin/env bash') ||
    /\b(sudo\s+apt|chmod\s+\+x|chown\s+|curl\s+-[sS]|wget\s+-q)\b/.test(trimmed) ||
    /(\bif\s+\[\[?\s+.*?\s+\]\]?;\s*then\b|\bwhile\s+\[\[?|\bcase\s+\$\w+\s+in\b|\belif\s+\[\[?|\besac\b|\bfi\b|\bdone\b)/.test(
      trimmed
    ) ||
    /\b(echo\s+['"][^'"]+['"]|export\s+[A-Z0-9_]+=\S+)/.test(trimmed)
  ) {
    return 'bash';
  }

  // 11. Python
  if (
    /\b(def\s+\w+\s*\(.*?\):|import\s+[a-z0-9_]+|from\s+[a-z0-9_.]+\s+import|if\s+__name__\s*==\s*['"]__main__['"]|print\(|elif\s+.*?:|class\s+\w+(\(.*?\))?:)\b/.test(
      trimmed
    ) ||
    /:\s*\n\s+(return|pass|raise|yield)\b/.test(trimmed)
  ) {
    return 'python';
  }

  // 12. SQL
  if (
    /\b(SELECT\s+[\s\S]+?\s+FROM|CREATE\s+(TABLE|VIEW|INDEX)|INSERT\s+INTO\s+\w+|UPDATE\s+\w+\s+SET|DELETE\s+FROM\s+\w+|ALTER\s+TABLE\s+\w+|DROP\s+TABLE|JOIN\s+\w+\s+ON)\b/i.test(
      trimmed
    )
  ) {
    return 'sql';
  }

  // 14. CSS
  if (
    /(@media\s*\([^{]+\)|@keyframes\s+[\w-]+\s*\{|[.#][a-zA-Z0-9_-]+\s*\{[\s\S]*?(color|background|margin|padding|display|flex|font-size|border):[^;]+;)/.test(
      trimmed
    )
  ) {
    return 'css';
  }

  // 15. YAML
  if (
    /^---\s*\n/.test(trimmed) ||
    (/^([a-zA-Z0-9_-]+):\s*(.*)$/m.test(trimmed) &&
      /\n\s+([a-zA-Z0-9_-]+):\s*/.test(trimmed) &&
      !trimmed.includes('{') &&
      !trimmed.includes(';'))
  ) {
    return 'yaml';
  }

  // 16. Markdown
  if (
    (/^#{1,4}\s+[A-Za-z0-9]/m.test(trimmed) && (trimmed.includes('```') || /\[.*?\]\(https?:\/\/.*?\)/.test(trimmed)))
  ) {
    return 'markdown';
  }

  // 17. Kotlin
  if (/\b(fun\s+main\s*\(|val\s+\w+\s*:\s*[A-Z]|var\s+\w+\s*:\s*[A-Z]|companion\s+object|data\s+class\s+\w+)/.test(trimmed)) {
    return 'kotlin';
  }

  return null;
}
