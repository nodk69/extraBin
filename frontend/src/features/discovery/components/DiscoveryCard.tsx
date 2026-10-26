import React, { useId } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../../components/ui/PaperIcon';
import { AuthorLink } from '../../authors/components/AuthorLink';
import type { PasteSummary } from '../../dashboard/api/accountApi';

const BLUE_LANGS = new Set([
  'typescript',
  'ts',
  'sql',
  'c',
  'cpp',
  'c++',
  'csharp',
  'c#',
  'css',
  'kotlin',
]);

const AMBER_LANGS = new Set([
  'javascript',
  'js',
  'python',
  'py',
  'json',
  'yaml',
  'yml',
  'php',
  'ruby',
]);

const CORAL_LANGS = new Set([
  'rust',
  'rs',
  'go',
  'golang',
  'bash',
  'sh',
  'shell',
  'html',
  'xml',
  'markdown',
  'md',
]);

export type DiscoveryLangTone = 'coral' | 'blue' | 'lime' | 'amber';

export const getLanguageTone = (language?: string | null): DiscoveryLangTone => {
  if (!language) return 'lime';
  const normalized = language.trim().toLowerCase();
  if (BLUE_LANGS.has(normalized)) return 'blue';
  if (AMBER_LANGS.has(normalized)) return 'amber';
  if (CORAL_LANGS.has(normalized)) return 'coral';
  return 'lime';
};

export const formatPublishedDate = (value?: string | null): string => {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const getShortId = (id?: string | null): string => {
  if (!id) return 'unknown';
  const value = String(id);
  return value.length > 8 ? value.slice(0, 8) : value;
};

const normalizeSafeId = (item: PasteSummary): string => {
  const raw = item?.id;
  if (raw === null || raw === undefined) return '';
  const value = String(raw).trim();
  return value.length > 0 ? value : '';
};

export interface DiscoveryCardProps {
  item: PasteSummary;
  isAuthenticated: boolean;
  isSaved: boolean;
  isSaving: boolean;
  /** Omit on read-only surfaces (for example another author's public work). */
  onToggleSave?: (id: string, wasSaved: boolean) => void;
  /** Omit to render tags as plain labels instead of filter buttons. */
  onSelectTag?: (tag: string) => void;
  /** Set false to hide the Save control on read-only surfaces. Defaults to true. */
  showSaveAction?: boolean;
  /** Set false to hide the author line (for example on an author's own profile). Defaults to true. */
  showAuthor?: boolean;
  /** Active discovery tab when the snippet was clicked (for accurate back-navigation). */
  fromTab?: 'explore' | 'trending' | 'most-saved';
}

/**
 * One reusable snippet card shared by the Explore and Most saved feeds.
 * The whole card is clickable through a dedicated, non-focusable overlay link while
 * the title link, tag buttons and Save control stay independently interactive.
 */
export const DiscoveryCard: React.FC<DiscoveryCardProps> = ({
  item,
  isAuthenticated,
  isSaved,
  isSaving,
  onToggleSave,
  onSelectTag,
  showSaveAction = true,
  showAuthor = true,
  fromTab,
}) => {
  const titleId = useId();
  const safeId = normalizeSafeId(item);
  const canNavigate = safeId.length > 0;
  const title = item?.title?.trim() || 'Untitled Snippet';
  const language = (item?.language || 'text').trim() || 'text';
  const tone = getLanguageTone(language);
  const tags = Array.isArray(item?.tags)
    ? item.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    : [];
  const lines = typeof item?.lineCount === 'number' ? item.lineCount : 0;
  const sizeKb = typeof item?.contentSizeBytes === 'number' ? (item.contentSizeBytes / 1024).toFixed(1) : '0.0';
  const views = typeof item?.views === 'number' ? item.views : 0;
  const stars = typeof item?.starsCount === 'number' ? item.starsCount : 0;
  const author = item?.authorUsername ? String(item.authorUsername) : null;
  const publishedDate = formatPublishedDate(item?.createdAt);

  const publishedDateTime =
    item?.createdAt && !Number.isNaN(new Date(item.createdAt).getTime()) ? item.createdAt : undefined;

  const pastePath = canNavigate ? `/p/${encodeURIComponent(safeId)}` : null;
  const saveLabel = isSaved ? `Remove saved snippet ${title}` : `Save snippet ${title}`;
  const navigationState = fromTab ? { fromTab } : undefined;

  return (
    <article className="discovery-card" aria-labelledby={titleId}>
      {pastePath && (
        <Link
          to={pastePath}
          state={navigationState}
          className="discovery-card__overlay"
          tabIndex={-1}
          aria-hidden="true"
        />
      )}

      <div className="discovery-card__content">
        <div className="discovery-card__top">
          <span className={`discovery-lang discovery-lang--${tone}`}>{language}</span>
          <time className="discovery-card__date" dateTime={publishedDateTime}>
            {publishedDate}
          </time>
        </div>

        <h3 id={titleId} className="discovery-card__title">
          {pastePath ? (
            <Link to={pastePath} state={navigationState} className="discovery-card__title-link">
              {title}
            </Link>
          ) : (
            <span className="discovery-card__title-text">{title}</span>
          )}
        </h3>

        <div
          className="discovery-card__tags"
          role={tags.length > 0 ? 'group' : undefined}
          aria-label={tags.length > 0 ? `Tags for ${title}` : undefined}
        >
          {tags.slice(0, 4).map((tag) =>
            onSelectTag ? (
              <button
                key={tag}
                type="button"
                className="discovery-card__tag"
                onClick={() => onSelectTag(tag)}
              >
                #{tag}
              </button>
            ) : (
              <span key={tag} className="discovery-card__tag discovery-card__tag--static">
                #{tag}
              </span>
            )
          )}
        </div>

        <div className="discovery-card__meta">
          <span className="discovery-card__id" title={`Paste ID: ${safeId || 'unknown'}`}>
            #{getShortId(safeId)}
          </span>
          <span className="discovery-card__dot" aria-hidden="true">
            ·
          </span>
          <span>
            {lines} {lines === 1 ? 'line' : 'lines'}
          </span>
          <span className="discovery-card__dot" aria-hidden="true">
            ·
          </span>
          <span>{sizeKb} KB</span>
          <span className="discovery-card__dot" aria-hidden="true">
            ·
          </span>
          <span className="discovery-card__views">
            {views.toLocaleString()} {views === 1 ? 'view' : 'views'}
          </span>
        </div>

        <div className="discovery-card__author">
          {showAuthor && <AuthorLink username={author} />}
          {stars > 0 && (
            <span className="discovery-card__stars" title={`${stars} saves`}>
              <Icon name="check" size={12} />
              {stars} saved
            </span>
          )}
        </div>

        <div className="discovery-card__footer">
          <span className="discovery-card__visibility">
            <Icon name="globe" size={12} />
            <span>Public</span>
          </span>

          <div className="discovery-card__actions">
            {showSaveAction && isAuthenticated && canNavigate && onToggleSave && (
              <button
                type="button"
                className={`discovery-card__save${isSaved ? ' is-saved' : ''}`}
                aria-label={saveLabel}
                aria-pressed={isSaved}
                aria-busy={isSaving || undefined}
                disabled={isSaving}
                onClick={() => onToggleSave(safeId, isSaved)}
              >
                {isSaving ? 'Saving…' : isSaved ? 'Saved' : 'Save'}
              </button>
            )}
            {canNavigate && (
              <span className="discovery-card__open" aria-hidden="true">
                <span>Open</span>
                <Icon name="arrow" size={13} />
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

export default DiscoveryCard;
