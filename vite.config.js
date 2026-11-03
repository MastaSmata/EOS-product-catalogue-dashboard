import { defineConfig } from 'vite';

const sandboxPreviewHosts = ['.us4.manus.computer'];
const apiProxy = { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } };

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: sandboxPreviewHosts,
    proxy: apiProxy,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: sandboxPreviewHosts,
    proxy: apiProxy,
  },
});
