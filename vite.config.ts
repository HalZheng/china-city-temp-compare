import { defineConfig } from 'vite';

// 使用相对 base，保证部署到任意子路径（Vercel 预览/自定义目录等）都能正确加载资源
export default defineConfig({
  base: './',
});
