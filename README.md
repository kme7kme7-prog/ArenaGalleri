# ArenaGalleri · 亿模亿样

画廊前端：浏览同一提示词的不同模型作品，在线运行、并排对比、查看截图、展示并复制完整提示词。账号、投稿、投票与榜单通过独立后台 API 提供。

同一道题可含长短提示词，按钮切换原文并复制当前版本；同模型、推理档位和来源的结果合为一张卡片，每份实际作品保留独立 ID，并排预览的两栏可分别切换。未收录的版本按钮禁用。

[打开正式画廊](https://gallery.arenaofbias.icu/)

本仓库仅包含 Gallery 前端、消费端构建工具和维护文档。作品数据、原作项目、模型包、截图和私有配置不入库；后台服务在独立仓库维护。

## 本地检查

需要 Node.js ≥ 22.13：

```sh
npm ci
npm run check
npm test
```

公开 CI 只运行这些检查，测试使用合成数据。它不取数据包、不上传构建产物、不发布 GitHub Pages。

源码与模块位于 `site/`，取包、构建与完整性检查位于 `scripts/`，合成数据测试位于 `test/`。`dist/`、`.datapack/`、`.integration/`、`output/` 和 `node_modules/` 是忽略的本地产物，不提交或手改。

## 授权构建

复制 `datapack.example.json` 为 `datapack.json`，在本地填写数据仓库地址和已发布数据包的完整 commit。真实配置被 Git 忽略，请通过私有渠道管理。

安装 GitHub CLI，以具有数据仓库读取权限的账号执行 `gh auth login`，然后：

```sh
npm run build
npm run check:intake
npm start
```

首次取包使用认证 GitHub API，认证失败时停止。有效的同版本缓存可离线复用；凭据不写入配置或发布文件。`DATAPACK_LOCAL_DIR` 可指定本地数据包绝对路径，这类构建如实标记为本地包。

构建将私有包与 `site/` 叠加为 `dist/`，不构建原作、不修改输入。海报缺失或过期时，本地回退截图；发布环境设置 `CI=1`，构建和收录检查会拒绝不完整的包。

## 后台与发布

构建时通过 `API_BASE_URL` 配置后台 API，通过可选 `MEDIA_BASE_URL` 配置投稿资源根地址；地址是公开运行配置，不含服务端密钥。

场景模型 `assets/scenes/...` 与后台 `/media/...`（封面、`preview.sbox`、`first.jpg` 等）默认仍从现有图库源站和 API 主机读取。读开关是 `MEDIA_CDN_BASE_URL`（运行时字段 `mediaCdnBaseUrl`，不要末尾斜杠）。空字符串、未设置或缺失都表示关闭。设为非空地址（例如 `https://media.arenaofbias.icu`）后，仅这两类相对路径改到该主机，路径键保持 `/assets/scenes/...` 与 `/media/...`。可选别名是 `VITE_MEDIA_CDN_BASE_URL`；两个变量都写了且规范化后不一致时构建失败。`mediaCdnEnabled` 不再作为开关，空的 base 优先，保持关闭。其它资源、作品 iframe 和已经写好的绝对地址不变。预发与正式是各自的构建或各自的 `runtime-config.js`：预发写入该 base，正式在确认前保持空字符串。回滚是把 `mediaCdnBaseUrl` 发布为空，不改对象键。

CDN 与存储桶的 CORS 由运维并行配置。卡片 `.sbox` 使用跨源 `fetch`，首页海报使用 `crossorigin="anonymous"` 后再读像素，因此媒体主机需要对画廊来源允许匿名 GET。参考图打包下载仍对 `/media/` 携带会话凭据，这类请求不能用 `*`，需要回显画廊来源并允许凭据。本仓页面的脚本 CSP 不限制图片和连接；若边缘另有更严的 `img-src` / `connect-src`，需同时放行该媒体主机。

新烘焙或发布的场景 `.sbox` 必须上传到 COS 的同一 `assets/scenes/...` 键（沿用运维同步脚本，或放进数据包发布步骤）。本仓库不包含上传脚本。只发布图库页面而不把新文件放到这些键上时，打开读开关会让这些模型 404。后台 `/media/` 的新上传由服务端双写负责，不在这里实现。

```powershell
$env:API_BASE_URL = 'https://api.example.com/api/'
$env:CI = '1'
npm run build
npm run check:intake
```

正式站从有数据读取权限的受信任环境发布。HTML 与全部站点 JS/CSS 一起更新，保留前后端数据包版本校验。跨源部署需要后台精确配置可信站点和 Cookie；投票、鉴权、计分和数据库写入由后台执行。

展示目录按字段白名单生成，保留提示词与页面必需内容，排除私有源码链接、源提交、完整模型池及内部收录字段。发布时排除来源标记、构建记录、海报指纹和源码映射，保留运行资源及第三方许可。提示词和可运行作品是公开展示内容，访客仍可保存。

将 `deploy/nginx/gallery-private-files.conf` 安装到网页目录之外，在 Gallery、API 及作品域名的 Nginx `server {}` 中分别 include，语法检查后 reload。它拦截遗留内部文件；读取频率、模型包下载和并发限制需要配套安装共享后台的 Nginx 限流配置。差异发布时也须清除旧站点遗留的内部文件。限流响应显示稍后刷新提示，不自动重试。

代码提交与 CI 通过不会自动发布正式站。每次发布应核对前后端数据版本和目录摘要、公开运行资源、内部文件拦截及受影响页面。当前部署状态和已验证范围见 [HANDOFF.md](HANDOFF.md)，具体备份及回滚步骤由私有运维交接维护。

跨仓 HTTP 冒烟可在本地另行执行：先获取已验证的数据包，配置忽略的 `integration.json`（参照示例），设置 `SERVER_REPO_DIR` 指向独立后台检出目录，并确认双方 `datapack.json` 固定同一包版本，然后运行 `npm run test:integration`。该命令使用隔离临时数据库，不把后台源码纳入本仓库，也不替代正式站验证。

- [当前交接](HANDOFF.md) · [维护约定](AGENTS.md)
- [架构与模块](docs/ARCHITECTURE.md) · [产品行为](docs/PRODUCT.md)
- [设计规范](docs/DESIGN.md) · [收录入口](docs/intake-workflow.md)
- [模型预览](docs/preview-loading.md) · [三维沙盘](docs/sandtable.md)
