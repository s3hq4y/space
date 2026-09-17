# space

像 QQ 空间一样的个人私密站点：文章存在**私有仓库** `space-data`，由 Cloudflare Worker 在服务端鉴权，按每篇的 `visibility` 决定谁能看。正文永远不会提前进入浏览器，因此"隐藏"是真正的隐藏。

## 架构

```
浏览器 → Cloudflare Worker（守门人，持 GitHub token）
              ↓ 验证身份 → 读私有仓库 → 按 visibility 过滤
         私有仓库 space-data/posts/*.md
              ↓ 只返回该看的
         前端 SPA 渲染
```

## 身份（双轨）

| 轨道 | 适用 | 方式 |
|------|------|------|
| A | 有 GitHub 的好友 | GitHub OAuth 登录，匹配白名单 |
| B | 没有 GitHub 的好友 | 分享链接 + 文章口令 |

站主（`SITE_OWNER_GITHUB`）永远可见全部，包括 `private`。

## 本地开发

```bash
npm install
# 创建 .dev.vars（勿提交），填入下方机密
npm run dev
```

`.dev.vars`：

```
GITHUB_TOKEN=ghp_xxx              # 能读私有仓库的 PAT
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
```

## 部署

```bash
npx wrangler login
npx wrangler kv namespace create SPACE_KV   # 把返回的 id 填进 wrangler.toml
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npm run deploy
```

### GitHub OAuth App

在 GitHub → Settings → Developer settings → OAuth Apps 新建：

- Homepage: `https://space.<你的子域>.workers.dev`
- Callback: `https://space.<你的子域>.workers.dev/api/auth/callback`

把 Client ID / Secret 填入上面的 secret。

## 运维：好友白名单与口令

```bash
npm run kv -- friends add <github-login>
npm run kv -- friends list
npm run kv -- pass set <slug> <password>
```

改完即时生效（列表缓存 60s，最迟 1 分钟）。

## 安全要点

- 仓库 token、OAuth secret、口令映射只存 Worker Secret / KV，绝不出现在前端。
- 详情接口按 slug 单独鉴权，防猜 URL。
- OAuth 有 state 校验；`private`/`friends` 内容不缓存到 CDN。
- 已内置 `noindex`，不做 SEO。

## 待办

- [ ] 文章详情页的评论/留言（可接 Giscus）
- [ ] 口令文章的限速防爆破
- [ ] 列表缓存失效的主动刷新接口