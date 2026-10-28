import { detectLanguageFromCode } from '../../lib/syntax/languageDetection';
import { normalizeTechnology, type TechnologyId } from './technologyRegistry';

export interface TechnologyEvidence {
  technology: TechnologyId;
  source: 'metadata' | 'filename' | 'extension' | 'content' | 'description';
}

export interface TechnologyInput {
  technology?: string | null;
  category?: string | null;
  language?: string | null;
  filename?: string | null;
  content?: string | null;
  title?: string | null;
  description?: string | null;
  tags?: readonly string[] | null;
}

const MAX_CONTENT_LENGTH = 32_768;
const EXTENSION_MAP: Readonly<Record<string, TechnologyId>> = {
  java: 'java', rs: 'rust', py: 'python', js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript', go: 'go',
  c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', hxx: 'cpp',
  html: 'html', htm: 'html', css: 'css', sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash',
  md: 'markdown', markdown: 'markdown', json: 'json', yaml: 'yaml', yml: 'yaml',
  kt: 'kotlin', kts: 'kotlin', php: 'php', tf: 'terraform', tfvars: 'terraform',
  prisma: 'prisma', hcl: 'terraform',
};

const normalizePath = (filename: string): string => filename.replace(/\\/g, '/').toLowerCase();

function detectSpecialFilename(filename: string): TechnologyId | null {
  const path = normalizePath(filename).replace(/^\.\//, '');
  const basename = path.slice(path.lastIndexOf('/') + 1);
  if (basename === 'dockerfile' || /^dockerfile\./.test(basename) || basename === 'docker-compose.yml' || basename === 'docker-compose.yaml' || basename === 'compose.yml' || basename === 'compose.yaml') return 'docker';
  if (basename === 'pom.xml') return 'maven';
  if (basename === 'cargo.toml' || basename === 'cargo.lock') return 'rust';
  if (basename === 'go.mod' || basename === 'go.sum') return 'go';
  if (basename === 'package.json' || basename === 'package-lock.json' || basename === 'npm-shrinkwrap.json' || basename === 'yarn.lock' || basename === 'pnpm-lock.yaml' || basename === 'bun.lock' || basename === 'bun.lockb') return 'nodejs';
  if (basename === 'schema.prisma') return 'prisma';
  if (basename === 'nginx.conf' || /^nginx\.[^/]+$/.test(basename)) return 'nginx';
  if (path.includes('/.github/workflows/') || path.startsWith('.github/workflows/')) return 'github-actions';
  if (basename === '.gitignore' || basename === '.gitattributes' || basename === '.gitmodules') return 'git';
  if (basename === 'makefile' || basename === 'gnu makefile') return 'bash';
  if (basename === 'requirements.txt' || basename === 'pyproject.toml' || basename === 'pipfile') return 'python';
  if (basename === 'gemfile') return null;
  if (basename === 'tsconfig.json') return 'typescript';
  if (basename === 'composer.json') return 'php';
  if (basename === 'gradlew' || basename === 'build.gradle' || basename === 'settings.gradle' || basename === 'build.gradle.kts') return 'java';
  if (/^\.bashrc$|^\.zshrc$|^\.profile$/.test(basename)) return 'bash';
  return null;
}

function getExtension(filename: string): string | null {
  const basename = normalizePath(filename).slice(normalizePath(filename).lastIndexOf('/') + 1);
  const dot = basename.lastIndexOf('.');
  if (dot <= 0 || dot === basename.length - 1) return null;
  return basename.slice(dot + 1);
}

function detectContentTechnology(content?: string | null): TechnologyId | null {
  if (!content) return null;
  const sample = content.slice(0, MAX_CONTENT_LENGTH);
  const firstLine = sample.split(/\r?\n/, 1)[0].trim();
  if (/^#!.*\bpython[23]?\b/.test(firstLine)) return 'python';
  if (/^#!.*\b(node|deno|bun)\b/.test(firstLine)) return 'javascript';
  if (/^#!.*\b(bash|sh|zsh)\b/.test(firstLine)) return 'bash';

  // Configuration signatures are intentionally structural and require multiple clues.
  if (/^\s*services\s*:/m.test(sample) && /\b(image|build)\s*:/m.test(sample) && /\b(container_name|depends_on|ports|volumes)\s*:/m.test(sample)) return 'docker';
  if (/^\s*apiVersion\s*:\s*[\w./-]+/m.test(sample) && /^\s*kind\s*:\s*(Pod|Deployment|Service|ConfigMap|Secret|StatefulSet|DaemonSet|Ingress|Job|CronJob)\s*$/m.test(sample)) return 'kubernetes';
  if (/^\s*name\s*:/m.test(sample) && /^\s*on\s*:/m.test(sample) && /^\s*jobs\s*:/m.test(sample) && /^\s*\w[\w-]*\s*:\s*$/m.test(sample)) return null; // path is needed to identify Actions reliably
  if (/\bprovider\s+"(?:aws|azurerm|google|kubernetes)"\s*\{/m.test(sample) && /\bresource\s+"[\w_-]+"\s+"[\w_-]+"\s*\{/m.test(sample)) return 'terraform';
  if (/\bmodel\s+\w+\s*\{/m.test(sample) && /\b(datasource|generator)\s+\w+\s*\{/m.test(sample)) return 'prisma';
  if (/\bserver\s*\{/m.test(sample) && /\blisten\s+\d+/m.test(sample) && /\b(location|upstream)\s+[^\s{]+\s*\{/m.test(sample)) return 'nginx';
  if (/(?:^|\n)\s*(?:FROM\s+\S+|RUN\s+\S+|CMD\s+\[|ENTRYPOINT\s+\[)/i.test(sample) && /(?:^|\n)\s*(?:WORKDIR|COPY|EXPOSE|USER|ARG|ENV)\s+/im.test(sample)) return 'docker';

  const language = detectLanguageFromCode(sample);
  return language && language !== 'bash' ? normalizeTechnology(language) : null;
}

/** Returns the strongest available signal; content/title signals are bounded and local-only. */
export function detectTechnology(input: TechnologyInput): TechnologyEvidence | null {
  const explicit = normalizeTechnology(input.technology) ?? normalizeTechnology(input.category);
  if (explicit) return { technology: explicit, source: 'metadata' };

  const filename = input.filename?.trim();
  if (filename) {
    const special = detectSpecialFilename(filename);
    if (special) return { technology: special, source: 'filename' };
    // YAML is intentionally postponed until after strong syntax signatures are checked.
    const extension = getExtension(filename);
    if (extension && extension !== 'yml' && extension !== 'yaml' && EXTENSION_MAP[extension]) {
      return { technology: EXTENSION_MAP[extension], source: 'extension' };
    }
  }

  const content = detectContentTechnology(input.content);
  if (content) return { technology: content, source: 'content' };

  const language = normalizeTechnology(input.language);
  if (language && !['json', 'yaml', 'bash', 'shell', 'sh'].includes(input.language?.toLowerCase() ?? '')) {
    return { technology: language, source: 'metadata' };
  }
  // A Markdown document remains Markdown even when its prose discusses a technology.
  if (filename && /\.(md|markdown)$/i.test(filename)) return { technology: 'markdown', source: 'extension' };
  if (filename) {
    const extension = getExtension(filename);
    if (extension && EXTENSION_MAP[extension]) return { technology: EXTENSION_MAP[extension], source: 'extension' };
  }

  // Only exact topic labels are considered; prose such as a Markdown tutorial is not scanned for brand names.
  for (const term of [input.title, input.description, ...(input.tags ?? [])]) {
    const match = term && /^\s*(docker|kubernetes|postgres(?:ql)?|redis|java|rust|python|javascript|typescript|react|spring(?: boot)?|node(?:\.js)?|nginx|terraform|git|sql|bash|go(?:lang)?)\s*$/i.exec(term);
    const technology = match ? normalizeTechnology(match[1]) : null;
    if (technology) return { technology, source: 'description' };
  }
  return null;
}

export function detectDominantTechnology(files: readonly TechnologyInput[], pasteMetadata: TechnologyInput = {}): TechnologyEvidence | null {
  const explicit = normalizeTechnology(pasteMetadata.technology) ?? normalizeTechnology(pasteMetadata.category);
  if (explicit) return { technology: explicit, source: 'metadata' };
  const primary = detectTechnology(pasteMetadata);

  const counts = new Map<TechnologyId, number>();
  for (const file of files) {
    const evidence = detectTechnology(file);
    if (evidence) counts.set(evidence.technology, (counts.get(evidence.technology) ?? 0) + 1);
  }
  let winner: TechnologyId | null = null;
  let max = 0;
  let tied = false;
  for (const [technology, count] of counts) {
    if (count > max) { winner = technology; max = count; tied = false; }
    else if (count === max) tied = true;
  }
  if (winner && !tied) return { technology: winner, source: 'filename' };
  return primary;
}
