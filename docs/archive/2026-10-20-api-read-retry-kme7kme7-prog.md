# 2026-10-20 · 平台读取退避重试 · kme7kme7-prog

- 负责人：kme7kme7-prog ｜ 执行 AI：Grok Bot（研发）

## 本轮目标

部分中国移动用户被 EdgeOne 把 api.arenaofbias.icu 调度到洛杉矶节点，TLS 握手慢或偶发失败，题库页显示「连接失败，请检查网络后重试」。kme7 批准：catalog、bootstrap 及同类启动读取在网络错误时自动退避重试，重试期间显示加载中，总耗时有上限；只开 PR，不合并不部署。

## 改动

- `site/platform-api.js`：新增 `retryRead` 与 `READ_RETRY`（退避 1s/3s/6s，最多再试 3 次；单次 15s；整次连同等待 45s）。无响应、超时、2xx 但不是 JSON 时重试；429 至少等到 Retry-After；其他 HTTP 状态（含 404/409/5xx）直接报。剩余预算不足以等待加一次 2 秒读取时停止，最后一次读取的超时缩短为剩余预算。
- `site/platform.js`：`catalog`、兼容 `bootstrap`、`session`、`activity` 四个 GET 读取经 `retryRead`；重试期间 `platform.connecting` / `sessionConnecting` / `activityConnecting` 保持为真，页面显示加载中；用尽后沿用原错误文案和 2 秒倒计时。404 切换兼容 bootstrap、409 版本不一致的处理不变。写请求和 `api()` 业务读取不变。
- 测试：新增 `test/platform-retry.test.mjs`（7 项）；`test/platform-recovery.test.mjs` 的 429 用例改为超过预算的 Retry-After（60s），超时用例改为验证读满 4 次后才报。
- 文档：`docs/ARCHITECTURE.md`、`docs/PRODUCT.md` 更新初始化读取的重试说明。

## 决策

- 重试参数按秘书转达的 kme7 要求定：1/3/6 秒退避，总上限 45 秒（建议范围 30–45 秒内取上限，因为 catalog 压缩后约 320KB、原始约 1.8MB，慢线路下单次需要留足 15 秒）。
- 5xx 不重试，按要求视为服务端业务错误。
- 待拍板：无。

## 验证

- `npm run check`：90 个文件，0 错误
- `npm test`：74/74 通过
- 浏览器（本机 Chrome + Playwright，打开线上 gallery，只把 `platform.js` / `platform-api.js` 换成本分支版本并拦截 `/api/catalog`）：前两次连接重置 → 加载中 → 第 3 次成功显示题目；首次返回 HTML → 第 2 次成功；持续失败 → 1/3/6 秒后共 4 次请求，约 10 秒后显示「连接失败」；500 → 1 次请求立即报错。
- 未跑：`npm run build`、`CI=1 npm run check:intake` —— 原因：需要私有数据包（gh 登录），本轮只改 `site/` 运行时 JS，不涉及数据包与构建脚本。
- 线上核对：线上 `platform.js`、`platform-api.js`、`app.js`、`home.js` 与 main `a400bf1` 规范化（去 `?v=`、去 CRLF）后一致。

## 明确没做

- 没有合并、没有部署、没有改服务器或 EdgeOne。
- 没有给 `data.json`（gallery 同源静态文件）和 `api()` 业务读取加重试。

## 遗留物

无。

## 下一步建议

- 治本仍在调度侧：让移动用户的 api 解析落到大陆节点（EdgeOne 配置或 DNS 线路），这是运维/kme7 的决定。
