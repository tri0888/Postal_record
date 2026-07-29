import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// Mã dùng chung với server (đọc Excel, chuẩn hoá chuỗi, hằng số).
const shared = fileURLToPath(new URL('../shared', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': shared,
    },
  },
  server: {
    port: 5173,
    fs: {
      // shared/ nằm ngoài thư mục frontend nên phải cho phép Vite đọc.
      allow: ['..'],
    },
    proxy: {
      // Giao diện ở :5173, API ở :3000. Đi qua proxy nên trình duyệt coi hai bên
      // là cùng gốc — cookie phiên hoạt động và không cần cấu hình CORS.
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
