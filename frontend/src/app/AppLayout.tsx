import React, { Suspense, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AuthProvider, useAuth } from '../features/auth/context/AuthContext';
import { Icon, IconName } from '../components/ui/PaperIcon';
import { UserDropdown } from '../features/auth/components/UserDropdown';
import { DropdownMenu, DropdownTrigger, DropdownMenuContent } from '../components/ui/dropdown';
import { RouteSkeleton } from '../components/ui/SkeletonLayouts';

const AppLayoutContent: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        navigate('/discovery');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  const isExplore = location.pathname.startsWith('/discovery');
  const isDocs = location.pathname.startsWith('/docs');
  const activeNavId = isExplore ? 'explore' : isDocs ? 'docs' : 'paste';

  const navItems = [
    { id: 'paste', label: 'New paste', icon: 'plus' as IconName, path: '/' },
    { id: 'explore', label: 'Explore', icon: 'spark' as IconName, path: '/discovery' },
    { id: 'docs', label: 'Docs', icon: 'file' as IconName, path: '/docs' },
  ];

  return (
    <div className="app-shell">
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <Link to="/" className="flex min-w-0 items-center gap-2.5 text-inherit no-underline group">
              <div className="brand-mark" aria-hidden="true">
                <span>E</span>
              </div>
              <div className="wordmark">
                extra<span>Bin</span><i>.</i>
              </div>
            </Link>
          </div>

          <nav className="topbar-nav" aria-label="Main navigation">
            {navItems.map((item) => {
              const isActive = activeNavId === item.id;

              return (
                <Link
                  key={item.id}
                  to={item.path}
                  className={`topbar-link ${isActive ? 'active' : ''}`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="topbar-nav-pill"
                      className="topbar-nav-pill"
                      transition={{
                        type: 'spring',
                        stiffness: 380,
                        damping: 28,
                        mass: 0.75,
                      }}
                    />
                  )}
                  <span className="relative z-[2] flex items-center gap-1.5 pointer-events-none">
                    <Icon name={item.icon} size={15} />
                    <span>{item.label}</span>
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="topbar-right flex min-w-0 items-center gap-2.5">
            {user ? (
              <>
                <UserDropdown user={user} onLogout={logout} />
              </>
            ) : (
              <>
                {/* Desktop Auth Links */}
                <div className="desktop-auth-links hidden md:flex items-center gap-2">
                  <Link to="/login" className="px-3 py-1.5 rounded-lg font-bold text-xs text-[#17201d] hover:bg-[#e8e4da] transition-all no-underline">
                    Sign in
                  </Link>
                  <Link
                    to="/register"
                    className="px-4 py-1.5 rounded-lg bg-[#ff5c3d] text-[#17201d] font-bold text-xs border-2 border-[#17201d] shadow-[3px_3px_0px_#17201d] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_#17201d] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_#17201d] transition-all no-underline"
                  >
                    Sign up
                  </Link>
                </div>

                {/* Mobile Menu Trigger & Dropdown */}
                <div className="mobile-auth-menu relative md:hidden">
                  <DropdownMenu>
                    <DropdownTrigger
                      aria-label="Navigation and account menu"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-[#17201d] bg-[#fcfbf7] text-[#17201d] font-mono text-xs font-bold shadow-[2px_2px_0px_#17201d] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_#17201d] transition-all"
                    >
                      <Icon name="menu" size={15} />
                      <span>Menu</span>
                    </DropdownTrigger>

                    <DropdownMenuContent
                      aria-label="Mobile navigation menu"
                      className="w-56"
                    >
                      <div className="p-3 bg-[#ebe7dc]/70 border-b border-[#d8d4ca]">
                        <p className="text-[10px] font-mono uppercase tracking-wider text-[#74786f] font-bold mb-0">
                          extraBin Account
                        </p>
                      </div>

                      <div className="p-2 flex flex-col gap-1.5 border-b border-[#d8d4ca]">
                        <Link
                          to="/login"
                          className="flex items-center justify-center w-full py-2 px-3 rounded-lg bg-white border border-[#17201d] text-[#17201d] font-bold text-xs hover:bg-[#ebe7dc] shadow-[1.5px_1.5px_0px_#17201d] no-underline transition-all"
                        >
                          Sign in
                        </Link>
                        <Link
                          to="/register"
                          className="flex items-center justify-center w-full py-2 px-3 rounded-lg bg-[#ff5c3d] text-[#17201d] font-bold text-xs border border-[#17201d] shadow-[2px_2px_0px_#17201d] no-underline transition-all"
                        >
                          Create account
                        </Link>
                      </div>

                      <div className="py-1">
                        <Link
                          to="/docs"
                          className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[#17201d] hover:bg-[#ebe7dc] transition-colors no-underline"
                        >
                          <span className="p-1 rounded bg-[#ebe7dc] text-[#17201d]">
                            <Icon name="file" size={13} />
                          </span>
                          <span>Documentation</span>
                        </Link>
                        <Link
                          to="/discovery"
                          className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[#17201d] hover:bg-[#ebe7dc] transition-colors no-underline"
                        >
                          <span className="p-1 rounded bg-[#ebe7dc] text-[#17201d]">
                            <Icon name="spark" size={13} />
                          </span>
                          <span>Explore Discovery</span>
                        </Link>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            )}
          </div>
        </header>

        <Suspense fallback={<RouteSkeleton />}>
          <Outlet />
        </Suspense>

        <footer className="site-footer w-full border-t border-[#d8d4ca] bg-[#ebe7dc]/50 py-8 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-[#74776f]">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#17201d]">extraBin.</span>
              <span>— Modern text &amp; code workbench</span>
            </div>

            <div className="flex items-center gap-4">
              <Link to="/docs" className="hover:text-[#17201d] transition-colors underline">
                Documentation
              </Link>
            </div>
          </div>
        </footer>

        {/* Mobile Bottom Navigation Bar (Visible only on mobile screens <= 768px) */}
        <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
          <Link
            to="/"
            className={`mobile-nav-item ${location.pathname === '/' ? 'active' : ''}`}
          >
            <Icon name="plus" size={18} />
            <span>New Paste</span>
          </Link>
          <Link
            to="/discovery"
            className={`mobile-nav-item ${location.pathname.startsWith('/discovery') ? 'active' : ''}`}
          >
            <Icon name="spark" size={18} />
            <span>Explore</span>
          </Link>
          {user ? (
            <>
            <Link
              to="/account"
              className={`mobile-nav-item ${location.pathname.startsWith('/account') ? 'active' : ''}`}
            >
              <Icon name="user" size={18} />
              <span>Account</span>
            </Link>
            </>
          ) : (
            <Link
              to="/login"
              className={`mobile-nav-item ${
                location.pathname.startsWith('/login') || location.pathname.startsWith('/register')
                  ? 'active'
                  : ''
              }`}
            >
              <Icon name="user" size={18} />
              <span>Sign In</span>
            </Link>
          )}
        </nav>
      </main>
    </div>
  );
};

export const AppLayout: React.FC = () => {
  return (
    <AuthProvider>
      <AppLayoutContent />
    </AuthProvider>
  );
};
