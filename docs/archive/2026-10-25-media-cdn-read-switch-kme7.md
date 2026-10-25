# 2026-10-25 · 媒体 CDN 读开关 · kme7

- 负责人：kme7｜ 执行 AI：Cursor Grok 4.7

## 本轮目标

为 Arena Gallery 增加默认关闭的读侧媒体开关。只有开关打开时，图库 `/assets/scenes/` 与 API `/media/` 才改从 `https://media.arenaofbias.icu` 读取。不合并、不部署。

## 改动

- `site/media-cdn.js`：判断相对路径是否属于 `/media/` 或 `/assets/scenes/`，开关打开时换成 CDN 主机。
- `site/platform-api.js`：API 媒体字段走该判断；关闭时仍用 `mediaBaseUrl` 或 API 主机。
- `site/ui.js`：图片地址在加数据包版本号之前套用同一判断，因此 `assets/scenes/` 海报会跟着切换。
- `site/preview-model.js`：卡片 `.sbox` 的 `fetch` 套用同一判断。
- `scripts/assemble-site.mjs`：`MEDIA_CDN_ENABLED` 或 `VITE_MEDIA_CDN_ENABLED` 为真时写入 `mediaCdnEnabled: true`。缺省不写该字段。
- `site/runtime-config.js`、`README.md`、`docs/ARCHITECTURE.md`、`docs/preview-loading.md`：写明开关名、预发/正式打开方式、CORS 与回滚。
- 测试：`test/frontend-api.test.mjs`、`test/media-cdn.test.mjs`。

## 决策

- 开关名是运行时 `mediaCdnEnabled`，构建变量是 `MEDIA_CDN_ENABLED` 与 `VITE_MEDIA_CDN_ENABLED`。只有布尔 `true` 或上述变量的 `1/true/yes/on` 会打开。
- CDN 主机固定为 `https://media.arenaofbias.icu`。路径键保持 `/media/...` 与 `/assets/scenes/...`，与已同步的 COS 键一致。
- 已是绝对地址的 URL 不改写，避免动到作品令牌域和沙盘域。
- 新场景 `.sbox` 的上传留给运维同步或数据包发布步骤，本仓不加入脚本。

## 验证

- `npm run check`：91 个文件，0 错
- `npm test`：69/69
- 未跑：`npm run build`、`CI=1 npm run check:intake` —— 原因：无私有数据包读取，且本轮不改数据包
- 未跑浏览器 —— 原因：开关默认关闭，没有可目视的页面差异；未对生产或 CDN 发请求

## 明确没做

- 未合并、未部署、未改 Nginx、未写 COS 上传脚本。
- 未把作品 HTML、`/results/`、头像或品牌标切到 CDN。
- 服务端新上传双写在独立的 arenaofbias-server 变更里，不在本仓。

## 遗留物

无。

## 下一步建议

预发构建加上 `MEDIA_CDN_ENABLED=1`，确认 CORS 放行画廊来源后，再抽样 `.sbox`、海报和 `/media/` 封面。正式在此之前保持开关关闭。新烘焙的 `assets/scenes/...` 要先进入桶，再考虑打开正式读开关。

## 勘误（2026-10-25）

运维锁定开关名为 base URL，不再用布尔值。`MEDIA_CDN_BASE_URL`（别名 `VITE_MEDIA_CDN_BASE_URL`，运行时 `mediaCdnBaseUrl`）为空或缺失表示关闭；非空 HTTP(S) 地址表示打开，且去掉末尾斜杠。`MEDIA_CDN_ENABLED` / `mediaCdnEnabled` 不再读取，空 base 优先于旧布尔值。上文仍写布尔开关的句子以本勘误为准。
