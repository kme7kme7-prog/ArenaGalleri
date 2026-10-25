# Gallery 架构

`site/` 是原生 ES Module 与 CSS 前端。构建工具消费独立私有数据包，后台 API 提供动态功能；本仓库不包含后台实现或另一前端。

## 构建

本地 `datapack.json` 固定包版本 → 认证下载及校验 → 忽略的 `.datapack/` → 叠加 `site/` → 忽略的 `dist/`。

`scripts/fetch-datapack.mjs` 使用 GitHub CLI 认证下载，复用 vendored 客户端的解包与安装校验。同版本缓存先验证再复用。`scripts/datapack.mjs` 校验模型、路径、截图与海报；原作收录和生成工具在私有数据仓库维护。

`scripts/public-catalog.mjs` 明确列出公开字段并排除内部文件。`assemble-site.mjs` 只复制可发布资源，再写入展示目录，原始包不改动。输入与站点出现路径碰撞时失败。

`cache-bust.mjs` 根据主站 HTML、JS、CSS 和运行配置内容生成统一哈希版本，覆盖主站 import map、入口与 CSS，不输出前端 Git SHA。同一版本写入 `version.json`；跨发布仍打开的旧标签页在懒加载失败时与自身 `?v=` 比对，不同则提示整页刷新。构建同时对最终内联启动代码和 import map 生成 CSP 哈希，写入最前面的 meta 策略；它与 Nginx 响应头策略同时生效，禁止其他内联脚本和事件处理器，保留 Cloudflare 验证和 Blob Worker。部署须整体发布 HTML 与资产，最后发布 `version.json`，且不能长缓存。海报指纹只覆盖渲染相关文件；修改这些文件须在数据仓库重新生成海报。

## 模块

| 模块 | 职责 |
| --- | --- |
| `app.js` / `home.js` | 路由、数据包与平台数据合并、提示词、首页与对比 |
| `platform-api.js` / `platform.js` | API 地址、凭据请求、版本协议、会话与公共界面 |
| `arena.js` / `leaderboard.js` | Gallery 内的盲评和榜单界面，调用独立后台 |
| `work-controls.js` | 并排作品的折叠协议、内容源 URL 与同源 iframe 脚本注入 |
| `publish.js` / `submit.js` / `account.js` | 题目、投稿、个人中心与审核界面 |
| `work-fields.js` / `work-management.js` | 共用作品信息字段与作品管理弹窗 |
| `question-preview.js` / `result-previews.js` | 代表作品选择和卡片模型展示 |
| `prompt-variants.js` | 提示词版本、同模型结果分组与当前版本选择 |
| `references.js` / `reference-files.js` | 题目参考图的展示、大图与打包下载、发起与编辑题目时的上传编辑器；后者为无依赖的命名、提示词说明与 zip 工具 |
| `preview-model.js` / `scene-resources.js` | 模型读取与资源回收 |
| `sandtable*.js` / `exhibition.js` | 三维沙盘及原作展厅 |
| `turnstile.js` | 按后台配置展示注册验证 |
| `ui.js` / CSS | 公共组件、布局、主题与偏好 |

`site/arena.js` 是画廊原有界面模块，不是另一前端的合并副本。

盲评和并排预览通过当前 iframe 的 `{source:'sp-fold', count}` 决定是否显示作品控件按钮，并发送 `{source:'sp-arena', fold:boolean}` 切换两侧。盲评由内容服务器注入脚本；并排时内容源上的作品 URL 追加 `aob=fold`，保留原有参数与片段。本站同源托管的 `/results/` iframe 在 load 后读取 `GET /api/fold.js` 的同一份脚本并注入当前文档，后加载的脚本立即扫描。API 地址与 CORS 沿用平台配置；API 不可用时同源作品保留原有控件。进入单栏会重建未启用折叠的 iframe，页面销毁时释放消息监听与跟踪。

每个地址只对应一个页面：路由在 `app.js` 的 `show()` 里只保存一个 `page`。首页、题库、条款、题目页、作品查看器、展厅 / 沙盘和各平台页的渲染函数都返回同样的对象，字段都可以省略：`ready` 是首批数据画完的 Promise，已经从记忆画好时为 null；`fullscreen` 表示页面自己管理滚动；`onPlatformChange(reason)` 表示登录或审核状态变化时页面自己重画，没有这个字段时路由会原地重画整页；`destroy()` 用来释放定时器、监听器和 iframe。页面可以直接设置 `root.on*` 事件，拆页时由路由统一清掉。作品查看器在同一道题的作品之间切换时不拆掉，只调用 `update`，已经打开的那一栏不会重新载入。点链接切换页面是一次 View Transition：在回调里拆掉旧页、画新页，等 `ready` 完成，最多等 300ms（`HOLD`），然后交叉淡入。等待期间旧画面保持不动。顶栏（`#app > .topbar`）和侧栏（`.app-sidebar`）有各自的 `view-transition-name`，内容相同的话过渡时看不出变化。浏览器不支持 View Transition、标签页在后台，或者是首屏、同页重画时，直接绘制。数据超过 HOLD 才到的页面先显示自己的载入状态，到了再原地补上。返回上一页时，等 `ready` 后再恢复一次滚动位置；如果读者在等待期间自己滚动过，就不再恢复。

页面进入时读取的数据（`me`、`auth/me`、`review`、`admin/questions`、各榜单）用 `platform.js` 的 `apiRemembered` 读取，按账号记住上一次的结果。回到页面时先用 `recall` 画出上次的内容，后台刷新；结果有变化才重画。同页操作或平台状态变化引起的刷新一律重画。

作品管理位于 `#/review/works`，题目管理通过 `?task=<题目ID>` 带入筛选。复用 `review` 的全量目录，以 `task/id` 标识单件与批量作品；数据包作品的媒体来自 `packagedWork`，不复制资源。弹窗由 `work-management.js` 绘制，`account.js` 传入共用的差异编辑器与审核回调；先写 metadata，再按实际改动写 face-settings，部分成功保留已保存信息。权限沿用 `canDecide` / `isSenior` 与后台校验，普通管理员本人作品不进入展示批量选择；普通管理员不请求 `admin/questions`。

成员管理位于 `#/review/members`，仅高级管理员显示，打开该标签时读取 `admin/users`；列表与角色弹窗由 `member-management.js` 绘制，角色记录取 `review` 审计日志中的 `role` 项，保存后 `refreshPlatform('review')` 同时刷新成员与审计。弹窗的「在全部作品中查看」以 `#/review/works?q=<昵称>` 带入作品搜索。

参考图属于题目：数据包题目的 `references`（`name`、`src`、可选 `thumb`、`caption`、`width`、`height`）与 `referenceCredit` 经 `public-catalog.mjs` 白名单输出，`datapack.mjs` 校验文件名与路径，提示词提到参考图而题目没有时给出提醒。后台题目 DTO 带非空 `references` 时以后台为准，否则沿用数据包；后台媒体路径在 `platform-api.js` 中解析。站点大图层 `#lightbox` 支持下载与胶片条，由 `app.js` 交给 `references.js` 打开；模态对话框内的参考图只显示、不打开大图。上传使用 `POST /api/references`（原始图片字节），提交题目与编辑题目只按 ID 引用已上传的图片。

参考图下载请求携带会话凭据，允许作者与管理员下载待审核题目的私有图片；单张图片读取为 Blob 后保存，使独立 API 域名下的图片也使用题面文件名。

启动时并行读取本地展示目录、公开 `catalog` 与轻量 `session`；公开目录一到即可展示，`activity` 的统计、表情与权限补充独立加载。三个请求各有就绪、连接与错误状态，题库使用局部骨架和重试，账号或统计慢不阻塞公开内容。公开目录以后台可见性为准，不因超时回退本地旧包；仅未配置独立 API 且默认相对接口返回 404 的独立静态站点使用包内档案。旧后端缺少 catalog 时合并为一次兼容 bootstrap 请求。

`catalog` 不带凭据，使用 HTTP `public, no-cache` 与 ETag，每次使用须向服务端确认；`session` / `activity` 携带凭据并禁止缓存。不持久化私有聚合响应。请求合并在途工作。`catalog`、兼容 `bootstrap`、`session` 与 `activity` 都是 GET，经 `platform-api.js` 的 `retryRead` 读取：无响应、超时、响应不是 JSON 或 429 时按 1/3/6 秒退避，最多再试 3 次（429 至少等到 Retry-After），其他 HTTP 状态不重试；单次读取最长 15 秒，整次读取连同等待不超过 45 秒，用尽后才显示原有错误和倒计时。退避期间页面保持加载状态。之后启动恢复仍自动再试一次并遵守 Retry-After；手动、恢复网络及回到页面可以恢复连接。刷新失败保留已经验证的内容。账号或角色变化清理私有记忆与权限覆盖，旧身份响应不得回写；写操作使在途旧统计失效，随后重新读取。单纯状态或统计变化不重建正在编辑的表单，确认身份改变才清理身份相关页面。数据版本仍用于写请求兼容。后台地址由 `runtime-config.js` 或构建环境变量配置，服务端密钥不得进入前端。 `MEDIA_CDN_BASE_URL`（别名 `VITE_MEDIA_CDN_BASE_URL`，运行时 `mediaCdnBaseUrl`）为空或缺省时媒体仍走原主机；设为 `https://media.arenaofbias.icu`（无尾斜杠）时，仅相对路径 `/media/` 与 `/assets/scenes/` 改从该基址读取，其余地址不变。

Gallery 独立主机的生产构建必须设置 `API_BASE_URL=https://api.arenaofbias.icu/api/` 再运行 `npm run build`，不能发布默认相对 `api/` 的本地配置。上线后运行 `npm run check:deployment -- https://gallery.arenaofbias.icu/ https://api.arenaofbias.icu/api/`，校验网站实际配置的 API、CORS、数据包兼容性及公开题目总数；浏览器另核对全部社区题目 ID 均出现在题库中。静态数据包只有20题，显示20题不能作为完整生产题库验收。

部署检查同时核对目录ETag重验证与匿名会话no-store；相同ETag仍返回200视为代理配置故障。API的动态代理须包含后台的 `deploy/nginx/api-proxy.conf`，关闭继承的Nginx proxy_cache，保留应用的公开缓存与条件头；媒体location保持独立策略。

题库只对有解答的题读取代表作品榜单，空题直接显示等待首份答案，避免无用请求触发共享读取限制。同题长短版本保持题目 ID，卡片按模型、推理档位与来源分组；每份作品保留独立 ID，并排预览两栏各自选择已收录版本。

## 验证与部署

公开 CI 只运行语法检查和合成数据测试。完整构建、数据完整性、跨仓联调和浏览器验收在受信任环境执行，配置与数据缓存不能放入公开 Actions 缓存或 artifact。

Nginx 私有文件规则见 `deploy/nginx/gallery-private-files.conf`，须覆盖 Gallery、API 和作品域名；只配置 Gallery 不能封住后台数据包资源的构建说明。频率与并发控制由共享后台的部署配置配套提供；仅更新前端代码不会启用这些服务器规则。正常浏览、限流响应及版本一致性需要在正式部署时核对。当前部署状态、备份位置说明与实际验证范围见 `HANDOFF.md` 及其发布归档。
