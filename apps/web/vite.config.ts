import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Mã của lần dựng này, gắn vào URL đăng ký service worker.
 *
 * Cloudflare đứng trước máy chủ và tự đệm `.js` 4 tiếng, kể cả khi Caddy trả
 * `no-store`. Không đổi URL thì người dùng kẹt ở service worker cũ suốt 4 tiếng
 * sau mỗi lần triển khai. Đổi `?v=` là Cloudflare coi như tệp mới.
 */
const MA_BAN_DUNG = Date.now().toString(36);

/**
 * Ghi `version.json` vào thư mục dist để trang đang chạy đối chiếu được với máy chủ.
 * Tệp này phải KHÔNG được đệm — quy tắc no-store đặt trong Caddyfile.
 */
function ghiPhienBan() {
  return {
    name: 'ghi-phien-ban',
    apply: 'build' as const,
    generateBundle(this: { emitFile: (f: unknown) => void }) {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ ma: MA_BAN_DUNG }),
      });
    },
  };
}

export default defineConfig({
  define: { __MA_BAN_DUNG__: JSON.stringify(MA_BAN_DUNG) },
  plugins: [react(), tailwindcss(), ghiPhienBan()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Tách vendor để lần deploy sau người dùng chỉ tải lại phần thay đổi,
    // và Recharts (nặng nhất) không chặn màn hình đăng nhập.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          router: ['@tanstack/react-router', '@tanstack/react-query'],
          charts: ['recharts'],
        },
      },
    },
  },
  server: { port: 5173, proxy: { '/api': { target: 'http://127.0.0.1:8100', changeOrigin: true } } },
});
