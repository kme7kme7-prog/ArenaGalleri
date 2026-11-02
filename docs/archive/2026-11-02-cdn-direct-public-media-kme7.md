# 2026-11-02 · 公开作品媒体直连 CDN · kme7

- 负责人：kme7｜ 执行 AI：Cursor Grok 4.7

## 本轮目标

公开作品媒体直接请求 `https://media.arenaofbias.icu/...`，不再先打到 `https://api.arenaofbias.icu/media/...` 再被 Nginx 301。服务端 PR#28 之后，`/media/references/` 与 `/media/pack-references/` 仍必须走 API 做访问检查。不合并、不部署、不改 Nginx 或后台。

## 改动

- `site/media-cdn.js`：开关打开时改写 `/assets/scenes/` 与公开 `/media/**`；参考图两棵目录不改写。绝对地址仅当主机是配置的 API 或 `api.arenaofbias.icu` 且路径为公开 `/media/` 时换成 CDN 源站，保留路径与查询。
- `site/platform-api.js`：`mediaUrl` 先走 CDN 改写；未被改写的相对 `/media/`（参考图，或开关关闭时的全部 `/media/`）仍落到 API 并附 `access=20261026`。
- 说明：`site/runtime-config.js`、`README.md`、`docs/ARCHITECTURE.md`、`docs/preview-loading.md`。
- 测试：`test/media-cdn.test.mjs`、`test/frontend-api.test.mjs`、`test/preview-media-access.test.mjs`。

## 决策

- 参考图与数据包参考图保持 API 验权，不进入匿名 CDN。
- 其它 `/media/**` 在开关打开时直连 CDN。这与当前 API 主机对非参考图 `/media/` 的 301 同一暴露面，不把撤下或审核中的对象新放到匿名 CDN；桶上尚未公开的键仍不可匿名读取。
- Arena 对局地址继续经 `mediaUrl`，原作展厅 iframe 继续用作品 `scene`。这两个文件不改。
- 未获 kme7 确认前不合并。

## 验证

- `npm run check`：118 个文件，0 错
- `npm test`：155/155
- 未跑：`npm run build`、`CI=1 npm run check:intake` —— 原因：无私有数据包，且本轮不改收录
- 未跑浏览器 —— 原因：改动是地址选择，页面结构不变；本环境没有可目视的生产媒体配置

## 明确没做

- 未合并、未部署、未改 Nginx 或 arenaofbias-server。
- 未改 `arena.js`、`exhibition.js`。
- 未把 `blob:`、`data:` 或第三方主机改到 CDN。

## 遗留物

无。

## 下一步建议

kme7 确认后再合并。上线后抽查公开作品封面、预览模型与截图是否直连 `media.arenaofbias.icu`，并确认参考图与数据包参考图仍请求 API 且匿名不可读。开关仍可用空的 `mediaCdnBaseUrl` 回滚。
