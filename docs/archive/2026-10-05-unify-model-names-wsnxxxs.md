# 2026-10-05 · 统一模型名与数据包 pin · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Claude Opus 5.5（Claude Code）

## 本轮目标

用户要求：MiniMax M3.1 统一为「MiniMax M3.1 Flash Preview」（含自填「MiniMax M3.1Flash Preview」的投稿）；Qwen3.8 Max 0902 并入 Qwen3.8 Max；Qwen3.8 Flash 并入 Qwen3.8 Flash next；Doubao Seed 2.1 Pro 与 Seed 2.1 Pro 只留 Seed 2.1 Pro。HY 4 一项用户要求忽略。授权提交推送与部署。

## 改动

- 数据仓 `7fde837`：`minimax-m3.1` 显示名改为 MiniMax M3.1 Flash Preview（ID 不变）；中式建筑作品 `qwen3.8-max-0902` 加 `modelId: qwen3.8-max`（作品 ID 与地址不变），注册条目 `qwen3.8-max-0902` 设 `listed: false`；README 目录重生成。CI 出包 `640346405751b4f1a22e84bea356d35cacc14c35`。
- 后端 `f02861b`：`datapack.json` 指向新包。
- Gallery：本地忽略的 `datapack.json` 指向新包；仅提交本归档与 HANDOFF。
- Qwen3.8 Flash 早已是 Flash next 的别名，Doubao Seed 2.1 Pro 早已是 Seed 2.1 Pro 的别名，注册表无需改动。

## 决策

- 数据仓约定已引用的模型 ID 不改名、不删除，所以只改显示名与作品 modelId，0902 条目保留在 modelPool。
- 自填模型名的投稿不受注册表别名影响（后端按自填名分组），需在管理后台改登记，由后端自动更正同内容票。

## 验证

- 数据仓：check 33/0、test 9/9、严格 intake 176 件 / 0 错 / 8 既有提示；数据包 CI 成功。
- Gallery：check 64/0、test 29/29、生产 API 地址 build 176 件 / 68 site（资产 `8a4433f19ad112b9b87bbad5`）、严格 intake 0 错 / 8 既有提示；dist 目录核对 minimax-m3.1 显示新名、0902 不再列出、该作品归 qwen3.8-max。
- 后端：check 108/0、test 317/317。
- 未执行：生产部署、生产票归属更正、管理后台改登记 —— 原因：生产 SSH 被本机权限策略拦截，浏览器未登录管理员账号，执行 AI 不代输密码。

## 明确没做

未部署 Gallery / 后端，未切换生产数据包，未改生产数据库，未做浏览器目检。

## 遗留物

本地 `dist/`、`.datapack/` 已是新包构建产物（忽略文件）。

## 下一步建议

1. 部署后端 `f02861b`（同时带上已推送未部署的 `c5209ef` 下架作品改动）与新包，以 `API_BASE_URL=https://api.arenaofbias.icu/api/` 构建的 Gallery 资产，跑 `npm run check:deployment`。
2. 管理后台把 `up-esj2b4ji` 改登记为 minimax-m3.1，`up-2xp5x707` 改登记为 seed-2.1-pro。
3. 0902 作品（chinese-architecture/qwen3.8-max-0902）的历史 arena 票：停服备份后用后端 `scripts/correct-vote.mjs` 逐侧改归属 qwen3.8-max，再核对公开榜单不再出现 0902、Doubao Seed 2.1 Pro、MiniMax M3.1Flash Preview 行。
