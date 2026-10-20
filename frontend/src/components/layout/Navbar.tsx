import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Compass, PlusCircle, Terminal } from 'lucide-react';
import { useAuth } from '../../features/auth/context/AuthContext';
import { UserDropdown } from '../..//features/auth/components/UserDropdown';

export const Navbar: React.FC = () => {
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();

  const isHome = location.pathname === '/';
  const isDiscovery = location.pathname.startsWith('/discovery');

  return (
    <header className="sticky top-0 z-50 w-full border-b-2 border-white bg-black shadow-[0_4px_0_0_#000,0_4px_0_2px_#00cc66]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Brand */}
        <Link
          to="/"
          className="flex items-center gap-2.5 text-white group focus:outline-none select-none"
        >
          <div className="p-1.5 bg-[#00cc66] text-black border-2 border-white shadow-[2px_2px_0px_#000] font-bold">
            <Terminal className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-1.5 font-bold tracking-wider text-base uppercase [text-shadow:1px_1px_#000]">
            <span>EXTRABIN</span>
            <span className="text-[#00cc66]">.EXE</span>
            <span className="w-2 h-4 bg-[#00cc66] animate-pulse inline-block ml-0.5" />
          </div>
        </Link>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-2">
          <Link
            to="/"
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all border-2 select-none flex items-center gap-1.5 ${
              isHome
                ? 'bg-[#00cc66] text-black border-black shadow-[2px_2px_0px_#fff]'
                : 'bg-black text-slate-300 border-white/40 hover:border-white hover:text-white shadow-[2px_2px_0px_#000]'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>NEW_PASTE</span>
          </Link>

          <Link
            to="/discovery"
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all border-2 select-none flex items-center gap-1.5 ${
              isDiscovery
                ? 'bg-[#00cc66] text-black border-black shadow-[2px_2px_0px_#fff]'
                : 'bg-black text-slate-300 border-white/40 hover:border-white hover:text-white shadow-[2px_2px_0px_#000]'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>DISCOVERY</span>
          </Link>
        </nav>

        {/* Auth Section */}
        <div className="flex items-center gap-2">
          {isAuthenticated && user ? (
            <UserDropdown user={user} onLogout={logout} />
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-200 border-2 border-white/40 hover:border-white hover:text-white bg-black transition-all shadow-[2px_2px_0px_#000]"
              >
                SIGN_IN
              </Link>
              <Link
                to="/register"
                className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-black bg-[#ff6b35] border-2 border-black hover:bg-[#ff8554] transition-all shadow-[2px_2px_0px_#fff]"
              >
                REGISTER
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
