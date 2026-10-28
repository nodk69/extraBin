import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { authorProfileApi, DeveloperRelationship } from '../../authors/api/authorProfileApi';
import { FollowButton } from '../../authors/components/FollowButton';
import { useAuth } from '../../auth/context/AuthContext';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import '../discovery.css';

export const DeveloperDiscoveryPage: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const [developers, setDevelopers] = useState<DeveloperRelationship[]>([]);
  const [developersStatus, setDevelopersStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [developersPage, setDevelopersPage] = useState(0);
  const [developersTotalPages, setDevelopersTotalPages] = useState(0);
  const [developersReload, setDevelopersReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setDevelopersStatus('loading');
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      try {
        const result = await authorProfileApi.getDevelopers(developersPage, 12, controller.signal);
        if (controller.signal.aborted) return;
        setDevelopers(result.items);
        setDevelopersTotalPages(result.totalPages);
        setDevelopersStatus('success');
      } catch {
        if (!controller.signal.aborted) setDevelopersStatus('error');
      }
    });
    return () => controller.abort();
  }, [developersPage, developersReload, isAuthenticated, user?.id]);

  return (
    <div className="workspace discovery-page">
      <Link to="/discovery?tab=following">Back to Following Feed</Link>
      <section className="developer-discovery" aria-labelledby="developer-discovery-heading">
        <div className="developer-discovery__header">
          <div>
            <h2 id="developer-discovery-heading">Discover developers</h2>
            <p>Top active contributors in the ExtraBin community.</p>
          </div>
          {developersStatus === 'success' && developersTotalPages > 1 && (
            <div className="developer-discovery__pagination">
              <button type="button" disabled={developersPage === 0}
                onClick={() => setDevelopersPage((page) => Math.max(0, page - 1))} aria-label="Previous developers">‹</button>
              <span>{developersPage + 1} / {developersTotalPages}</span>
              <button type="button" disabled={developersPage + 1 >= developersTotalPages}
                onClick={() => setDevelopersPage((page) => page + 1)} aria-label="Next developers">›</button>
            </div>
          )}
        </div>
        {developersStatus === 'loading' && <p className="developer-discovery__state" role="status">Loading developers…</p>}
        {developersStatus === 'error' && (
          <p className="developer-discovery__state" role="alert">
            Couldn’t load developers.{' '}
            <button type="button" onClick={() => setDevelopersReload((value) => value + 1)}>Retry</button>
          </p>
        )}
        {developersStatus === 'success' && developers.length === 0 && <p className="developer-discovery__state">No developers to recommend yet.</p>}
        {developersStatus === 'success' && developers.length > 0 && (
          <div className="developer-discovery__grid">
            {developers.map((developer) => (
              <article className="developer-discovery__card" key={developer.username}>
                <Link to={`/users/${encodeURIComponent(developer.username)}`} className="developer-discovery__person">
                  <UserAvatar username={developer.username} size="md" alt={`@${developer.username}`} />
                  <span>@{developer.username}</span>
                </Link>
                <span className="developer-discovery__count">{developer.followerCount.toLocaleString()} followers</span>
                <FollowButton username={developer.username} followed={developer.followedByViewer} authenticated={isAuthenticated} compact
                  onChange={(followed) => setDevelopers((current) => current.map((item) => item.username === developer.username
                    ? { ...item, followedByViewer: followed, followerCount: Math.max(0, item.followerCount + (followed ? 1 : -1)) }
                    : item))} />
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
export default DeveloperDiscoveryPage;
