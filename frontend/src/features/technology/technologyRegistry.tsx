import {
  SiApachemaven, SiBabel, SiBun, SiC, SiCplusplus, SiCss3, SiDocker,
  SiDotnet, SiGit, SiGithubactions, SiGo, SiGnubash, SiHtml5, SiOpenjdk,
  SiJavascript, SiJson, SiKotlin, SiKubernetes, SiMarkdown, SiMysql,
  SiNginx, SiNodedotjs, SiPhp, SiPostgresql, SiPrisma,
  SiPython, SiReact, SiRedis, SiRust, SiSpring, SiSpringboot,
  SiSqlite, SiTerraform, SiTypescript, SiYaml,
  type IconType,
} from '@icons-pack/react-simple-icons';

export type TechnologyId =
  | 'docker' | 'kubernetes' | 'postgresql' | 'redis' | 'java' | 'rust'
  | 'python' | 'javascript' | 'typescript' | 'react' | 'spring'
  | 'spring-boot' | 'nodejs' | 'github-actions' | 'nginx' | 'terraform'
  | 'git' | 'html' | 'css' | 'sql' | 'bash' | 'c' | 'cpp' | 'go'
  | 'maven' | 'prisma' | 'yaml' | 'json' | 'markdown' | 'php'
  | 'kotlin' | 'dotnet' | 'sqlite' | 'mysql' | 'npm' | 'bun' | 'babel';

export interface TechnologyDefinition {
  id: TechnologyId;
  label: string;
  Icon: IconType;
  aliases: readonly string[];
}

const definitions: TechnologyDefinition[] = [
  { id: 'docker', label: 'Docker', Icon: SiDocker, aliases: ['docker', 'dockerfile', 'docker-compose', 'compose'] },
  { id: 'kubernetes', label: 'Kubernetes', Icon: SiKubernetes, aliases: ['kubernetes', 'k8s'] },
  { id: 'postgresql', label: 'PostgreSQL', Icon: SiPostgresql, aliases: ['postgres', 'postgresql', 'psql'] },
  { id: 'redis', label: 'Redis', Icon: SiRedis, aliases: ['redis'] },
  { id: 'java', label: 'Java', Icon: SiOpenjdk, aliases: ['java'] },
  { id: 'rust', label: 'Rust', Icon: SiRust, aliases: ['rust', 'rs'] },
  { id: 'python', label: 'Python', Icon: SiPython, aliases: ['python', 'py', 'python3'] },
  { id: 'javascript', label: 'JavaScript', Icon: SiJavascript, aliases: ['javascript', 'js', 'node'] },
  { id: 'typescript', label: 'TypeScript', Icon: SiTypescript, aliases: ['typescript', 'ts', 'tsx'] },
  { id: 'react', label: 'React', Icon: SiReact, aliases: ['react', 'jsx', 'tsx'] },
  { id: 'spring-boot', label: 'Spring Boot', Icon: SiSpringboot, aliases: ['spring boot', 'springboot'] },
  { id: 'spring', label: 'Spring', Icon: SiSpring, aliases: ['spring'] },
  { id: 'nodejs', label: 'Node.js', Icon: SiNodedotjs, aliases: ['nodejs', 'node.js', 'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'] },
  { id: 'github-actions', label: 'GitHub Actions', Icon: SiGithubactions, aliases: ['github actions', 'github-actions', 'actions'] },
  { id: 'nginx', label: 'Nginx', Icon: SiNginx, aliases: ['nginx'] },
  { id: 'terraform', label: 'Terraform', Icon: SiTerraform, aliases: ['terraform', 'hcl', 'tf'] },
  { id: 'git', label: 'Git', Icon: SiGit, aliases: ['git', 'gitignore', 'gitattributes'] },
  { id: 'html', label: 'HTML', Icon: SiHtml5, aliases: ['html', 'htm'] },
  { id: 'css', label: 'CSS', Icon: SiCss3, aliases: ['css'] },
  { id: 'sql', label: 'SQL', Icon: SiPostgresql, aliases: ['sql'] },
  { id: 'bash', label: 'Bash', Icon: SiGnubash, aliases: ['bash', 'shell', 'sh', 'zsh'] },
  { id: 'c', label: 'C', Icon: SiC, aliases: ['c'] },
  { id: 'cpp', label: 'C++', Icon: SiCplusplus, aliases: ['cpp', 'c++', 'cxx'] },
  { id: 'go', label: 'Go', Icon: SiGo, aliases: ['go', 'golang'] },
  { id: 'maven', label: 'Maven', Icon: SiApachemaven, aliases: ['maven', 'pom.xml'] },
  { id: 'prisma', label: 'Prisma', Icon: SiPrisma, aliases: ['prisma'] },
  { id: 'yaml', label: 'YAML', Icon: SiYaml, aliases: ['yaml', 'yml'] },
  { id: 'json', label: 'JSON', Icon: SiJson, aliases: ['json'] },
  { id: 'markdown', label: 'Markdown', Icon: SiMarkdown, aliases: ['markdown', 'md'] },
  { id: 'php', label: 'PHP', Icon: SiPhp, aliases: ['php'] },
  { id: 'kotlin', label: 'Kotlin', Icon: SiKotlin, aliases: ['kotlin', 'kt', 'kts'] },
  { id: 'dotnet', label: '.NET', Icon: SiDotnet, aliases: ['csharp', 'c#', 'dotnet', '.net'] },
  { id: 'sqlite', label: 'SQLite', Icon: SiSqlite, aliases: ['sqlite', 'sqlite3'] },
  { id: 'mysql', label: 'MySQL', Icon: SiMysql, aliases: ['mysql'] },
  { id: 'npm', label: 'npm', Icon: SiNodedotjs, aliases: ['npm'] },
  { id: 'bun', label: 'Bun', Icon: SiBun, aliases: ['bun'] },
  { id: 'babel', label: 'Babel', Icon: SiBabel, aliases: ['babel'] },
];

export const TECHNOLOGY_REGISTRY: Readonly<Record<TechnologyId, TechnologyDefinition>> =
  Object.fromEntries(definitions.map((definition) => [definition.id, definition])) as Record<TechnologyId, TechnologyDefinition>;

const aliasToTechnology = new Map<string, TechnologyId>();
for (const definition of definitions) {
  aliasToTechnology.set(definition.id, definition.id);
  for (const alias of definition.aliases) aliasToTechnology.set(alias.toLowerCase(), definition.id);
}

export function normalizeTechnology(value?: string | null): TechnologyId | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return aliasToTechnology.get(normalized) ?? null;
}

export function TechnologyIcon({
  technology,
  size = 16,
  className,
}: {
  technology: TechnologyId;
  size?: number;
  className?: string;
}) {
  const definition = TECHNOLOGY_REGISTRY[technology];
  return <definition.Icon size={size} color="default" className={className} aria-hidden="true" focusable="false" />;
}
