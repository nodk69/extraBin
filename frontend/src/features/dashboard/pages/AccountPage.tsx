import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../../components/ui/PaperIcon';
import { Loading } from '../../../components/ui/Loading';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { Select } from '../../../components/ui/dropdown';
import { useAuth } from '../../auth/context/AuthContext';
import { accountApi, PasteSummary, PagedResponse, TagItem } from '../api/accountApi';
import { EditPasteModal } from '../../pastes/components/EditPasteModal';
import { RevisionHistoryModal } from '../../pastes/components/RevisionHistoryModal';
import { PasteView } from '../../pastes/types/paste';
import { pasteApi } from '../../pastes/api/pasteApi';
import { folderApi, FolderItem, FolderOverview } from '../../pastes/api/folderApi';

export const AccountPage: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [pastesData, setPastesData] = useState<PagedResponse<PasteSummary> | null>(null);
  const [loadingPastes, setLoadingPastes] = useState(true);
  const [page, setPage] = useState(0);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<'updatedAt' | 'createdAt' | 'title'>('updatedAt');
  const [selectedTag, setSelectedTag] = useState('');
  const [myTags, setMyTags] = useState<TagItem[]>([]);
  const [selectedVisibility, setSelectedVisibility] = useState<string>('ALL');
  const [selectedTab, setSelectedTab] = useState<'FOLDER' | 'STARRED' | 'RECENT_VIEWED' | 'RECENT_EDITED'>('FOLDER');
  const [starredPastes, setStarredPastes] = useState<PasteSummary[]>([]);
  const [loadingStarred, setLoadingStarred] = useState(false);
  const [recentlyViewed, setRecentlyViewed] = useState<PasteSummary[]>([]);
  const [recentlyEdited, setRecentlyEdited] = useState<PasteSummary[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  // Folder states
  const [foldersOverview, setFoldersOverview] = useState<FolderOverview | null>(null);
  const folders = foldersOverview?.folders || [];
  const [selectedFolderId, setSelectedFolderId] = useState<'ALL' | 'UNFILED' | number>('ALL');
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderModalMode, setFolderModalMode] = useState<'CREATE' | 'RENAME'>('CREATE');
  const [folderFormName, setFolderFormName] = useState('');
  const [targetFolderId, setTargetFolderId] = useState<number | null>(null);
  const [deleteFolderConfirm, setDeleteFolderConfirm] = useState<FolderItem | null>(null);
  const [movingPaste, setMovingPaste] = useState<PasteSummary | null>(null);

  // Edit and history modal states
  const [editingPaste, setEditingPaste] = useState<PasteView | null>(null);
  const [historyPasteId, setHistoryPasteId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isLoading, isAuthenticated, navigate]);

  const loadFolders = () => {
    folderApi
      .listFolders()
      .then(setFoldersOverview)
      .catch(() => setFoldersOverview(null));
  };

  const loadPastes = (targetPage = 0, folderTarget = selectedFolderId) => {
    setLoadingPastes(true);
    const folderParam = typeof folderTarget === 'number' ? folderTarget : undefined;
    const unfiledParam = folderTarget === 'UNFILED' ? true : undefined;
    accountApi
      .getMyPastes(
        targetPage,
        15,
        folderParam,
        unfiledParam,
        debouncedSearch.trim() || undefined,
        selectedTag || undefined,
        sortBy,
        sortBy === 'title' ? 'asc' : 'desc'
      )
      .then((data) => {
        setPastesData(data);
        setPage(targetPage);
      })
      .catch(() => setPastesData(null))
      .finally(() => setLoadingPastes(false));
  };

  const loadStarredPastes = () => {
    setLoadingStarred(true);
    accountApi
      .getStarredPastes()
      .then(setStarredPastes)
      .catch(() => setStarredPastes([]))
      .finally(() => setLoadingStarred(false));
  };

  const loadMyTags = () => {
    accountApi
      .getMyTags()
      .then(setMyTags)
      .catch(() => setMyTags([]));
  };

  const loadRecentlyViewed = () => {
    setLoadingRecent(true);
    accountApi
      .getRecentlyViewed()
      .then(setRecentlyViewed)
      .catch(() => setRecentlyViewed([]))
      .finally(() => setLoadingRecent(false));
  };

  const loadRecentlyEdited = () => {
    setLoadingRecent(true);
    accountApi
      .getRecentlyEdited()
      .then(setRecentlyEdited)
      .catch(() => setRecentlyEdited([]))
      .finally(() => setLoadingRecent(false));
  };

  // Debounce the search box before triggering server-side queries
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (isAuthenticated && selectedTab === 'FOLDER') {
      loadPastes(0, selectedFolderId);
    }
  }, [isAuthenticated, selectedFolderId, selectedTab, debouncedSearch, selectedTag, sortBy]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (selectedTab === 'FOLDER') {
      loadFolders();
      loadMyTags();
    } else if (selectedTab === 'STARRED') {
      loadStarredPastes();
    } else if (selectedTab === 'RECENT_VIEWED') {
      loadRecentlyViewed();
    } else if (selectedTab === 'RECENT_EDITED') {
      loadRecentlyEdited();
    }
  }, [isAuthenticated, selectedTab]);

  const handleOpenEdit = async (pasteId: string) => {
    try {
      const fullPaste = await pasteApi.getPaste(pasteId);
      if (fullPaste.encryptionMode) {
        navigate(`/p/${pasteId}`);
        return;
      }
      setEditingPaste(fullPaste);
    } catch {
      // Ignore
    }
  };

  const handleDeleteOwned = async () => {
    if (!deleteConfirmId) return;
    setIsDeleting(true);
    try {
      await accountApi.deleteOwnedPaste(deleteConfirmId);
      setDeleteConfirmId(null);
      loadPastes(page);
    } catch {
      // Ignore
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenCreateFolder = () => {
    setFolderModalMode('CREATE');
    setFolderFormName('');
    setTargetFolderId(null);
    setIsFolderModalOpen(true);
  };

  const handleOpenRenameFolder = (folder: FolderItem) => {
    setFolderModalMode('RENAME');
    setFolderFormName(folder.name);
    setTargetFolderId(folder.id);
    setIsFolderModalOpen(true);
  };

  const handleCreateOrRenameFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = folderFormName.trim();
    if (!clean) return;
    try {
      if (folderModalMode === 'CREATE') {
        await folderApi.createFolder(clean);
      } else if (targetFolderId) {
        await folderApi.renameFolder(targetFolderId, clean);
      }
      setIsFolderModalOpen(false);
      setFolderFormName('');
      setTargetFolderId(null);
      loadFolders();
      loadPastes(page);
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to save folder.');
    }
  };

  const handleDeleteFolderConfirmed = async () => {
    if (!deleteFolderConfirm) return;
    try {
      const deletedId = deleteFolderConfirm.id;
      await folderApi.deleteFolder(deletedId);
      setDeleteFolderConfirm(null);
      if (selectedFolderId === deletedId) {
        setSelectedFolderId('ALL');
        loadPastes(0, 'ALL');
      } else {
        loadPastes(page);
      }
      loadFolders();
    } catch {
      // ignore
    }
  };

  const handleMovePasteConfirmed = async (destFolderId: number | null) => {
    if (!movingPaste) return;
    try {
      await folderApi.movePaste(movingPaste.id, destFolderId);
      setMovingPaste(null);
      loadPastes(page);
      loadFolders();
    } catch {
      // ignore
    }
  };

  // Compute stats from current data
  const stats = useMemo(() => {
    const items = pastesData?.items || [];
    const publicCount = items.filter((p) => p.visibility === 'PUBLIC').length;
    const unlistedCount = items.filter((p) => p.visibility === 'UNLISTED').length;
    const privateCount = items.filter((p) => p.visibility === 'PRIVATE').length;
    const totalLines = items.reduce((acc, p) => acc + (p.lineCount || 0), 0);
    const totalViews = items.reduce((acc, p) => acc + (p.views || 0), 0);
    return {
      publicCount,
      unlistedCount,
      privateCount,
      totalLines,
      totalViews,
      total: pastesData?.totalElements || items.length,
    };
  }, [pastesData]);

  // Visibility filter is applied client-side; search/sort/tag filtering happen server-side
  const filteredPastes = useMemo(() => {
    const items = pastesData?.items || [];
    if (selectedVisibility === 'ALL') return items;
    return items.filter((item) => item.visibility === selectedVisibility);
  }, [pastesData, selectedVisibility]);

  if (isLoading || !user) {
    return (
      <div className="workspace">
        <div className="py-24 text-center">
          <div className="inline-block animate-spin text-[#ff5c3d] mb-3">
            <Icon name="spark" size={28} />
          </div>
          <div className="font-mono text-xs text-[#74786f] tracking-wider uppercase">
            Loading developer profile...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="eyebrow">
            <span></span> DEVELOPER PROFILE
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#17201d] m-0">
            Account Dashboard
          </h1>
        </div>
      </div>

      {/* Profile Overview Card */}
      <div className="account-profile-card">
        {/* User Identity info */}
        <div className="flex items-center gap-4">
          <UserAvatar user={user} size="xl" showStatus={true} />
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg sm:text-xl font-bold text-[#17201d] m-0 font-mono tracking-tight">
                {user.username}
              </h2>
              <span className="badge-new bg-[#17201d] text-[#c6f05b]">VERIFIED</span>
            </div>
            <p className="text-xs text-[#74786f] m-0 font-mono">{user.email}</p>
          </div>
        </div>

        {/* 4 Stat Widgets */}
        <div className="account-stats-grid">
          <div className="account-stat-box">
            <span className="account-stat-value">{stats.total}</span>
            <span className="account-stat-label">
              <Icon name="file" size={12} className="text-[#ff5c3d]" />
              Total Pastes
            </span>
          </div>

          <div className="account-stat-box">
            <span className="account-stat-value">{stats.publicCount}</span>
            <span className="account-stat-label">
              <Icon name="globe" size={12} className="text-[#15803d]" />
              Public
            </span>
          </div>

          <div className="account-stat-box">
            <span className="account-stat-value">{stats.unlistedCount + stats.privateCount}</span>
            <span className="account-stat-label">
              <Icon name="lock" size={12} className="text-[#0369a1]" />
              Secret / Private
            </span>
          </div>

          <div className="account-stat-box">
            <span className="account-stat-value">
              {stats.totalLines > 999 ? `${(stats.totalLines / 1000).toFixed(1)}k` : stats.totalLines}
            </span>
            <span className="account-stat-label">
              <Icon name="code" size={12} className="text-[#ff5c3d]" />
              Lines Stored
            </span>
          </div>
        </div>
      </div>

      {/* Tab Switcher: Folders vs Starred */}
      <div className="flex items-center gap-2 mb-4 font-mono text-xs">
        <button
          type="button"
          onClick={() => setSelectedTab('FOLDER')}
          className={`px-4 py-2 rounded-lg border-2 font-bold transition-all ${
            selectedTab === 'FOLDER'
              ? 'bg-[#17201d] text-white border-[#17201d] shadow-[3px_3px_0px_#ff5c3d]'
              : 'bg-white text-[#74786f] border-[#d5d0c5] hover:text-[#17201d] hover:border-[#17201d]'
          }`}
        >
          <Icon name="folder" size={14} className="inline mr-1.5" />
          My Pastes
        </button>
        <button
          type="button"
          onClick={() => setSelectedTab('STARRED')}
          className={`px-4 py-2 rounded-lg border-2 font-bold transition-all ${
            selectedTab === 'STARRED'
              ? 'bg-[#17201d] text-white border-[#17201d] shadow-[3px_3px_0px_#ff5c3d]'
              : 'bg-white text-[#74786f] border-[#d5d0c5] hover:text-[#17201d] hover:border-[#17201d]'
          }`}
        >
          <Icon name="spark" size={14} className="inline mr-1.5" />
          Starred ({starredPastes.length})
        </button>
        <button
          type="button"
          onClick={() => setSelectedTab('RECENT_VIEWED')}
          className={`px-4 py-2 rounded-lg border-2 font-bold transition-all ${
            selectedTab === 'RECENT_VIEWED'
              ? 'bg-[#17201d] text-white border-[#17201d] shadow-[3px_3px_0px_#ff5c3d]'
              : 'bg-white text-[#74786f] border-[#d5d0c5] hover:text-[#17201d] hover:border-[#17201d]'
          }`}
        >
          <Icon name="eye" size={14} className="inline mr-1.5" />
          Recently Viewed
        </button>
        <button
          type="button"
          onClick={() => setSelectedTab('RECENT_EDITED')}
          className={`px-4 py-2 rounded-lg border-2 font-bold transition-all ${
            selectedTab === 'RECENT_EDITED'
              ? 'bg-[#17201d] text-white border-[#17201d] shadow-[3px_3px_0px_#ff5c3d]'
              : 'bg-white text-[#74786f] border-[#d5d0c5] hover:text-[#17201d] hover:border-[#17201d]'
          }`}
        >
          <Icon name="history" size={14} className="inline mr-1.5" />
          Recently Edited
        </button>
      </div>

      {selectedTab === 'FOLDER' && (
      <>
      {/* Folders & Organization Section */}
          <div className="account-folders-bar flex items-center justify-between flex-wrap gap-2 p-3 bg-[#faf8f2] border-2 border-[#17201d] rounded-xl shadow-[3px_3px_0px_#17201d] mb-4">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 max-w-full font-mono text-xs">
          <span className="font-bold text-[#17201d] flex items-center gap-1.5 mr-1 shrink-0">
            <Icon name="folder" size={14} className="text-[#ff5c3d]" />
            <span>Folders:</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectedFolderId('ALL');
              loadPastes(0, 'ALL');
            }}
            className={`px-3 py-1.5 rounded-lg border font-semibold whitespace-nowrap transition-all ${
              selectedFolderId === 'ALL'
                ? 'bg-[#17201d] text-white border-[#17201d] shadow-[2px_2px_0px_#d5d0c5]'
                : 'bg-white text-[#74786f] border-[#d5d0c5] hover:text-[#17201d] hover:border-[#17201d]'
            }`}
          >
            All Pastes ({foldersOverview?.totalCount ?? stats.total})
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedFolderId('UNFILED');
              loadPastes(0, 'UNFILED');
            }}
            className={`px-3 py-1.5 rounded-lg border font-semibold whitespace-nowrap transition-all ${
              selectedFolderId === 'UNFILED'
                ? 'bg-[#17201d] text-white border-[#17201d] shadow-[2px_2px_0px_#d5d0c5]'
                : 'bg-white text-[#74786f] border-[#d5d0c5] hover:text-[#17201d] hover:border-[#17201d]'
            }`}
          >
            Unfiled ({foldersOverview?.unfiledCount ?? 0})
          </button>
          {folders.map((f) => (
            <div
              key={f.id}
              className={`inline-flex items-center rounded-lg border font-semibold whitespace-nowrap transition-all ${
                selectedFolderId === f.id
                  ? 'bg-[#17201d] text-white border-[#17201d] shadow-[2px_2px_0px_#d5d0c5]'
                  : 'bg-white text-[#17201d] border-[#d5d0c5] hover:border-[#17201d]'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setSelectedFolderId(f.id);
                  loadPastes(0, f.id);
                }}
                className="px-2.5 py-1.5 hover:underline cursor-pointer flex items-center gap-1.5"
              >
                <span>{f.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    selectedFolderId === f.id ? 'bg-[#333] text-[#c6f05b]' : 'bg-[#ebe7dc] text-[#555]'
                  }`}
                >
                  {f.pasteCount}
                </span>
              </button>
              <button
                type="button"
                title="Rename folder"
                aria-label={`Rename folder ${f.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenRenameFolder(f);
                }}
                className={`p-1.5 hover:text-[#ff5c3d] ${selectedFolderId === f.id ? 'text-gray-300' : 'text-gray-500'}`}
              >
                <Icon name="edit" size={11} />
              </button>
              <button
                type="button"
                title="Delete folder"
                aria-label={`Delete folder ${f.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteFolderConfirm(f);
                }}
                className={`p-1.5 hover:text-[#dc2626] ${selectedFolderId === f.id ? 'text-gray-300' : 'text-gray-500'}`}
              >
                <Icon name="trash" size={11} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={handleOpenCreateFolder}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#ff5c3d] text-[#17201d] font-mono text-xs font-bold rounded-lg border border-[#17201d] shadow-[2px_2px_0px_#17201d] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all"
        >
          <Icon name="plus" size={12} />
          <span>New Folder</span>
        </button>
      </div>

      {/* Pastes Management Section */}
      <div className="space-y-4">
        {/* Toolbar: Filters and Search */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Visibility Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 font-mono text-xs">
            {[
              { id: 'ALL', label: `All (${pastesData?.totalElements || 0})` },
              { id: 'PUBLIC', label: 'Public' },
              { id: 'UNLISTED', label: 'Unlisted' },
              { id: 'PRIVATE', label: 'Private' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedVisibility(tab.id)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                  selectedVisibility === tab.id
                    ? 'bg-[#17201d] text-white border-[#17201d] shadow-[2px_2px_0px_#d5d0c5]'
                    : 'bg-white text-[#74786f] border-[#d5d0c5] hover:text-[#17201d] hover:border-[#17201d]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Sort Selector */}
            <Select
              id="account-sort-select"
              value={sortBy}
              onChange={(val) => setSortBy(val as 'updatedAt' | 'createdAt' | 'title')}
              ariaLabel="Sort pastes"
              size="sm"
              menuWidth={180}
              options={[
                { value: 'updatedAt', label: 'Recently Updated' },
                { value: 'createdAt', label: 'Recently Created' },
                { value: 'title', label: 'Alphabetical' },
              ]}
            />

            {/* Tag Filter */}
            {myTags.length > 0 && (
              <Select
                id="account-tag-filter"
                value={selectedTag}
                onChange={(val) => setSelectedTag(val)}
                ariaLabel="Filter by tag"
                size="sm"
                menuWidth={180}
                options={[
                  { value: '', label: 'All Tags' },
                  ...myTags.map((t) => ({ value: t.name, label: `#${t.name}` })),
                ]}
              />
            )}

            {/* Search Box */}
            <div className="relative min-w-[240px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title or content..."
                className="controls-input pl-8 text-xs font-mono"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#74786f] pointer-events-none">
                <Icon name="search" size={13} />
              </span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#74786f] hover:text-[#17201d]"
                >
                  &times;
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content Table or Empty State */}
        {loadingPastes ? (
          <Loading variant="card" message="Loading your repository pastes..." />
        ) : !pastesData || pastesData.items.length === 0 ? (
          <div className="account-table-card p-16 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#ebe7dc] border border-[#d5d0c5] flex items-center justify-center text-[#74786f]">
              <Icon name="file" size={28} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#17201d] m-0">No pastes found</h3>
              <p className="text-xs text-[#74786f] mt-1 max-w-sm mx-auto">
                {selectedFolderId !== 'ALL'
                  ? 'No pastes in this folder. Create a new paste or move an existing paste here.'
                  : 'Share source code, snippets, configuration templates, or secret notes with custom expiration and password locks.'}
              </p>
            </div>
            <Link
              to="/"
              className="inline-flex items-center gap-2 py-2 px-4 rounded-lg bg-[#ff5c3d] text-[#17201d] text-xs font-bold shadow-[2px_3px_0px_#17201d] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all no-underline"
            >
              <Icon name="plus" size={14} />
              <span>Create new paste</span>
            </Link>
          </div>
        ) : filteredPastes.length === 0 ? (
          <div className="account-table-card p-12 text-center text-[#74786f] font-mono text-xs">
            No pastes match your current search or visibility filter.
          </div>
        ) : (
          <div className="account-table-card">
            <div className="overflow-x-auto">
              <table className="account-table">
                <thead>
                  <tr>
                    <th>Title &amp; ID</th>
                    <th>Language</th>
                    <th>Visibility</th>
                    <th>Size &amp; Lines</th>
                    <th>Views</th>
                    <th>Created &amp; Expiration</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPastes.map((p) => (
                    <tr key={p.id}>
                      {/* Title & Identifier & Folder Badge */}
                      <td>
                        <div className="flex flex-col gap-1">
                          <Link
                            to={`/p/${p.id}`}
                            className="font-bold text-[#17201d] hover:text-[#ff5c3d] transition-colors flex items-center gap-2 no-underline"
                          >
                            <span>{p.title || 'Untitled Paste'}</span>
                            <span className="font-mono text-[11px] text-[#74786f] px-1.5 py-0.5 rounded bg-[#ebe7dc] border border-[#d5d0c5]">
                              #{p.id.slice(0, 8)}
                            </span>
                          </Link>
                          {p.folderName && (
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-[#0369a1] bg-[#e0f2fe] border border-[#bae6fd] px-1.5 py-0.5 rounded w-fit">
                              <Icon name="folder" size={10} />
                              <span>{p.folderName}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Language */}
                      <td>
                        <span className="font-mono text-[11px] font-semibold px-2 py-1 rounded bg-[#ebe7dc] text-[#17201d] border border-[#d5d0c5]">
                          {p.language.toUpperCase()}
                        </span>
                      </td>

                      {/* Visibility */}
                      <td>
                        {p.visibility === 'PUBLIC' && (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#15803d] border border-[#86efac]">
                            <Icon name="globe" size={11} />
                            <span>Public</span>
                          </span>
                        )}
                        {p.visibility === 'UNLISTED' && (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#e0f2fe] text-[#0369a1] border border-[#bae6fd]">
                            <Icon name="spark" size={11} />
                            <span>Unlisted</span>
                          </span>
                        )}
                        {p.visibility === 'PRIVATE' && (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#b45309] border border-[#fde68a]">
                            <Icon name="lock" size={11} />
                            <span>Private</span>
                          </span>
                        )}
                      </td>

                      {/* Size & Line Count */}
                      <td className="font-mono text-xs text-[#5a645f]">
                        {(p.contentSizeBytes / 1024).toFixed(1)} KB · {p.lineCount}L
                      </td>

                      {/* Views */}
                      <td className="font-mono text-xs font-semibold text-[#17201d]">
                        {(p.views ?? 0).toLocaleString()}
                      </td>

                      {/* Created / Expires */}
                      <td>
                        <div className="font-mono text-xs text-[#17201d]">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </div>
                        {p.expiresAt && (
                          <div className="font-mono text-[10px] text-[#ff5c3d] flex items-center gap-1 mt-0.5 font-semibold">
                            <Icon name="clock" size={10} />
                            <span>Exp: {new Date(p.expiresAt).toLocaleDateString()}</span>
                          </div>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td className="text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Link to={`/p/${p.id}`} className="no-underline">
                            <button
                              type="button"
                              className="action-icon-btn"
                              title="View Paste"
                              aria-label={`View paste ${p.title || p.id}`}
                            >
                              <Icon name="external-link" size={13} />
                            </button>
                          </Link>
                          <button
                            type="button"
                            className="action-icon-btn"
                            onClick={() => setMovingPaste(p)}
                            title="Move to Folder"
                            aria-label={`Move paste ${p.title || p.id} to folder`}
                          >
                            <Icon name="folder" size={13} />
                          </button>
                          <button
                            type="button"
                            className="action-icon-btn"
                            onClick={() => handleOpenEdit(p.id)}
                            title="Edit Paste"
                            aria-label={`Edit paste ${p.title || p.id}`}
                          >
                            <Icon name="edit" size={13} />
                          </button>
                          <button
                            type="button"
                            className="action-icon-btn"
                            onClick={() => setHistoryPasteId(p.id)}
                            title="Revision History"
                            aria-label={`View revisions of paste ${p.title || p.id}`}
                          >
                            <Icon name="history" size={13} />
                          </button>
                          <button
                            type="button"
                            className="action-icon-btn danger"
                            onClick={() => setDeleteConfirmId(p.id)}
                            title="Delete Paste"
                            aria-label={`Delete paste ${p.title || p.id}`}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {pastesData.totalPages > 1 && (
              <div className="p-4 bg-[#ebe7dc] border-t border-[#d5d0c5] flex items-center justify-between font-mono text-xs text-[#74786f]">
                <span>
                  Page {page + 1} of {pastesData.totalPages} ({pastesData.totalElements} items)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pastesData.isFirst}
                    onClick={() => loadPastes(page - 1)}
                    className="px-3 py-1.5 rounded-lg border border-[#d5d0c5] bg-white text-[#17201d] font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#17201d] transition-all shadow-[1px_1px_0px_#d5d0c5]"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={pastesData.isLast}
                    onClick={() => loadPastes(page + 1)}
                    className="px-3 py-1.5 rounded-lg border border-[#d5d0c5] bg-white text-[#17201d] font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#17201d] transition-all shadow-[1px_1px_0px_#d5d0c5]"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </>
      )}

      {selectedTab === 'STARRED' && (
        <div className="space-y-4">
          {loadingStarred ? (
            <Loading variant="card" message="Loading your starred pastes..." />
          ) : starredPastes.length === 0 ? (
            <div className="account-table-card p-16 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#ebe7dc] border border-[#d5d0c5] flex items-center justify-center text-[#74786f]">
                <Icon name="spark" size={28} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#17201d] m-0">No starred pastes yet</h3>
                <p className="text-xs text-[#74786f] mt-1 max-w-sm mx-auto">
                  Star pastes you want to revisit later. They'll appear here for quick access.
                </p>
              </div>
            </div>
          ) : (
            <div className="account-table-card">
              <div className="overflow-x-auto">
                <table className="account-table">
                  <thead>
                    <tr>
                      <th>Title &amp; ID</th>
                      <th>Language</th>
                      <th>Visibility</th>
                      <th>Size &amp; Lines</th>
                      <th>Views</th>
                      <th>Created &amp; Expiration</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {starredPastes.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="flex flex-col gap-1">
                            <Link
                              to={`/p/${p.id}`}
                              className="font-bold text-[#17201d] hover:text-[#ff5c3d] transition-colors flex items-center gap-2 no-underline"
                            >
                              <span>{p.title || 'Untitled Paste'}</span>
                              <span className="font-mono text-[11px] text-[#74786f] px-1.5 py-0.5 rounded bg-[#ebe7dc] border border-[#d5d0c5]">
                                #{p.id.slice(0, 8)}
                              </span>
                            </Link>
                            {p.folderName && (
                              <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-[#0369a1] bg-[#e0f2fe] border border-[#bae6fd] px-1.5 py-0.5 rounded w-fit">
                                <Icon name="folder" size={10} />
                                <span>{p.folderName}</span>
                              </span>
                            )}
                          </div>
                        </td>

                        <td>
                          <span className="font-mono text-[11px] font-semibold px-2 py-1 rounded bg-[#ebe7dc] text-[#17201d] border border-[#d5d0c5]">
                            {p.language.toUpperCase()}
                          </span>
                        </td>

                        <td>
                          {p.visibility === 'PUBLIC' && (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#15803d] border border-[#86efac]">
                              <Icon name="globe" size={11} />
                              <span>Public</span>
                            </span>
                          )}
                          {p.visibility === 'UNLISTED' && (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#e0f2fe] text-[#0369a1] border border-[#bae6fd]">
                              <Icon name="spark" size={11} />
                              <span>Unlisted</span>
                            </span>
                          )}
                          {p.visibility === 'PRIVATE' && (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#b45309] border border-[#fde68a]">
                              <Icon name="lock" size={11} />
                              <span>Private</span>
                            </span>
                          )}
                        </td>

                        <td className="font-mono text-xs text-[#5a645f]">
                          {(p.contentSizeBytes / 1024).toFixed(1)} KB · {p.lineCount}L
                        </td>

                        <td className="font-mono text-xs font-semibold text-[#17201d]">
                          {(p.views ?? 0).toLocaleString()}
                        </td>

                        <td>
                          <div className="font-mono text-xs text-[#17201d]">
                            {new Date(p.createdAt).toLocaleDateString()}
                          </div>
                          {p.expiresAt && (
                            <div className="font-mono text-[10px] text-[#ff5c3d] flex items-center gap-1 mt-0.5 font-semibold">
                              <Icon name="clock" size={10} />
                              <span>Exp: {new Date(p.expiresAt).toLocaleDateString()}</span>
                            </div>
                          )}
                        </td>

                        <td className="text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <Link to={`/p/${p.id}`} className="no-underline">
                              <button
                                type="button"
                                className="action-icon-btn"
                                title="View Paste"
                                aria-label={`View paste ${p.title || p.id}`}
                              >
                                <Icon name="external-link" size={13} />
                              </button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedTab === 'RECENT_VIEWED' && (
        <div className="space-y-4">
          {loadingRecent ? (
            <Loading variant="card" message="Loading recently viewed pastes..." />
          ) : recentlyViewed.length === 0 ? (
            <div className="account-table-card p-16 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#ebe7dc] border border-[#d5d0c5] flex items-center justify-center text-[#74786f]">
                <Icon name="eye" size={28} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#17201d] m-0">Nothing viewed yet</h3>
                <p className="text-xs text-[#74786f] mt-1 max-w-sm mx-auto">
                  Pastes you open while signed in will show up here so you can jump back to them.
                </p>
              </div>
            </div>
          ) : (
            <div className="account-table-card">
              <div className="p-4 bg-[#faf8f2] border-b border-[#d5d0c5] font-mono text-[11px] text-[#74786f]">
                Last {recentlyViewed.length} pastes you opened, most recent first.
              </div>
              <div className="overflow-x-auto">
                <table className="account-table">
                  <thead>
                    <tr>
                      <th>Title &amp; ID</th>
                      <th>Language</th>
                      <th>Visibility</th>
                      <th>Size &amp; Lines</th>
                      <th>Created</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentlyViewed.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Link
                            to={`/p/${p.id}`}
                            className="font-bold text-[#17201d] hover:text-[#ff5c3d] transition-colors flex items-center gap-2 no-underline"
                          >
                            <span>{p.title || 'Untitled Paste'}</span>
                            <span className="font-mono text-[11px] text-[#74786f] px-1.5 py-0.5 rounded bg-[#ebe7dc] border border-[#d5d0c5]">
                              #{p.id.slice(0, 8)}
                            </span>
                          </Link>
                        </td>
                        <td>
                          <span className="font-mono text-[11px] font-semibold px-2 py-1 rounded bg-[#ebe7dc] text-[#17201d] border border-[#d5d0c5]">
                            {p.language.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#ebe7dc] text-[#5a645f] border border-[#d5d0c5]">
                            {p.visibility}
                          </span>
                        </td>
                        <td className="font-mono text-xs text-[#5a645f]">
                          {(p.contentSizeBytes / 1024).toFixed(1)} KB · {p.lineCount}L
                        </td>
                        <td className="font-mono text-xs text-[#17201d]">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </td>
                        <td className="text-right">
                          <Link to={`/p/${p.id}`} className="no-underline">
                            <button type="button" className="action-icon-btn" title="Open Paste">
                              <Icon name="external-link" size={13} />
                            </button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedTab === 'RECENT_EDITED' && (
        <div className="space-y-4">
          {loadingRecent ? (
            <Loading variant="card" message="Loading recently edited pastes..." />
          ) : recentlyEdited.length === 0 ? (
            <div className="account-table-card p-16 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#ebe7dc] border border-[#d5d0c5] flex items-center justify-center text-[#74786f]">
                <Icon name="history" size={28} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#17201d] m-0">No edits yet</h3>
                <p className="text-xs text-[#74786f] mt-1 max-w-sm mx-auto">
                  Pastes you edit will appear here with the most recently changed first.
                </p>
              </div>
            </div>
          ) : (
            <div className="account-table-card">
              <div className="p-4 bg-[#faf8f2] border-b border-[#d5d0c5] font-mono text-[11px] text-[#74786f]">
                Last {recentlyEdited.length} pastes you edited, most recent change first.
              </div>
              <div className="overflow-x-auto">
                <table className="account-table">
                  <thead>
                    <tr>
                      <th>Title &amp; ID</th>
                      <th>Language</th>
                      <th>Visibility</th>
                      <th>Size &amp; Lines</th>
                      <th>Created</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentlyEdited.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Link
                            to={`/p/${p.id}`}
                            className="font-bold text-[#17201d] hover:text-[#ff5c3d] transition-colors flex items-center gap-2 no-underline"
                          >
                            <span>{p.title || 'Untitled Paste'}</span>
                            <span className="font-mono text-[11px] text-[#74786f] px-1.5 py-0.5 rounded bg-[#ebe7dc] border border-[#d5d0c5]">
                              #{p.id.slice(0, 8)}
                            </span>
                          </Link>
                        </td>
                        <td>
                          <span className="font-mono text-[11px] font-semibold px-2 py-1 rounded bg-[#ebe7dc] text-[#17201d] border border-[#d5d0c5]">
                            {p.language.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#ebe7dc] text-[#5a645f] border border-[#d5d0c5]">
                            {p.visibility}
                          </span>
                        </td>
                        <td className="font-mono text-xs text-[#5a645f]">
                          {(p.contentSizeBytes / 1024).toFixed(1)} KB · {p.lineCount}L
                        </td>
                        <td className="font-mono text-xs text-[#17201d]">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </td>
                        <td className="text-right">
                          <Link to={`/p/${p.id}`} className="no-underline">
                            <button type="button" className="action-icon-btn" title="Open Paste">
                              <Icon name="external-link" size={13} />
                            </button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editingPaste && (
        <EditPasteModal
          paste={editingPaste}
          isOpen={!!editingPaste}
          onClose={() => setEditingPaste(null)}
          onSuccess={() => loadPastes(page)}
        />
      )}

      {/* History Modal */}
      {historyPasteId && (
        <RevisionHistoryModal
          pasteId={historyPasteId}
          isOpen={!!historyPasteId}
          onClose={() => setHistoryPasteId(null)}
        />
      )}

      {/* Modern Paper Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border-2 border-[#17201d] bg-[#faf8f2] p-6 shadow-[8px_10px_0px_#17201d] space-y-4">
            <div className="flex items-center gap-2.5 text-[#dc2626]">
              <div className="p-2 rounded-lg bg-[#fee2e2] border border-[#fca5a5]">
                <Icon name="trash" size={18} />
              </div>
              <h3 className="text-base font-bold text-[#17201d] m-0">Delete Paste</h3>
            </div>
            <p className="text-xs text-[#5a645f] leading-relaxed">
              Are you sure you want to permanently delete this paste and all its revision snapshots? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#d5d0c5]">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-3.5 py-1.5 rounded-lg border border-[#d5d0c5] bg-white text-xs font-semibold text-[#17201d] hover:bg-[#ebe7dc] transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteOwned}
                className="px-4 py-1.5 rounded-lg border border-[#dc2626] bg-[#dc2626] text-white text-xs font-bold shadow-[2px_2px_0px_#17201d] hover:bg-[#b91c1c] disabled:opacity-50 transition-all"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Folder Create/Rename Modal */}
      {isFolderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border-2 border-[#17201d] bg-[#faf8f2] p-6 shadow-[8px_10px_0px_#17201d] space-y-4">
            <div className="flex items-center gap-2.5 text-[#17201d]">
              <div className="p-2 rounded-lg bg-[#ebe7dc] border border-[#d5d0c5]">
                <Icon name="folder" size={18} className="text-[#ff5c3d]" />
              </div>
              <h3 className="text-base font-bold text-[#17201d] m-0">
                {folderModalMode === 'CREATE' ? 'Create New Folder' : 'Rename Folder'}
              </h3>
            </div>
            <form onSubmit={handleCreateOrRenameFolder} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-bold text-[#17201d] mb-1.5">
                  Folder Name
                </label>
                <input
                  type="text"
                  maxLength={64}
                  value={folderFormName}
                  onChange={(e) => setFolderFormName(e.target.value)}
                  placeholder="e.g. backend-snippets, configs, logs"
                  autoFocus
                  required
                  className="controls-input text-xs font-mono w-full"
                />
              </div>
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#d5d0c5]">
                <button
                  type="button"
                  onClick={() => setIsFolderModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-[#d5d0c5] bg-white text-xs font-semibold text-[#17201d] hover:bg-[#ebe7dc] transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!folderFormName.trim()}
                  className="px-4 py-1.5 rounded-lg border border-[#17201d] bg-[#ff5c3d] text-[#17201d] text-xs font-bold shadow-[2px_2px_0px_#17201d] hover:translate-x-[-1px] hover:translate-y-[-1px] disabled:opacity-50 transition-all"
                >
                  {folderModalMode === 'CREATE' ? 'Create Folder' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Folder Confirmation Modal */}
      {deleteFolderConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border-2 border-[#17201d] bg-[#faf8f2] p-6 shadow-[8px_10px_0px_#17201d] space-y-4">
            <div className="flex items-center gap-2.5 text-[#dc2626]">
              <div className="p-2 rounded-lg bg-[#fee2e2] border border-[#fca5a5]">
                <Icon name="trash" size={18} />
              </div>
              <h3 className="text-base font-bold text-[#17201d] m-0">Delete Folder</h3>
            </div>
            <p className="text-xs text-[#5a645f] leading-relaxed">
              Are you sure you want to delete folder <strong className="text-[#17201d]">"{deleteFolderConfirm.name}"</strong>?
            </p>
            <div className="p-3 bg-[#ebe7dc] border border-[#d5d0c5] rounded-lg text-[11px] font-mono text-[#17201d]">
              <strong>Note:</strong> Pastes in this folder will <em>not</em> be deleted. They will safely become <strong>Unfiled</strong>.
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#d5d0c5]">
              <button
                type="button"
                onClick={() => setDeleteFolderConfirm(null)}
                className="px-3.5 py-1.5 rounded-lg border border-[#d5d0c5] bg-white text-xs font-semibold text-[#17201d] hover:bg-[#ebe7dc] transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteFolderConfirmed}
                className="px-4 py-1.5 rounded-lg border border-[#dc2626] bg-[#dc2626] text-white text-xs font-bold shadow-[2px_2px_0px_#17201d] hover:bg-[#b91c1c] transition-all"
              >
                Delete Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Paste To Folder Modal */}
      {movingPaste && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border-2 border-[#17201d] bg-[#faf8f2] p-6 shadow-[8px_10px_0px_#17201d] space-y-4">
            <div className="flex items-center gap-2.5 text-[#17201d]">
              <div className="p-2 rounded-lg bg-[#ebe7dc] border border-[#d5d0c5]">
                <Icon name="folder" size={18} className="text-[#ff5c3d]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#17201d] m-0">Move Paste</h3>
                <p className="text-[11px] font-mono text-[#74786f] m-0">
                  {movingPaste.title || `#${movingPaste.id.slice(0, 8)}`}
                </p>
              </div>
            </div>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              <button
                type="button"
                onClick={() => handleMovePasteConfirmed(null)}
                className={`w-full text-left px-3 py-2 rounded-lg border font-mono text-xs flex items-center justify-between transition-all ${
                  !movingPaste.folderId
                    ? 'bg-[#17201d] text-white border-[#17201d] font-bold'
                    : 'bg-white text-[#17201d] border-[#d5d0c5] hover:bg-[#ebe7dc]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon name="file" size={13} />
                  <span>Unfiled (No folder)</span>
                </span>
                {!movingPaste.folderId && <Icon name="check" size={13} className="text-[#c6f05b]" />}
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => handleMovePasteConfirmed(f.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg border font-mono text-xs flex items-center justify-between transition-all ${
                    movingPaste.folderId === f.id
                      ? 'bg-[#17201d] text-white border-[#17201d] font-bold'
                      : 'bg-white text-[#17201d] border-[#d5d0c5] hover:bg-[#ebe7dc]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon name="folder" size={13} className="text-[#ff5c3d]" />
                    <span>{f.name}</span>
                  </span>
                  {movingPaste.folderId === f.id && <Icon name="check" size={13} className="text-[#c6f05b]" />}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-end pt-2 border-t border-[#d5d0c5]">
              <button
                type="button"
                onClick={() => setMovingPaste(null)}
                className="px-3.5 py-1.5 rounded-lg border border-[#d5d0c5] bg-white text-xs font-semibold text-[#17201d] hover:bg-[#ebe7dc] transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountPage;
