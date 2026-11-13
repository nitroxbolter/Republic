import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const publicSiteUrl = (process.env.VITE_PUBLIC_SITE_URL || 'https://openpolis.space/').replace(/\/*$/, '/');

export default defineConfig({
  base: process.env.VITE_PUBLIC_BASE || '/',
  plugins: [
    react(),
    {
      name: 'public-site-url',
      transformIndexHtml: (html) => html.replaceAll('__PUBLIC_SITE_URL__', publicSiteUrl),
    },
  ],
  server: {
    // The save server (server/index.ts); `bun run dev` runs both.
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: {
    include: ['tests/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
