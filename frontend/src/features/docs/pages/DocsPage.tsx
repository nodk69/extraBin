import React, { useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Shield,
  Terminal,
  BookOpen,
  Flame,
  KeyRound,
  FileCode,
  Layers,
  Sparkles,
  ArrowLeft,
  History,
  QrCode,
  FolderTree,
  MessageSquare,
  Check,
  Compass,
  Tag,
  Users,
} from 'lucide-react';
import encryptedMarkdown from '../../../../../docs/features/encrypted-pastes.md?raw';
import apiMarkdown from '../../../../../docs/features/paste-as-api.md?raw';
import burnMarkdown from '../../../../../docs/features/burn-after-read.md?raw';
import passwordMarkdown from '../../../../../docs/features/password-protected.md?raw';
import multiFileMarkdown from '../../../../../docs/features/multi-file.md?raw';
import foldersMarkdown from '../../../../../docs/features/folders.md?raw';
import revisionHistoryMarkdown from '../../../../../docs/features/revision-history.md?raw';
import responsiveEmbedsMarkdown from '../../../../../docs/features/responsive-embeds.md?raw';
import commentsMarkdown from '../../../../../docs/features/comments-and-replies.md?raw';
import qrCodesMarkdown from '../../../../../docs/features/qr-codes.md?raw';
import discoveryMarkdown from '../../../../../docs/features/discovery.md?raw';
import tagsAndLibraryMarkdown from '../../../../../docs/features/tags-and-library.md?raw';
import authorProfilesMarkdown from '../../../../../docs/features/author-profiles.md?raw';

import { EncryptedPastesDemo } from '../demos/EncryptedPastesDemo';
import { PasteAsApiDemo } from '../demos/PasteAsApiDemo';
import { BurnAfterReadDemo } from '../demos/BurnAfterReadDemo';
import { PasswordProtectedDemo } from '../demos/PasswordProtectedDemo';
import { MultiFileDemo } from '../demos/MultiFileDemo';
import { FoldersDemo } from '../demos/FoldersDemo';
import { RevisionHistoryDemo } from '../demos/RevisionHistoryDemo';
import { ResponsiveEmbedsDemo } from '../demos/ResponsiveEmbedsDemo';
import { CommentsDemo } from '../demos/CommentsDemo';
import { QrCodeDemo } from '../demos/QrCodeDemo';

export interface FeatureCatalogItem {
  id: string;
  title: string;
  tag: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  summary: string;
  guideRoute?: string;
}

const featuresCatalog: FeatureCatalogItem[] = [
  {
    id: 'encrypted',
    title: 'Zero-Knowledge Encrypted Pastes',
    tag: 'Cryptographic Privacy',
    icon: Shield,
    color: 'bg-[#dcfce7] border-[#16a34a] text-[#166534]',
    summary: 'Client-side AES-256-GCM encryption where the server never sees plaintext text or secret decryption keys.',
    guideRoute: '/docs/features/encrypted-pastes',
  },
  {
    id: 'api-suffixes',
    title: 'Paste as API',
    tag: 'Developer Automation',
    icon: Terminal,
    color: 'bg-[#e0f2fe] border-[#0284c7] text-[#0369a1]',
    summary: 'Direct machine consumption via .json, .yaml, .md, .txt with deterministic SHA-256 ETags and HTTP caching.',
    guideRoute: '/docs/features/paste-as-api',
  },
  {
    id: 'burn',
    title: 'Burn-After-Reading Pastes',
    tag: 'Self-Destructing',
    icon: Flame,
    color: 'bg-[#fee2e2] border-[#ef4444] text-[#b91c1c]',
    summary: 'Atomic single-read lifecycle where records are automatically deleted from database storage upon first view.',
    guideRoute: '/docs/features/burn-after-read',
  },
  {
    id: 'passcode',
    title: 'Password Protection',
    tag: 'Access Gate',
    icon: KeyRound,
    color: 'bg-[#fef9c3] border-[#ca8a04] text-[#854d0e]',
    summary: 'Server-side BCrypt passcode hashing preventing unauthenticated viewers from loading snippet content.',
    guideRoute: '/docs/features/password-protected',
  },
  {
    id: 'multifile',
    title: 'Multi-File Workspaces',
    tag: 'Code Collections',
    icon: Layers,
    color: 'bg-[#f3e8ff] border-[#a855f7] text-[#7e22ce]',
    summary: 'Package multiple files with tabbed navigation, unified syntax counts, and single-click ZIP archive exports.',
    guideRoute: '/docs/features/multi-file',
  },
  {
    id: 'folders',
    title: 'Folders & Organization',
    tag: 'Workspace Management',
    icon: FolderTree,
    color: 'bg-[#fef3c7] border-[#d97706] text-[#b45309]',
    summary: 'Organize personal and team pastes into custom folders, filter by language tags, and search snippets.',
    guideRoute: '/docs/features/folders',
  },
  {
    id: 'diffs',
    title: 'Revision History & Diffs',
    tag: 'Version Inspection',
    icon: History,
    color: 'bg-[#ffedd5] border-[#f97316] text-[#c2410c]',
    summary: 'Inspect version histories for pastes with line-by-line unified diffs highlighting additions and removals.',
    guideRoute: '/docs/features/revision-history',
  },
  {
    id: 'embed',
    title: 'Responsive Embeds',
    tag: 'Syndication',
    icon: FileCode,
    color: 'bg-[#f1f5f9] border-[#64748b] text-[#334155]',
    summary: 'Generate lightweight, sandboxed HTML iframe widgets to embed live snippets into documentation or blogs.',
    guideRoute: '/docs/features/responsive-embeds',
  },
  {
    id: 'comments',
    title: 'Interactive Comments & Forks',
    tag: 'Collaboration',
    icon: MessageSquare,
    color: 'bg-[#ccfbf1] border-[#0d9488] text-[#0f766e]',
    summary: 'Discuss code line-by-line with markdown comments or fork snippets to create updated revisions.',
    guideRoute: '/docs/features/comments-and-replies',
  },
  {
    id: 'qrcode',
    title: 'Mobile QR Codes',
    tag: 'Sharing Surface',
    icon: QrCode,
    color: 'bg-[#fdf4ff] border-[#c026d3] text-[#86198f]',
    summary: 'Generate quick-scan mobile QR codes for seamless offline or multi-device paste handoffs.',
    guideRoute: '/docs/features/qr-codes',
  },
  {
    id: 'discovery',
    title: 'Developer Discovery & Community',
    tag: 'Public Registry',
    icon: Compass,
    color: 'bg-[#dbeafe] border-[#2563eb] text-[#1e40af]',
    summary: 'Browse, search, and filter the public snippet registry with real tag and save counts — never fabricated.',
    guideRoute: '/docs/features/discovery',
  },
  {
    id: 'library',
    title: 'Tags & Personal Library',
    tag: 'Personal Index',
    icon: Tag,
    color: 'bg-[#ecfccb] border-[#65a30d] text-[#3f6212]',
    summary: 'Label your own pastes with normalized tags, then search, sort, and revisit them from a personal activity ledger.',
    guideRoute: '/docs/features/tags-and-library',
  },
  {
    id: 'authors',
    title: 'Public Author Profiles',
    tag: 'Developer Discovery',
    icon: Users,
    color: 'bg-[#ede9fe] border-[#7c3aed] text-[#5b21b6]',
    summary: 'Attribute public pastes to their real owner and open an honest, privacy-minimal profile with eligible public work.',
    guideRoute: '/docs/features/author-profiles',
  },
];

export const DocsPage: React.FC = () => {
  const location = useLocation();
  const path = location.pathname.toLowerCase();

  // Scroll to hash anchor on mount or route change
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      const el = document.getElementById(id);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    } else if (typeof window.scrollTo === 'function') {
      try {
        window.scrollTo(0, 0);
      } catch {
        // JSDOM fallback
      }
    }
  }, [location.pathname, location.hash]);

  const markdownComponents = {
    h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h1 className="text-2xl sm:text-3xl font-mono font-bold text-[#17201d] mb-4 mt-6 tracking-tight flex items-center gap-2" {...props}>
        {children}
      </h1>
    ),
    h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h2 className="text-lg sm:text-xl font-mono font-bold text-[#17201d] mb-3 mt-8 pb-1.5 border-b border-[#d8d4ca]" {...props}>
        {children}
      </h2>
    ),
    h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h3 className="text-sm sm:text-base font-mono font-bold text-[#17201d] mb-2 mt-5" {...props}>
        {children}
      </h3>
    ),
    p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
      <p className="text-xs sm:text-sm font-mono text-[#2f3833] leading-relaxed mb-4" {...props}>
        {children}
      </p>
    ),
    ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
      <ul className="list-disc list-inside space-y-1.5 mb-4 text-xs sm:text-sm font-mono text-[#2f3833]" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
      <ol className="list-decimal list-inside space-y-1.5 mb-4 text-xs sm:text-sm font-mono text-[#2f3833]" {...props}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
      <li className="leading-relaxed" {...props}>
        {children}
      </li>
    ),
    code: ({ inline, className, children, ...props }: any) => {
      if (inline) {
        return (
          <code className="px-1.5 py-0.5 rounded bg-[#ebe7dc] border border-[#d5d0c5] font-mono text-xs text-[#17201d]" {...props}>
            {children}
          </code>
        );
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    pre: ({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) => (
      <div className="relative group my-4">
        <pre className="p-4 rounded-xl bg-[#17201d] text-[#e8e4da] font-mono text-xs overflow-x-auto border-2 border-[#17201d] shadow-[3px_3px_0px_#17201d]" {...props}>
          {children}
        </pre>
      </div>
    ),
    table: ({ children, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
      <div className="overflow-x-auto my-5 border border-[#d5d0c5] rounded-xl shadow-sm">
        <table className="w-full border-collapse text-left text-xs font-mono" {...props}>
          {children}
        </table>
      </div>
    ),
    th: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
      <th className="border-b border-[#d5d0c5] bg-[#f4f1e9] p-2.5 font-bold text-[#17201d]" {...props}>
        {children}
      </th>
    ),
    td: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
      <td className="border-b border-[#d5d0c5] p-2.5 bg-white text-[#2f3833]" {...props}>
        {children}
      </td>
    ),
    blockquote: ({ children, ...props }: React.HTMLAttributes<HTMLQuoteElement>) => (
      <blockquote className="p-3.5 my-4 border-l-4 border-[#ff5c3d] bg-[#fdf8f4] text-xs font-mono text-[#525a54] rounded-r-lg" {...props}>
        {children}
      </blockquote>
    ),
    a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
      const isExternal = href?.startsWith('http');
      if (isExternal) {
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#15803d] hover:underline font-semibold" {...props}>
            {children}
          </a>
        );
      }
      return (
        <a href={href} className="text-[#15803d] hover:underline font-semibold" {...props}>
          {children}
        </a>
      );
    },
    hr: () => <hr className="border-[#d5d0c5] my-8" />,
  };

  // 1. Dedicated Feature View: Zero-Knowledge Encrypted Pastes
  if (path.includes('/docs/features/encrypted-pastes')) {
    return (
      <div className="workspace max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between pb-4 border-b border-[#d8d4ca]">
          <Link
            to="/docs"
            className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#ff5c3d] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Documentation Hub</span>
          </Link>
          <span className="text-xs font-mono text-[#74786f]">Feature Guide: 1 of 13</span>
        </div>

        {/* Live Interactive Demo (Above the fold) */}
        <section className="space-y-2">
          <div className="eyebrow text-xs font-mono uppercase tracking-wider text-[#74786f]">
            <span>SECTION 2: LIVE INTERACTIVE SIMULATOR</span>
          </div>
          <EncryptedPastesDemo />
        </section>

        {/* 5-Section Markdown Documentation */}
        <section className="bg-[#faf8f2] border-2 border-[#17201d] p-6 sm:p-8 rounded-2xl shadow-[4px_4px_0px_#17201d]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {encryptedMarkdown}
          </ReactMarkdown>
        </section>
      </div>
    );
  }

  // 2. Dedicated Feature View: Paste as API
  if (path.includes('/docs/features/paste-as-api')) {
    return (
      <div className="workspace max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between pb-4 border-b border-[#d8d4ca]">
          <Link
            to="/docs"
            className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#ff5c3d] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Documentation Hub</span>
          </Link>
          <span className="text-xs font-mono text-[#74786f]">Feature Guide: 2 of 13</span>
        </div>

        {/* Live Interactive Demo (Above the fold) */}
        <section className="space-y-2">
          <div className="eyebrow text-xs font-mono uppercase tracking-wider text-[#74786f]">
            <span>SECTION 2: LIVE INTERACTIVE SIMULATOR</span>
          </div>
          <PasteAsApiDemo />
        </section>

        {/* 5-Section Markdown Documentation */}
        <section className="bg-[#faf8f2] border-2 border-[#17201d] p-6 sm:p-8 rounded-2xl shadow-[4px_4px_0px_#17201d]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {apiMarkdown}
          </ReactMarkdown>
        </section>
      </div>
    );
  }

  // 3. Dedicated Feature View: Burn-After-Reading
  if (path.includes('/docs/features/burn-after-read')) {
    return (
      <div className="workspace max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between pb-4 border-b border-[#d8d4ca]">
          <Link
            to="/docs"
            className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#ff5c3d] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Documentation Hub</span>
          </Link>
          <span className="text-xs font-mono text-[#74786f]">Feature Guide: 3 of 13</span>
        </div>

        {/* Live Interactive Demo (Above the fold) */}
        <section className="space-y-2">
          <div className="eyebrow text-xs font-mono uppercase tracking-wider text-[#74786f]">
            <span>SECTION 2: LIVE INTERACTIVE SIMULATOR</span>
          </div>
          <BurnAfterReadDemo />
        </section>

        {/* 5-Section Markdown Documentation */}
        <section className="bg-[#faf8f2] border-2 border-[#17201d] p-6 sm:p-8 rounded-2xl shadow-[4px_4px_0px_#17201d]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {burnMarkdown}
          </ReactMarkdown>
        </section>
      </div>
    );
  }

  // 4. Dedicated Feature View: Password-Protected
  if (path.includes('/docs/features/password-protected')) {
    return (
      <div className="workspace max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between pb-4 border-b border-[#d8d4ca]">
          <Link
            to="/docs"
            className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#ff5c3d] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Documentation Hub</span>
          </Link>
          <span className="text-xs font-mono text-[#74786f]">Feature Guide: 4 of 13</span>
        </div>

        {/* Live Interactive Demo (Above the fold) */}
        <section className="space-y-2">
          <div className="eyebrow text-xs font-mono uppercase tracking-wider text-[#74786f]">
            <span>SECTION 2: LIVE INTERACTIVE SIMULATOR</span>
          </div>
          <PasswordProtectedDemo />
        </section>

        {/* 5-Section Markdown Documentation */}
        <section className="bg-[#faf8f2] border-2 border-[#17201d] p-6 sm:p-8 rounded-2xl shadow-[4px_4px_0px_#17201d]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {passwordMarkdown}
          </ReactMarkdown>
        </section>
      </div>
    );
  }

  // 5. Dedicated Feature View: Multi-File Workspaces
  if (path.includes('/docs/features/multi-file')) {
    return (
      <div className="workspace max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between pb-4 border-b border-[#d8d4ca]">
          <Link
            to="/docs"
            className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#ff5c3d] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Documentation Hub</span>
          </Link>
          <span className="text-xs font-mono text-[#74786f]">Feature Guide: 5 of 13</span>
        </div>

        {/* Live Interactive Demo (Above the fold) */}
        <section className="space-y-2">
          <div className="eyebrow text-xs font-mono uppercase tracking-wider text-[#74786f]">
            <span>SECTION 2: LIVE INTERACTIVE SIMULATOR</span>
          </div>
          <MultiFileDemo />
        </section>

        {/* 5-Section Markdown Documentation */}
        <section className="bg-[#faf8f2] border-2 border-[#17201d] p-6 sm:p-8 rounded-2xl shadow-[4px_4px_0px_#17201d]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {multiFileMarkdown}
          </ReactMarkdown>
        </section>
      </div>
    );
  }

  // 6. Dedicated Feature View: Folders & Organization
  if (path.includes('/docs/features/folders')) {
    return (
      <div className="workspace max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between pb-4 border-b border-[#d8d4ca]">
          <Link
            to="/docs"
            className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#ff5c3d] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Documentation Hub</span>
          </Link>
          <span className="text-xs font-mono text-[#74786f]">Feature Guide: 6 of 13</span>
        </div>

        <section className="space-y-2">
          <div className="eyebrow text-xs font-mono uppercase tracking-wider text-[#74786f]">
            <span>SECTION 2: LIVE INTERACTIVE SIMULATOR</span>
          </div>
          <FoldersDemo />
        </section>

        <section className="bg-[#faf8f2] border-2 border-[#17201d] p-6 sm:p-8 rounded-2xl shadow-[4px_4px_0px_#17201d]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {foldersMarkdown}
          </ReactMarkdown>
        </section>
      </div>
    );
  }

  // 7. Dedicated Feature View: Revision History & Diffs
  if (path.includes('/docs/features/revision-history')) {
    return (
      <div className="workspace max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between pb-4 border-b border-[#d8d4ca]">
          <Link
            to="/docs"
            className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#ff5c3d] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Documentation Hub</span>
          </Link>
          <span className="text-xs font-mono text-[#74786f]">Feature Guide: 7 of 13</span>
        </div>

        <section className="space-y-2">
          <div className="eyebrow text-xs font-mono uppercase tracking-wider text-[#74786f]">
            <span>SECTION 2: LIVE INTERACTIVE SIMULATOR</span>
          </div>
          <RevisionHistoryDemo />
        </section>

        <section className="bg-[#faf8f2] border-2 border-[#17201d] p-6 sm:p-8 rounded-2xl shadow-[4px_4px_0px_#17201d]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {revisionHistoryMarkdown}
          </ReactMarkdown>
        </section>
      </div>
    );
  }

  // 8. Dedicated Feature View: Responsive Embeds
  if (path.includes('/docs/features/responsive-embeds')) {
    return (
      <div className="workspace max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between pb-4 border-b border-[#d8d4ca]">
          <Link
            to="/docs"
            className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#ff5c3d] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Documentation Hub</span>
          </Link>
          <span className="text-xs font-mono text-[#74786f]">Feature Guide: 8 of 13</span>
        </div>

        <section className="space-y-2">
          <div className="eyebrow text-xs font-mono uppercase tracking-wider text-[#74786f]">
            <span>SECTION 2: LIVE INTERACTIVE SIMULATOR</span>
          </div>
          <ResponsiveEmbedsDemo />
        </section>

        <section className="bg-[#faf8f2] border-2 border-[#17201d] p-6 sm:p-8 rounded-2xl shadow-[4px_4px_0px_#17201d]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {responsiveEmbedsMarkdown}
          </ReactMarkdown>
        </section>
      </div>
    );
  }

  // 9. Dedicated Feature View: Comments & Replies
  if (path.includes('/docs/features/comments-and-replies')) {
    return (
      <div className="workspace max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between pb-4 border-b border-[#d8d4ca]">
          <Link
            to="/docs"
            className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#ff5c3d] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Documentation Hub</span>
          </Link>
          <span className="text-xs font-mono text-[#74786f]">Feature Guide: 9 of 13</span>
        </div>

        <section className="space-y-2">
          <div className="eyebrow text-xs font-mono uppercase tracking-wider text-[#74786f]">
            <span>SECTION 2: LIVE INTERACTIVE SIMULATOR</span>
          </div>
          <CommentsDemo />
        </section>

        <section className="bg-[#faf8f2] border-2 border-[#17201d] p-6 sm:p-8 rounded-2xl shadow-[4px_4px_0px_#17201d]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {commentsMarkdown}
          </ReactMarkdown>
        </section>
      </div>
    );
  }

  // 10. Dedicated Feature View: Mobile QR Codes
  if (path.includes('/docs/features/qr-codes')) {
    return (
      <div className="workspace max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between pb-4 border-b border-[#d8d4ca]">
          <Link
            to="/docs"
            className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#ff5c3d] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Documentation Hub</span>
          </Link>
          <span className="text-xs font-mono text-[#74786f]">Feature Guide: 10 of 13</span>
        </div>

        <section className="space-y-2">
          <div className="eyebrow text-xs font-mono uppercase tracking-wider text-[#74786f]">
            <span>SECTION 2: LIVE INTERACTIVE SIMULATOR</span>
          </div>
          <QrCodeDemo />
        </section>

        <section className="bg-[#faf8f2] border-2 border-[#17201d] p-6 sm:p-8 rounded-2xl shadow-[4px_4px_0px_#17201d]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {qrCodesMarkdown}
          </ReactMarkdown>
        </section>
      </div>
    );
  }

  // 11. Dedicated Feature View: Developer Discovery & Community
  // Guide-only page: the feature is server-backed and the live UI at /discovery is the demo.
  if (path.includes('/docs/features/discovery')) {
    return (
      <div className="workspace max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between pb-4 border-b border-[#d8d4ca]">
          <Link
            to="/docs"
            className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#ff5c3d] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Documentation Hub</span>
          </Link>
          <span className="text-xs font-mono text-[#74786f]">Feature Guide: 11 of 13</span>
        </div>

        <section className="bg-[#faf8f2] border-2 border-[#17201d] p-6 sm:p-8 rounded-2xl shadow-[4px_4px_0px_#17201d]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {discoveryMarkdown}
          </ReactMarkdown>
        </section>
      </div>
    );
  }

  // 12. Dedicated Feature View: Tags & Personal Library Search
  // Guide-only page: the feature lives in the Account dashboard, which is the live UI.
  if (path.includes('/docs/features/tags-and-library')) {
    return (
      <div className="workspace max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between pb-4 border-b border-[#d8d4ca]">
          <Link
            to="/docs"
            className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#ff5c3d] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Documentation Hub</span>
          </Link>
          <span className="text-xs font-mono text-[#74786f]">Feature Guide: 12 of 13</span>
        </div>

        <section className="bg-[#faf8f2] border-2 border-[#17201d] p-6 sm:p-8 rounded-2xl shadow-[4px_4px_0px_#17201d]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {tagsAndLibraryMarkdown}
          </ReactMarkdown>
        </section>
      </div>
    );
  }

  // 13. Dedicated Feature View: Public Author Profiles
  // Guide-only page: the live profile UI at /users/:username is the demo.
  if (path.includes('/docs/features/author-profiles')) {
    return (
      <div className="workspace max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between pb-4 border-b border-[#d8d4ca]">
          <Link
            to="/docs"
            className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#ff5c3d] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Documentation Hub</span>
          </Link>
          <span className="text-xs font-mono text-[#74786f]">Feature Guide: 13 of 13</span>
        </div>

        <section className="bg-[#faf8f2] border-2 border-[#17201d] p-6 sm:p-8 rounded-2xl shadow-[4px_4px_0px_#17201d]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {authorProfilesMarkdown}
          </ReactMarkdown>
        </section>
      </div>
    );
  }

  // Default: Documentation Hub View (/docs)
  return (
    <div className="workspace max-w-6xl mx-auto px-4 py-8 space-y-10">
      {/* Hero Header & 3-Sentence Hub Index */}
      <div className="pb-8 border-b border-[#d8d4ca] space-y-4">
        <div className="space-y-2">
          <div className="eyebrow flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-[#74786f]">
            <Sparkles className="w-3.5 h-3.5 text-[#ff5c3d]" />
            <span>EXTRABIN PLATFORM DOCUMENTATION HUB</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-mono font-bold text-[#17201d] tracking-tight m-0">
            ExtraBin Documentation &amp; Feature Guides
          </h1>
          <p className="text-xs sm:text-sm font-mono text-[#525a54] max-w-3xl m-0 leading-relaxed">
            ExtraBin provides developer-first text, code, and configuration sharing with zero-knowledge cryptographic privacy guarantees and programmatic automation surfaces. This documentation hub serves as the central directory for all platform architectural guides, live interactive simulations, and technical specifications. Choose a dedicated feature guide below to inspect mechanics or test interactive workflows.
          </p>
        </div>

        {/* Fast Link Bar to the dedicated guides */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <span className="text-xs font-mono text-[#74786f]">Dedicated guides:</span>
          <Link
            to="/docs/features/encrypted-pastes"
            className="px-2.5 py-1 rounded-md bg-[#ebe7dc] hover:bg-[#ddd7ca] border border-[#d5d0c5] text-xs font-mono font-bold text-[#17201d] transition-colors no-underline flex items-center gap-1"
          >
            <Shield className="w-3 h-3 text-[#16a34a]" /> Encrypted Pastes
          </Link>
          <Link
            to="/docs/features/paste-as-api"
            className="px-2.5 py-1 rounded-md bg-[#ebe7dc] hover:bg-[#ddd7ca] border border-[#d5d0c5] text-xs font-mono font-bold text-[#17201d] transition-colors no-underline flex items-center gap-1"
          >
            <Terminal className="w-3 h-3 text-[#0284c7]" /> Paste as API
          </Link>
          <Link
            to="/docs/features/burn-after-read"
            className="px-2.5 py-1 rounded-md bg-[#ebe7dc] hover:bg-[#ddd7ca] border border-[#d5d0c5] text-xs font-mono font-bold text-[#17201d] transition-colors no-underline flex items-center gap-1"
          >
            <Flame className="w-3 h-3 text-[#ef4444]" /> Burn After Read
          </Link>
          <Link
            to="/docs/features/password-protected"
            className="px-2.5 py-1 rounded-md bg-[#ebe7dc] hover:bg-[#ddd7ca] border border-[#d5d0c5] text-xs font-mono font-bold text-[#17201d] transition-colors no-underline flex items-center gap-1"
          >
            <KeyRound className="w-3 h-3 text-[#ca8a04]" /> Password Protection
          </Link>
          <Link
            to="/docs/features/multi-file"
            className="px-2.5 py-1 rounded-md bg-[#ebe7dc] hover:bg-[#ddd7ca] border border-[#d5d0c5] text-xs font-mono font-bold text-[#17201d] transition-colors no-underline flex items-center gap-1"
          >
            <Layers className="w-3 h-3 text-[#a855f7]" /> Multi-File Workspaces
          </Link>
          <Link
            to="/docs/features/folders"
            className="px-2.5 py-1 rounded-md bg-[#ebe7dc] hover:bg-[#ddd7ca] border border-[#d5d0c5] text-xs font-mono font-bold text-[#17201d] transition-colors no-underline flex items-center gap-1"
          >
            <FolderTree className="w-3 h-3 text-[#d97706]" /> Folders
          </Link>
          <Link
            to="/docs/features/revision-history"
            className="px-2.5 py-1 rounded-md bg-[#ebe7dc] hover:bg-[#ddd7ca] border border-[#d5d0c5] text-xs font-mono font-bold text-[#17201d] transition-colors no-underline flex items-center gap-1"
          >
            <History className="w-3 h-3 text-[#f97316]" /> Revision History
          </Link>
          <Link
            to="/docs/features/responsive-embeds"
            className="px-2.5 py-1 rounded-md bg-[#ebe7dc] hover:bg-[#ddd7ca] border border-[#d5d0c5] text-xs font-mono font-bold text-[#17201d] transition-colors no-underline flex items-center gap-1"
          >
            <FileCode className="w-3 h-3 text-[#64748b]" /> Embeds
          </Link>
          <Link
            to="/docs/features/comments-and-replies"
            className="px-2.5 py-1 rounded-md bg-[#ebe7dc] hover:bg-[#ddd7ca] border border-[#d5d0c5] text-xs font-mono font-bold text-[#17201d] transition-colors no-underline flex items-center gap-1"
          >
            <MessageSquare className="w-3 h-3 text-[#0d9488]" /> Comments
          </Link>
          <Link
            to="/docs/features/qr-codes"
            className="px-2.5 py-1 rounded-md bg-[#ebe7dc] hover:bg-[#ddd7ca] border border-[#d5d0c5] text-xs font-mono font-bold text-[#17201d] transition-colors no-underline flex items-center gap-1"
          >
            <QrCode className="w-3 h-3 text-[#c026d3]" /> QR Codes
          </Link>
          <Link
            to="/docs/features/discovery"
            className="px-2.5 py-1 rounded-md bg-[#ebe7dc] hover:bg-[#ddd7ca] border border-[#d5d0c5] text-xs font-mono font-bold text-[#17201d] transition-colors no-underline flex items-center gap-1"
          >
            <Compass className="w-3 h-3 text-[#2563eb]" /> Discovery
          </Link>
          <Link
            to="/docs/features/tags-and-library"
            className="px-2.5 py-1 rounded-md bg-[#ebe7dc] hover:bg-[#ddd7ca] border border-[#d5d0c5] text-xs font-mono font-bold text-[#17201d] transition-colors no-underline flex items-center gap-1"
          >
            <Tag className="w-3 h-3 text-[#65a30d]" /> Tags &amp; Library
          </Link>
          <Link
            to="/docs/features/author-profiles"
            className="px-2.5 py-1 rounded-md bg-[#ebe7dc] hover:bg-[#ddd7ca] border border-[#d5d0c5] text-xs font-mono font-bold text-[#17201d] transition-colors no-underline flex items-center gap-1"
          >
            <Users className="w-3 h-3 text-[#7c3aed]" /> Author Profiles
          </Link>
        </div>
      </div>

      {/* SECTION 1: 13-Feature Platform Directory */}
      <section id="platform-directory" className="space-y-5">
        <div className="eyebrow flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-[#74786f]">
          <Layers className="w-3.5 h-3.5 text-[#6366f1]" />
          <span>PLATFORM CAPABILITIES DIRECTORY</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-mono font-bold text-[#17201d] m-0">
          Platform Feature Directory
        </h2>
        <p className="text-xs sm:text-sm font-mono text-[#525a54] max-w-2xl m-0">
          A comprehensive breakdown of all features engineered into the ExtraBin architecture. Dedicated guides include interactive browser demos and five-section specifications.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          {featuresCatalog.map((feat) => {
            const IconComponent = feat.icon;
            return (
              <div
                key={feat.id}
                className="p-4 rounded-xl border-2 border-[#17201d] bg-[#faf8f2] shadow-[3px_3px_0px_#17201d] hover:translate-y-[-2px] hover:shadow-[4px_4px_0px_#17201d] transition-all flex flex-col justify-between space-y-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className={`p-2 rounded-lg border ${feat.color}`}>
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#ebe7dc] text-[#525a54] border border-[#d5d0c5]">
                      {feat.tag}
                    </span>
                  </div>
                  <h3 className="text-sm font-mono font-bold text-[#17201d] m-0">{feat.title}</h3>
                  <p className="text-xs font-mono text-[#525a54] leading-relaxed m-0">{feat.summary}</p>
                </div>

                <div className="pt-2 border-t border-[#d8d4ca]/60 text-[11px] font-mono font-bold flex items-center justify-between">
                  {feat.guideRoute ? (
                    <Link
                      to={feat.guideRoute}
                      className="text-[#ff5c3d] hover:underline flex items-center gap-1"
                    >
                      <span>View guide →</span>
                    </Link>
                  ) : (
                    <span className="text-[#525a54] flex items-center gap-1 font-normal">
                      <span>Included in platform — no separate guide</span>
                      <Check className="w-3.5 h-3.5 text-green-700" />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 2: Reference Specifications (Source of Truth Markdown Rendering) */}
      <section id="reference-specs" className="space-y-8 pt-8 border-t border-[#d8d4ca] scroll-mt-6">
        <div className="eyebrow flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-[#74786f]">
          <BookOpen className="w-3.5 h-3.5 text-[#16a34a]" />
          <span>TECHNICAL SPECIFICATIONS &amp; ARCHITECTURAL GUIDES</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-mono font-bold text-[#17201d] m-0">
          Reference Specifications
        </h2>
        <p className="text-xs sm:text-sm font-mono text-[#525a54] max-w-3xl m-0 leading-relaxed">
          The following specifications are compiled directly from the project's living markdown documentation, providing complete contracts for security models, HTTP formats, and caching headers.
        </p>

        {/* Encrypted Pastes Spec */}
        <section
          id="encrypted-pastes"
          className="scroll-mt-8 bg-[#faf8f2] border-2 border-[#17201d] p-6 sm:p-8 rounded-2xl shadow-[4px_4px_0px_#17201d]"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {encryptedMarkdown}
          </ReactMarkdown>
        </section>

        {/* Paste as API Spec */}
        <section
          id="paste-as-api"
          className="scroll-mt-8 bg-[#faf8f2] border-2 border-[#17201d] p-6 sm:p-8 rounded-2xl shadow-[4px_4px_0px_#17201d]"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {apiMarkdown}
          </ReactMarkdown>
        </section>
      </section>
    </div>
  );
};

export default DocsPage;
