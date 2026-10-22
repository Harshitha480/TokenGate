import { useEffect, useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';

function ServerStatus() {
  const [health, setHealth] = useState({ state: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/health', { signal: controller.signal })
      .then((res) => res.json())
      .then((body) => setHealth({ state: 'ready', body }))
      .catch((error) => {
        if (error.name !== 'AbortError') setHealth({ state: 'error' });
      });
    return () => controller.abort();
  }, []);

  if (health.state === 'loading') return <p>Checking the API…</p>;
  if (health.state === 'error') return <p>The API is not reachable on port 5001.</p>;
  return (
    <p>
      API {health.body.status}, database {health.body.database}
    </p>
  );
}

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <main className="p-6">
        <h1 className="text-2xl font-semibold">TokenGate</h1>
        <ServerStatus />
      </main>
    ),
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
