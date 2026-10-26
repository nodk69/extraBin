import * as Sentry from "@sentry/react";
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './styles/index.css';
import './styles/responsive.css';

// Initialize Sentry error tracking. DSN is injected via Vite environment variable.
// Leave VITE_SENTRY_DSN empty in development to disable Sentry.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE || 'development',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    // Performance monitoring: trace 10% of transactions in production, 100% in dev.
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    // Session replay: capture 10% of sessions (reduced in production for privacy).
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
// Trigger rebuild for env vars
