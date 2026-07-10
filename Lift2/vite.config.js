import { defineConfig } from 'vite';

// Multi-page: the existing debug sim (index.html) + the 3D Kenney diorama (iso3d.html)
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        iso3d: 'iso3d.html',
      },
    },
  },
});
