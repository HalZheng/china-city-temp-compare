import { defineConfig } from 'vite';

// 使用相对 base，保证部署到任意子路径（Vercel 预览/自定义目录等）都能正确加载资源
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      output: {
        // vendor 分包：将第三方大体积库分离到独立 chunk，浏览器并行下载，加速首屏
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('echarts')) return 'echarts';
            if (id.includes('@shoelace-style')) return 'shoelace';
            if (id.includes('pinyin-pro')) return 'pinyin-pro';
            if (id.includes('china-division')) return 'china-division';
            if (id.includes('flatpickr')) return 'flatpickr';
          }
          return undefined;
        },
      },
    },
  },
});
