# 2026-10-20 · 搜索收录与分享卡片元信息 · kme7kme7-prog

- 负责人：kme7kme7-prog ｜ 执行 AI：按本轮提交规则不署名
- 本文写于提交前。用户授权从 fork 开 PR，由 shadow 合并；未授权部署。

## 本轮目标

kme7 希望网站在百度、Bing、Google 能按名字「亿模亿样」搜到（很多场合只能报名字），并让 QQ、微信的分享卡片显示正式介绍。这些卡片只读原始 HTML、不执行 JS。

## 改动（单个提交）

- `site/index.html`
  - title 改为「亿模亿样 ArenaGalleri · 模型效果对比」，description 写明中英文名与站点用途。
  - 新增 canonical `https://gallery.arenaofbias.icu/`、Open Graph（og:image 为绝对 https 地址）、itemprop（QQ 读取）、twitter 标签和 WebSite 结构化数据（name「亿模亿样」，alternateName「ArenaGalleri」）。
  - `#app` 内放一段静态介绍和到偏见试验场、总入口的链接，样式内联在 head；`app.js` 首次渲染用 `root.innerHTML` 整块替换。noscript 改为同样的介绍文字。
- `site/i18n.js`：`setPageTitle` 在英文界面把站名渲染为「亿模亿样 ArenaGalleri」，避免以英文环境渲染的爬虫拿到不含中文名的标题。界面里其他地方的站名翻译不变。
- `site/i18n-gallery.js`：首页、静态标题和新 description 的英文条目。
- `site/robots.txt`、`site/sitemap.xml`：放行全部并声明 sitemap。站点是 hash 路由，sitemap 只有首页。
- `site/assets/share-preview.png`：1200×630 **占位**分享图，用站点 logo 配色和 Noto CJK 字体在本机生成，正式图待 kme7 定。

## 决策

- 元信息只写静态 HTML；运行时 i18n 可以改标题，但标题里必须保留「亿模亿样」。
- 待拍板：标题、description、分享图的正式文案和设计（PR 说明里列了原文和建议）。

## 验证

- `npm run check`：89 个文件，0 错误。
- `npm test`：67/67。
- `npm run build`、`CI=1 npm run check:intake`：未跑。原因是本机没有私有数据包 pin（`datapack.json`）。替代做法：把 `site/` 复制到临时目录，用 Show1 的 three.js 补上 vendor，运行 `cacheBustSite` 生成与构建相同的 index.html，再用本地 HTTP 服务和 curl 核对新标签、robots.txt 和分享图（200）。headless Chrome 分别以 zh-CN 和 en-US 打开，静态介绍被替换，标题分别是「亿模亿样 ArenaGalleri · 模型效果对比」和「亿模亿样 ArenaGalleri · Compare AI models」。没有数据包，所以页面停在加载失败页，交互没有验证。

## 明确没做

- 没部署，没动 Nginx。数据包里的作品页面不在本仓，没有改。

## 遗留物

无。

## 下一步建议

- 发布后，在百度搜索资源平台、Google Search Console（网址前缀资源）和 Bing Webmaster 提交 `https://gallery.arenaofbias.icu/sitemap.xml`。验证文件直接放在 `site/` 根目录随构建发布即可。
