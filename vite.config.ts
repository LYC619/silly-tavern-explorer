import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    watch: {
      // 参考项目(_reference/projects/*)是借鉴用的外部源码(含 Vue/Astro 等异构栈)，
      // 不属于本项目，排除以免 vite 扫描其依赖报错(vue/pinia/pixi.js 未安装)
      ignored: ["**/_reference/**"],
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    // 别让依赖预扫描去解析参考项目里的 import
    entries: ["index.html", "src/**/*.{ts,tsx}"],
  },
}));
