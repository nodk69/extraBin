import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { SkeletonRegion, SkeletonText } from '../../../components/ui/Skeleton';
import { useAuth } from '../../auth/context/AuthContext';
import { authorProfileApi, DeveloperRelationship } from '../api/authorProfileApi';
import { FollowButton } from '../components/FollowButton';
import type { PagedResponse } from '../../dashboard/api/accountApi';
import '../authors.css';
import '../author-network.css';

type Kind = 'followers' | 'following';
export const DeveloperNetworkPage: React.FC<{ kind: Kind }> = ({ kind }) => {
  const { username = '' } = useParams<{ username: string }>();
  const { user, isAuthenticated } = useAuth();
  const [page, setPage] = useState(0);
  const [data, setData] = useState<PagedResponse<DeveloperRelationship> | null>(null);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    authorProfileApi.getRelationshipList(username, kind, page, 20, controller.signal).then((result) => {
      if (!controller.signal.aborted) { setData(result); setStatus('success'); }
    }).catch(() => { if (!controller.signal.aborted) setStatus('error'); });
    return () => controller.abort();
  }, [username, kind, page, reload]);

  const title = kind === 'followers' ? 'Followers' : 'Following';
  return <main className="workspace developer-network">
    <Link to={`/users/${encodeURIComponent(username)}`} className="author-profile__back-link">← Back to @{username}</Link>
    <header className="developer-network__header">
      <div><span className="eyebrow">DEVELOPER NETWORK</span><h1>{title}</h1><p>@{username} · {data?.totalElements ?? '—'} {title.toLowerCase()}</p></div>
    </header>
    {status === 'loading' && <SkeletonRegion label={`Loading ${title.toLowerCase()}`} testId="developer-network-skeleton">
      <div className="developer-network__list">{[0, 1, 2].map((i) => <div className="developer-network__row" key={i}><SkeletonText lines={2} widths={['160px', '220px']} /></div>)}</div>
    </SkeletonRegion>}
    {status === 'error' && <div role="alert" className="author-profile__state"><p>Couldn’t load this list.</p><button className="author-profile__retry" onClick={() => setReload((value) => value + 1)}>Retry</button></div>}
    {status === 'success' && data?.items.length === 0 && <div className="author-profile__empty">No {title.toLowerCase()} yet.</div>}
    {status === 'success' && data && data.items.length > 0 && <>
      <div className="developer-network__list">
        {data.items.map((person) => <article className="developer-network__row" key={person.username}>
          <Link className="developer-network__person" to={`/users/${encodeURIComponent(person.username)}`}>
            <UserAvatar username={person.username} size="md" alt={`@${person.username}`} />
            <span className="developer-network__username">@{person.username}</span>
          </Link>
          {person.username !== user?.username && <FollowButton username={person.username} followed={person.followedByViewer} authenticated={isAuthenticated} compact onChange={(followed) => setData((current) => current ? { ...current, items: current.items.map((item) => item.username === person.username ? { ...item, followedByViewer: followed, followerCount: Math.max(0, item.followerCount + (followed ? 1 : -1)) } : item) } : current)} />}
        </article>)}
      </div>
      {data.totalPages > 1 && <nav className="author-profile__pagination" aria-label={`${title} pages`}>
        <button className="author-profile__page-button" disabled={data.isFirst} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button>
        <span>Page {page + 1} of {data.totalPages}</span>
        <button className="author-profile__page-button" disabled={data.isLast} onClick={() => setPage((value) => value + 1)}>Next</button>
      </nav>}
    </>}
  </main>;
};
export default DeveloperNetworkPage;
