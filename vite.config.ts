import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_PUBLIC_BASE || '/',
  plugins: [react()],
  server: {
    // The save server (server/index.ts); `bun run dev` runs both.
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: {
    include: ['tests/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
