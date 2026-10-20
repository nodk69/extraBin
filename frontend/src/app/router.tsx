import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { Loading } from '../components/ui/Loading';

// Placeholder views for baseline routing
const HomePage = React.lazy(() => import('../features/pastes/pages/CreatePastePage'));
const ViewPastePage = React.lazy(() => import('../features/pastes/pages/ViewPastePage'));
const DiscoveryPage = React.lazy(() => import('../features/discovery/pages/DiscoveryPage'));
const LoginPage = React.lazy(() => import('../features/auth/pages/LoginPage'));
const RegisterPage = React.lazy(() => import('../features/auth/pages/RegisterPage'));
const AuthCallbackPage = React.lazy(() => import('../features/auth/pages/AuthCallbackPage'));
const AccountPage = React.lazy(() => import('../features/dashboard/pages/AccountPage'));
const SettingsPage = React.lazy(() => import('../features/dashboard/pages/SettingsPage'));
const EmbedPastePage = React.lazy(() => import('../features/pastes/pages/EmbedPastePage'));
const DocsPage = React.lazy(() => import('../features/docs/pages/DocsPage'));
const PublicAuthorProfilePage = React.lazy(() => import('../features/authors/pages/PublicAuthorProfilePage'));

const NotFoundPage = () => (
  <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
    <h1 className="text-4xl font-mono font-bold text-slate-100">404</h1>
    <p className="text-slate-400">The requested paste or page does not exist or has expired.</p>
  </div>
);

export const router = createBrowserRouter(
  [
    {
      path: '/embed/:id',
      element: (
        <React.Suspense fallback={<Loading variant="inline" message="Loading embed..." className="p-4" />}>
          <EmbedPastePage />
        </React.Suspense>
      ),
    },
    {
      path: '/',
      element: <AppLayout />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'p/:id', element: <ViewPastePage /> },
        { path: 'p/:id/file/:fileId', element: <ViewPastePage /> },
        { path: 'discovery', element: <DiscoveryPage /> },
        { path: 'users/:username', element: <PublicAuthorProfilePage /> },
        { path: 'docs', element: <DocsPage /> },
        { path: 'docs/features', element: <DocsPage /> },
        { path: 'docs/features/:featureId', element: <DocsPage /> },
        { path: 'login', element: <LoginPage /> },
        { path: 'register', element: <RegisterPage /> },
        { path: 'auth/callback', element: <AuthCallbackPage /> },
        { path: 'account', element: <AccountPage /> },
        { path: 'settings', element: <SettingsPage /> },
        { path: '404', element: <NotFoundPage /> },
        { path: '*', element: <Navigate to="/404" replace /> },
      ],
    },
  ],
  // Opt in to the React Router v7 behaviour set to silence the future-flag
  // console warnings; behavior is what v7 will ship.
  {
    future: {
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_relativeSplatPath: true,
      v7_skipActionErrorRevalidation: true,
    },
  }
);
