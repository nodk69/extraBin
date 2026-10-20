import React from 'react';
import { ShieldCheck, Terminal } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full border-t border-slate-800/80 bg-slate-950 py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-brand-500" />
          <span>Production-Grade Security Boundaries & Content Isolation</span>
        </div>

        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Terminal className="w-3.5 h-3.5 text-slate-400" />
            <span>API v1.0</span>
          </span>
          <span>•</span>
          <a href="/swagger-ui.html" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">
            OpenAPI Docs
          </a>
          <span>•</span>
          <a
            href="https://ko-fi.com/W0K122693O"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:opacity-90 transition-opacity"
            title="Buy Me a Coffee at ko-fi.com"
          >
            <img
              height="28"
              style={{ border: '0px', height: '28px' }}
              src="https://storage.ko-fi.com/cdn/kofi6.png?v=6"
              alt="Buy Me a Coffee at ko-fi.com"
            />
          </a>
        </div>
      </div>
    </footer>
  );
};
