# 2026-10-08 · 盲评固定模型 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Claude Opus 5.5（Claude Code 桌面版）

## 本轮目标

高级管理员遇到新模型时，能在随机盲评中固定一个模型，快速确定它在榜单上的大致位置。后台改动见 arenaofbias-server 同名归档（d110623）。

## 改动

- `site/arena.js`：盲评大厅侧栏增加「固定模型」选择框（仅高级管理员，候选来自 bootstrap `arenaModels`），选择存 sessionStorage `arena-pin`，不写网址；固定时大厅与随机范围只列该模型有作品的题。对局请求带 `pin`，随机模式遇 `pinned-absent` 略过该题。对战页顶栏「固定 · 模型名 ×」可退出并丢弃预取；揭晓后显示本次累计胜平负，计票后读取综合模型榜显示名次、分数与区间。
- `site/platform.js`：`arenaModels` 默认空，每次 bootstrap 先清空，退出登录不残留。
- `site/platform.css`：固定标记与累计行样式；860px 以下标记只显示「固定 ×」。
- `docs/PRODUCT.md`：盲评段落补充固定模型规则。
- 提交：本归档所在提交（未推送）。

## 决策

- 票照常计入公开榜单（用户拍板）；后台对局记录 `pin` 留痕。
- 左右随机、对手由后台抽取；只给高级管理员；按模型固定。不做全站加速、多模型固定、管理员选对手或单独报告页。

## 验证

- `npm run check`：65 文件 0 错误；`npm test`：30/30；`npm run build`：176 件 / 68 site；`CI=1 npm run check:intake`：0 错误、8 条既有提示。
- 真实后台代码 + 临时库（output/arena-pin-20261008/harness.mjs，忽略）：固定 Claude Sonnet 5.5 后大厅 4 题；随机 12 组均含该模型，A/B 两侧都出现；5 票计入，累计与「综合第 N 名 · 分数 ±区间 · 暂定」正确；退出后下一组无 pin。1400 宽截图目检；390 手机无横溢。
- 未跑：真机、生产、全交互验收 —— 原因：未部署。

## 明确没做

未推送、未部署；未新增前端自动化测试（行为由后台测试与浏览器验证覆盖）。

## 遗留物

忽略目录 output/arena-pin-20261008/（harness 与临时库）及 .claude/launch.json 的 arena-pin-real 条目，均不提交。

## 下一步建议

先部署后台（含 matches.pin 迁移），再部署 Gallery。
