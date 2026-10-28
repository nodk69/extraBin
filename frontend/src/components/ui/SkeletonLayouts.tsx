import React from 'react';
import { useLocation } from 'react-router-dom';
import {
  Skeleton,
  SkeletonAvatar,
  SkeletonBadge,
  SkeletonButton,
  SkeletonRegion,
  SkeletonText,
} from './Skeleton';

const CODE_WIDTHS = ['78%', '54%', '87%', '42%', '69%', '91%', '61%', '74%', '48%', '83%', '57%', '70%'];

export const PasteCardSkeleton: React.FC = () => (
  <div className="skeleton-card skeleton-feed-card">
    <div className="skeleton-feed-card__top">
      <SkeletonBadge width={78} />
      <Skeleton shape="text" width={92} />
    </div>
    <SkeletonText lines={2} widths={['88%', '58%']} />
    <div className="skeleton-title-row" style={{ justifyContent: 'flex-start' }}>
      <SkeletonBadge width={58} />
      <SkeletonBadge width={72} />
    </div>
    <SkeletonText lines={1} widths={['76%']} />
    <div className="skeleton-feed-card__footer">
      <Skeleton shape="text" width={84} />
      <SkeletonButton width={70} />
    </div>
  </div>
);

export const PasteGridSkeleton: React.FC<{ count?: number; label?: string }> = ({
  count = 6,
  label = 'Loading paste results',
}) => (
  <SkeletonRegion label={label} testId="paste-grid-skeleton">
    <div className="skeleton-card-grid">
      {Array.from({ length: count }, (_, index) => <PasteCardSkeleton key={index} />)}
    </div>
  </SkeletonRegion>
);

export const DiscoveryPageSkeleton: React.FC<{ resultsOnly?: boolean }> = ({ resultsOnly = false }) => {
  if (resultsOnly) {
    return <PasteGridSkeleton label="Loading discovery results" />;
  }

  return (
    <SkeletonRegion label="Loading Explore" className="workspace discovery-page" testId="discovery-page-skeleton">
      <div className="skeleton-page">
        <div>
          <Skeleton shape="text" width={170} />
          <Skeleton height={38} width="min(520px, 88%)" className="mt-3" />
          <SkeletonText lines={1} widths={['min(620px, 100%)']} className="mt-3" />
        </div>
        <div className="skeleton-card skeleton-control-panel">
          <SkeletonButton width="min(100%, 520px)" />
          <SkeletonButton width={130} />
          <SkeletonButton width={150} />
          <SkeletonButton width={150} />
        </div>
        <div className="skeleton-title-row">
          <Skeleton height={24} width={220} />
          <Skeleton shape="text" width={84} />
        </div>
        <div className="skeleton-card-grid">
          {Array.from({ length: 6 }, (_, index) => <PasteCardSkeleton key={index} />)}
        </div>
      </div>
    </SkeletonRegion>
  );
};

export const ProfilePageSkeleton: React.FC = () => (
  <SkeletonRegion label="Loading author profile" className="workspace author-profile" testId="profile-page-skeleton">
    <div className="skeleton-page">
      <Skeleton shape="text" width={128} />
      <div className="skeleton-profile-card">
        <div className="skeleton-profile-identity">
          <SkeletonAvatar size={72} />
          <div className="skeleton-profile-identity__text">
            <div className="skeleton-title-row" style={{ justifyContent: 'flex-start' }}>
              <Skeleton height={34} width="min(260px, 62vw)" />
              <SkeletonBadge width={70} />
            </div>
            <SkeletonText lines={2} widths={['min(520px, 100%)', '58%']} />
          </div>
        </div>
        <div className="skeleton-stat-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="skeleton-card skeleton-stat" key={index}>
              <Skeleton shape="text" width="68%" />
              <Skeleton height={24} width="42%" />
            </div>
          ))}
        </div>
      </div>
      <div className="skeleton-title-row">
        <Skeleton height={28} width={230} />
        <Skeleton shape="text" width={82} />
      </div>
      <div className="skeleton-card skeleton-control-panel">
        <SkeletonButton width="min(100%, 540px)" />
        <SkeletonButton width={160} />
      </div>
      <div className="skeleton-card-grid">
        {Array.from({ length: 3 }, (_, index) => <PasteCardSkeleton key={index} />)}
      </div>
    </div>
  </SkeletonRegion>
);

export const AuthorPopoverSkeleton: React.FC = () => (
  <SkeletonRegion label="Loading profile preview" testId="author-popover-skeleton">
    <div className="skeleton-popover">
      <div className="skeleton-popover__header">
        <SkeletonAvatar size={48} />
        <div className="skeleton-popover__body" style={{ flex: 1 }}>
          <SkeletonText lines={2} widths={['48%', '62%']} />
        </div>
      </div>
      <div className="skeleton-title-row" style={{ justifyContent: 'flex-start' }}>
        <SkeletonBadge width={88} />
        <SkeletonBadge width={72} />
      </div>
      <div className="skeleton-popover__pastes">
        <div className="skeleton-popover__preview-rows">
          {[0, 1].map((row) => (
            <div className="skeleton-popover__preview-row" key={row}>
              <Skeleton shape="text" width="78%" />
              <Skeleton shape="text" width="42%" />
            </div>
          ))}
        </div>
      </div>
      <SkeletonButton width="100%" />
    </div>
  </SkeletonRegion>
);

export const PasteViewSkeleton: React.FC = () => (
  <SkeletonRegion label="Loading paste contents" className="workspace" testId="paste-view-skeleton">
    <div className="skeleton-page">
      <Skeleton shape="text" width={126} />
      <div className="skeleton-toolbar-row">
        <div style={{ flex: 1, minWidth: 0 }}>
          <Skeleton shape="text" width={124} />
          <div className="skeleton-title-row mt-3" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            <Skeleton height={36} width="min(430px, 70vw)" />
            <SkeletonBadge width={82} />
            <SkeletonBadge width={72} />
          </div>
          <SkeletonText lines={1} widths={['min(520px, 100%)']} className="mt-3" />
        </div>
        <div className="skeleton-title-row">
          <SkeletonButton width={74} />
          <SkeletonButton width={86} />
          <SkeletonButton width={74} />
        </div>
      </div>
      <div className="skeleton-code-panel">
        <div className="skeleton-code-panel__tabs">
          <SkeletonButton width={128} />
          <SkeletonButton width={104} />
        </div>
        <div className="skeleton-code-lines">
          {CODE_WIDTHS.map((width, index) => <Skeleton shape="text" width={width} key={index} />)}
        </div>
      </div>
    </div>
  </SkeletonRegion>
);

const TableRows: React.FC<{ count?: number }> = ({ count = 5 }) => (
  <div className="skeleton-card skeleton-dashboard-list">
    {Array.from({ length: count }, (_, row) => (
      <div className="skeleton-table-row" key={row}>
        <SkeletonText lines={2} widths={['72%', '44%']} />
        <SkeletonBadge width={72} />
        <SkeletonBadge width={64} />
        <Skeleton shape="text" width="74%" />
        <Skeleton shape="text" width="58%" />
        <SkeletonButton width={78} />
      </div>
    ))}
  </div>
);

export const DashboardListSkeleton: React.FC<{ label?: string }> = ({ label = 'Loading paste library' }) => (
  <SkeletonRegion label={label} testId="dashboard-list-skeleton">
    <TableRows />
  </SkeletonRegion>
);

export const DashboardSkeleton: React.FC = () => (
  <SkeletonRegion label="Loading account dashboard" className="workspace" testId="dashboard-skeleton">
    <div className="skeleton-page">
      <div>
        <Skeleton shape="text" width={170} />
        <Skeleton height={36} width={270} className="mt-3" />
      </div>
      <div className="skeleton-profile-card">
        <div className="skeleton-profile-identity">
          <SkeletonAvatar size={64} />
          <SkeletonText lines={2} widths={['180px', '240px']} />
        </div>
        <div className="skeleton-stat-grid">
          {Array.from({ length: 4 }, (_, index) => <Skeleton height={72} key={index} />)}
        </div>
      </div>
      <div className="skeleton-title-row" style={{ justifyContent: 'flex-start', overflow: 'hidden' }}>
        {Array.from({ length: 4 }, (_, index) => <SkeletonButton width={index === 0 ? 110 : 138} key={index} />)}
      </div>
      <div className="skeleton-card skeleton-control-panel">
        <SkeletonButton width={132} />
        <SkeletonButton width={132} />
        <SkeletonButton width="min(100%, 280px)" />
      </div>
      <TableRows />
    </div>
  </SkeletonRegion>
);

export const SettingsSkeleton: React.FC = () => (
  <SkeletonRegion label="Loading account settings" className="workspace" testId="settings-skeleton">
    <div className="skeleton-page">
      <div>
        <Skeleton shape="text" width={170} />
        <Skeleton height={36} width={270} className="mt-3" />
        <SkeletonText lines={1} widths={['min(620px, 100%)']} className="mt-3" />
      </div>
      <div className="skeleton-settings-grid">
        <div className="skeleton-card skeleton-settings-nav">
          {Array.from({ length: 7 }, (_, index) => <SkeletonButton width="100%" key={index} />)}
        </div>
        <div className="skeleton-card skeleton-settings-panel">
          <Skeleton height={28} width={230} />
          <SkeletonText lines={1} widths={['62%']} />
          {Array.from({ length: 4 }, (_, index) => (
            <div className="skeleton-settings-field" key={index}>
              <Skeleton shape="text" width={110} />
              <Skeleton height={20} width={index % 2 ? '72%' : '48%'} />
            </div>
          ))}
        </div>
      </div>
    </div>
  </SkeletonRegion>
);

export const DiscussionSkeleton: React.FC<{ label?: string }> = ({ label = 'Loading discussion' }) => (
  <SkeletonRegion label={label} announce={false} testId="discussion-skeleton">
    <div className="space-y-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="skeleton-card skeleton-discussion-row" key={index}>
          <SkeletonAvatar size={36} />
          <div className="skeleton-discussion-row__body">
            <SkeletonText lines={1} widths={['34%']} />
            <SkeletonText lines={2} widths={['96%', index === 1 ? '54%' : '72%']} />
          </div>
        </div>
      ))}
    </div>
  </SkeletonRegion>
);

export const RevisionHistorySkeleton: React.FC = () => (
  <SkeletonRegion label="Loading revision snapshots" testId="revision-history-skeleton">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[360px]">
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, index) => <Skeleton height={76} width="100%" key={index} />)}
      </div>
      <div className="md:col-span-2 skeleton-code-panel">
        <div className="skeleton-code-lines">
          {CODE_WIDTHS.slice(0, 8).map((width, index) => <Skeleton shape="text" width={width} key={index} />)}
        </div>
      </div>
    </div>
  </SkeletonRegion>
);

export const EmbedSkeleton: React.FC = () => (
  <SkeletonRegion label="Loading embed snippet" className="skeleton-embed" testId="embed-skeleton">
    <div className="skeleton-embed">
      <div className="skeleton-embed__header">
        <div className="skeleton-title-row" style={{ justifyContent: 'flex-start', flex: 1 }}>
          <SkeletonBadge width={72} />
          <Skeleton shape="text" width="min(260px, 44vw)" />
          <SkeletonBadge width={64} />
        </div>
        <SkeletonButton width={72} />
      </div>
      <div className="skeleton-embed__code skeleton-code-lines">
        {CODE_WIDTHS.map((width, index) => <Skeleton shape="text" width={width} key={index} />)}
      </div>
      <div className="skeleton-embed__footer">
        <Skeleton shape="text" width={100} />
        <Skeleton shape="text" width={130} />
      </div>
    </div>
  </SkeletonRegion>
);

const FormPageSkeleton: React.FC = () => (
  <SkeletonRegion label="Loading page" className="workspace" testId="form-page-skeleton">
    <div className="skeleton-page" style={{ maxWidth: 720, margin: '0 auto' }}>
      <Skeleton height={36} width="56%" />
      <SkeletonText lines={2} widths={['78%', '62%']} />
      <div className="skeleton-card skeleton-settings-panel">
        <Skeleton height={44} width="100%" />
        <Skeleton height={44} width="100%" />
        <Skeleton height={120} width="100%" />
        <SkeletonButton width="100%" />
      </div>
    </div>
  </SkeletonRegion>
);

export const RouteSkeleton: React.FC = () => {
  const { pathname } = useLocation();
  if (pathname.startsWith('/p/')) return <PasteViewSkeleton />;
  if (pathname.startsWith('/discovery')) return <DiscoveryPageSkeleton />;
  if (pathname.startsWith('/users/')) return <ProfilePageSkeleton />;
  if (pathname.startsWith('/account')) return <DashboardSkeleton />;
  if (pathname.startsWith('/settings')) return <SettingsSkeleton />;
  return <FormPageSkeleton />;
};
