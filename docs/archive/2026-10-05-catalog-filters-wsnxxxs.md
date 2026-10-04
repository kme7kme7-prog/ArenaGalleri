# 2026-10-05 · 全部题目筛选 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Claude Opus 5.5

## 本轮目标

审核页「管理 · 全部题目」缺少与「全部作品」一致的筛选，按全部作品的筛选布局和样式补上。

## 改动

- `site/account.js`：全部题目改为与全部作品同构：标题行「全部题目 N」与说明；工具行为搜索（题目、提示词或发布者）+ 题目类型 / 领域（取现有题目出现的领域）/ 排序（最新、最早、题目名称、作品最多）；状态胶囊沿用原分组（全部 / 已公开 / 待审核 / 未公开 / 不收投稿），数量随搜索与下拉范围变化；列表上方「显示 x / y 道题目」，无结果给「清除筛选」。输入、下拉、胶囊只重绘胶囊与列表，搜索保持焦点。
- `site/platform.css`：复用 `work-management` / `work-manage-*` 样式，删除不再使用的 `.catalog-tools`。
- `docs/PRODUCT.md`：同步全部题目的筛选说明。

## 决策

- 直接复用全部作品的类名与样式，不另写一套，保证两处布局一致。
- 领域下拉只列现有题目出现过的领域，避免选出必然为空的结果。

## 验证

- `npm run check` 60/0、`npm test` 28/28、`npm run build` 176 件 / 66 site、`CI=1 npm run check:intake` 0 错 / 8 既有提示。
- 真实本地后端临时库（忽略的 `output/catalog-filters-20261005/preview.mjs`，launch 名 `catalog-filters`，高级管理员 + 待审 / 已拒绝合成题）：类型、领域、状态胶囊组合计数正确；按发布者搜索且保持焦点；无结果与清除筛选；四种排序。1280 桌面工具行与胶囊位置和全部作品逐像素一致；375 手机搜索整行、三个下拉一行、胶囊横向滚动，无外层横溢、无控制台错误。
- 未取得截图：浏览器窗格未绘制，靠布局测量核对。未测生产、真机、跨浏览器。

## 明确没做

- 未改后端；未推送、未部署。

## 遗留物

- 工作区另有其他会话未提交的 `site/arena.js`、`scripts/assemble-site.mjs`、`scripts/cache-bust.mjs`、`scripts/public-catalog.mjs`、`test/cache-bust.test.mjs` 改动，未纳入本轮提交，保持原样。
- 忽略目录 `output/catalog-filters-20261005/` 与本地 `.claude/launch.json` 的 `catalog-filters` 条目为预览材料。

## 下一步建议

- 无。
