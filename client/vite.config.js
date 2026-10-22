import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // In Docker the API is reachable as http://server:5001; locally it is localhost.
  const apiTarget = env.VITE_PROXY_TARGET || 'http://localhost:5001';

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': apiTarget,
        '/v1': apiTarget,
        '/health': apiTarget,
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.js'],
    },
  };
});
