import { createBrowserRouter, RouterProvider } from 'react-router';
import { SWRConfig } from 'swr';
import { AuthProvider } from './auth/AuthContext.jsx';
import { RedirectIfSignedIn, RequireAuth } from './auth/RequireAuth.jsx';
import { AppShell } from './components/shell/AppShell.jsx';
import { AuthPage } from './pages/auth/AuthPage.jsx';
import { KeysPage } from './pages/keys/KeysPage.jsx';
import { LogsPage } from './pages/logs/LogsPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { OverviewPage } from './pages/overview/OverviewPage.jsx';
import { PlaygroundPage } from './pages/playground/PlaygroundPage.jsx';

const router = createBrowserRouter([
  {
    element: <RedirectIfSignedIn />,
    children: [
      { path: '/login', element: <AuthPage mode="login" /> },
      { path: '/register', element: <AuthPage mode="register" /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: 'logs', element: <LogsPage /> },
          { path: 'keys', element: <KeysPage /> },
          { path: 'playground', element: <PlaygroundPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

export default function App() {
  return (
    <SWRConfig value={{ shouldRetryOnError: (error) => error?.status !== 401 }}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </SWRConfig>
  );
}
