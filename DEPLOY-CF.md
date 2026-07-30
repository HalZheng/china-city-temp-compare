# 部署到 Cloudflare Pages 指南（国内可达的免费托管）

本指南用于把本项目（Vite 纯静态站点）部署到 **Cloudflare Pages**，作为 Vercel 在大陆访问不稳时的替代方案。
对应 Vercel 版指南见 `DEPLOY.md`；其他国内平台对比见此前对话。

## 为什么选 Cloudflare Pages

- **免费额度慷慨**：无限站点、每月 500 次构建、请求/带宽基本不限（unmetered）。
- **原生连 GitHub 自动部署**：push 即构建，工作流与 Vercel 一致。
- **全球 CDN + 自动 HTTPS**，可绑定自定义域名。
- ⚠️ **注意**：Cloudflare 在**中国大陆访问不保证快/稳**（大陆节点受限）。若朋友主要在内地且实测偏慢，可改用 Gitee Pages / CODING Pages，或后续给 Cloudflare 套一层国内可达反代。天气数据（Open-Meteo）由用户浏览器直接请求，与托管平台无关，国内一般可直连。

## 方式一：连 GitHub 自动部署（推荐）

1. 打开 [dash.cloudflare.com](https://dash.cloudflare.com)，注册/登录（邮箱或 GitHub 登录均可）。
2. 左侧 **Workers & Pages** → **Create** → 选 **Pages** → **Connect to Git**。
3. 授权 GitHub，选择仓库 **`HalZheng/china-city-temp-compare`**。
4. 构建配置（Set up builds and deployments）：
   | 配置项 | 值 |
   | --- | --- |
   | Production branch | `main` |
   | Framework preset | **Vite**（选了会自动填下面两项，确认一下） |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | 留空（仓库根目录，即 `package.json` 所在处） |
5. **🔴 关键：锁定 Node 版本**。展开 **Environment variables (advanced)**，添加一条：
   - 变量名 `NODE_VERSION`，值 `22`
   - 原因：Vite 8 要求 Node ≥ 20.19；Cloudflare **不会自动读取** `package.json` 的 `engines` 字段，必须显式指定，否则可能用旧版 Node 导致 `tsc`/`vite` 构建失败。
6. 点 **Save and Deploy**。约 1–2 分钟后得到 `https://< project >.pages.dev`。
7. 之后每次 `git push` 到 `main` 自动重建部署；其他分支/PR 推送生成独立**预览 URL**。

## 方式二：本地构建 + 拖拽上传（不连 Git）

1. 本地执行 `npm run build`（已验证产出 `dist/`）。
2. Pages → **Create** → **Upload assets**，把本地 `dist/` 整个文件夹拖进去，命名项目，部署。
3. 缺点：无法自动部署，每次改完需手动重新上传 `dist/`。

## 本项目已就绪的配置（无需再改）

- `vite.config.ts` 的 `base:'./'`：保证任意子路径下资源加载正确。
- `package.json` 的 `engines.node>=20.19.0`：仅作说明；Cloudflare 实际以 `NODE_VERSION` 环境变量为准。
- `.nvmrc` = `22`：本地开发用；Cloudflare 用上面的环境变量。
- 纯静态 + Open-Meteo 免 key：无需任何密钥、后端或环境变量。

## SPA 路由（当前不需要）

本应用用 **query 参数**（如 `?city=...&years=...`）而非路径路由，Cloudflare 直接返回 `index.html` 即可，**无需**额外 rewrite。
若日后加入前端路由，可在 `dist/` 放一个 `_redirects` 文件，内容：

```
/* /index.html 200
```

> 注意：用了 `base:'./'` 后资源是相对路径，上面的 rewrite 不会影响资源加载。

## 自定义域名（可选）

- Pages 项目 → **Custom domains** → 添加你的域名 → 按提示在域名 DNS 加 CNAME 指向 `*.pages.dev`（或 Cloudflare 给出的记录）。Cloudflare 自动签发 HTTPS 证书。
- 若域名本身托管在 Cloudflare 并开启代理（橙色云朵），大陆访问仍受 Cloudflare 大陆可达性影响。

## 回滚

Pages → **Deployments** 列表，任意历史版本可 **Rollback**，出问题一键回退到上一个可用版本。

## 与 Vercel 并存

可以同时保留 Vercel 与 Cloudflare Pages 两个部署（都连同一个 GitHub 仓库，互不冲突）。给朋友分享时，哪个快发哪个；或把 Cloudflare 的 `*.pages.dev` 作为国内首选链接。
