# 2026-10-08 · 推理类别与 AI 评分预留（前端） · wsnxxxs

- 人员与范围：wsnxxxs；Claude Code 主代理，无子代理。仅 Gallery 的 site/（categories、platform、arena、leaderboard、app、ui、studio.css）、PRODUCT、DESIGN、HANDOFF 与本轮归档；用户授权一条英文提交，不推送、不部署。后端由另一 agent 按本轮整理的提示词在 arenaofbias-server 执行。
- 本轮目标与改动：原「文本」混入数学竞赛题、解谜题，按用户要求精简为四类：写作（存储值仍为文学）、推理（新增：数学、逻辑、哲学）、设计、三维。类别新增 `judging`（vote / ai）。推理由 AI 评分，暂不计分：bootstrap 时剔除推理题的盲评池；盲评大厅、排行榜不列推理题，推理题直达盲评链接回到大厅；题目页的盲评入口换成「AI 评分 · 暂未开放」，不显示榜单面板，也不读取单题分数。作品预留 `aiScore`（score、max、judge、rationale），有值时作品卡显示「AI 评分 x / max」，否则显示「AI 评分待开放」。默认领域加「哲学」，发起题目的类型卡片改为 2×2，新增推理图标。
- 决策：用户要求写作、设计、三维只做匿名两两盲投，不加分项打分或理由标签；推理改由 AI 评分，评分方式（离线批量或后端实时、评分模型）后续再定，本轮只预留字段。分类保持四类，不再细分题型。存储值、网址和已有票不变。后端必须先于 Gallery 部署；后端工作区原有的归属计分改动已由另一 agent 单独提交为 a294567，推理在其上开发，上线顺序为先归属计分、后推理。
- 验证：npm run check 64文件0错误；npm test 29/29；npm run build 176作品/68site；CI=1 npm run check:intake 0错误/8既有提示。本地夹具 output/reasoning-category-20261007/preview.mjs 服务构建产物，只读回放线上公开 API，把奥赛题、BLUE 改为推理并给一件作品加合成 aiScore：题库为写作11/推理2/设计7/三维34；盲评大厅和排行榜无推理题，「数学」领域随之消失；奥赛题线上有7个配置的盲评池，前端已挡掉，直达链接回到 #/arena；题目页显示占位、合成分数，无榜单面板；1280 桌面类型卡片为 2×2，无横溢；控制台无错误。
- 明确没做：手机端、登录发起推理题、真实后端联调、部署、生产迁移；没有改后端、数据包或私有仓库，没有推送。
- 遗留物：忽略目录 output/reasoning-category-20261007/ 保存预览夹具；本机忽略的 .claude/launch.json 增加 reasoning-category 配置。后端推理改动尚未完成，奥赛题（q-1479913673ca78cd）、BLUE（q-a028b56bafec3a10）的类别迁移待授权。
