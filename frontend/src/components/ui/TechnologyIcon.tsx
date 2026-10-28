import React, { useMemo } from 'react';
import { FileCode2 } from 'lucide-react';
import { detectDominantTechnology, detectTechnology, type TechnologyInput } from '../../features/technology/detectTechnology';
import { normalizeTechnology, TechnologyIcon as RegistryTechnologyIcon } from '../../features/technology/technologyRegistry';

export interface TechnologyIconProps extends TechnologyInput {
  size?: number;
  className?: string;
  fallback?: React.ReactNode;
  files?: readonly TechnologyInput[];
}

export const TechnologyIcon: React.FC<TechnologyIconProps> = ({
  technology,
  category,
  language,
  filename,
  content,
  title,
  description,
  tags,
  size = 16,
  className,
  fallback,
  files,
}) => {
  const evidence = useMemo(() => {
    const metadata = { technology, category, language, filename, content, title, description, tags };
    return files ? detectDominantTechnology(files, metadata) : detectTechnology(metadata);
  }, [technology, category, language, filename, content, title, description, tags, files]);
  const explicit = normalizeTechnology(technology) ?? normalizeTechnology(category);
  const selected = explicit ?? evidence?.technology;

  if (!selected) {
    return <>{fallback ?? <FileCode2 size={size} className={className} aria-hidden="true" />}</>;
  }
  return <RegistryTechnologyIcon technology={selected} size={size} className={className} />;
};

export default TechnologyIcon;
