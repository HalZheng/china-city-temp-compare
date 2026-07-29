# 部署与分享指南（Vercel 免费托管）

本仓库已改造为 **Vercel 就绪**：含 `vercel.json`、`.nvmrc`(Node 22)、`vite.config.ts` 的 `base:'./'`。
接入 Vercel 后无需任何额外配置即可一键部署。

## 为什么选 Vercel

- **免费（Hobby 计划）**：无限静态站点部署、自动 HTTPS、全球 CDN、每次推送自动生成预览环境。
- **零后端**：本项目数据来自 [Open-Meteo](https://open-meteo.com) 免费 API（无需 key、支持 CORS），纯前端即可运行；Vercel 仅托管 `npm run build` 产出的静态目录 `dist/`。
- **免运维**：无需自己起服务器、配 Nginx、管 HTTPS 证书。

## 部署步骤

1. 打开 [vercel.com](https://vercel.com)，**用 GitHub 账号登录**（最省事，自动授权仓库）。
2. 控制台 **Add New → Project**，在 Import 列表里选 `HalZheng/china-city-temp-compare`。
3. 配置项 Vercel 会自动识别，**基本不用改**：
   | 配置项 | 值 |
   | --- | --- |
   | Framework Preset | `Vite` |
   | Root Directory | 仓库根目录（保持默认） |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |
   | Install Command | `npm install`（有 lock 文件时 Vercel 自动用 `npm ci`） |
4. 点 **Deploy**，约 10–30 秒后获得形如 `https://china-city-temp-compare.vercel.app` 的免费域名。
5. 把该 URL 发给朋友，打开即用。

## 自定义域名（可选，免费版也支持）

- Project **Settings → Domains → Add**，填入你的域名，按提示配置 DNS：
  - **CNAME** 指向 `cname.vercel-dns.com`，或
  - **A 记录** 指向 `76.76.21.21`
- 配置后 Vercel 自动签发 HTTPS 证书。

## 持续更新

- 每次 `git push` 到 `main`，Vercel **自动重新构建部署**（Automatic Deployments）。
- 推送到其他分支会生成独立**预览 URL**，可先验证再合并，不影响线上版本。

## 国内访问优化（可选）

Vercel 在国内访问偶尔偏慢。若朋友主要在内地，可二选一：

- **Cloudflare Pages**：连接 GitHub，Build Command `npm run build`、产物目录 `dist`，国内访问通常更稳。
- **Netlify**：同样免费零配置，可直接把本地 `dist/` 目录拖拽上传。

## 朋友使用须知

- 纯静态、无需登录，打开即用；气温数据由 Open-Meteo 实时拉取，**需联网**。
- 当前版本为可分享的最小可用版；已知的可优化项（请求缓存、查询持久化、年份上限等）见 `DEFECT_ANALYSIS.md`，不影响正常部署与使用。
