import { defineConfig } from 'vite';

export default defineConfig({
  // base is required for GitHub Pages deployment under /CopilotFantasy/
  // Removing this causes /src/main.ts 404 errors on the deployed site
  base: '/CopilotFantasy/',
  build: {
    target: 'esnext',
  },
});
