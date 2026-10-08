# 2026-10-08 · 模型名称提示与搜索匹配 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Claude Opus 5.5

## 本轮目标

用户要求：输入的模型名还没登记、但和已登记模型很接近时（如 `gpt5.6 luna`），提示「是否指 GPT-5.6 Luna？」，减少 Haiku 那样的重复榜单行；题库搜索和排行榜搜索换成与上传候选相同的匹配规则，输入 `56` 能搜到 5.6。前端直接改，后端给提示词。另按用户要求先提交上一轮 Ultra / Ultracode 的两仓记录。

## 改动

- 上一轮记录：后台 eec8a54（Offer Ultra and Ultracode efforts.），Gallery fd14e3c（记录）。
- Gallery a417d4a：
  - `site/match.js`（新）：从 `suggest.js` 抽出的纯匹配模块。`rankSuggestions`（候选排序）、`textMatches`（搜索筛选：分词，版本号去点，以输入开头或包含）、`closestEntry`（名称提示）。
  - `closestEntry`：写法相同即命中（压缩后一致或去点后词集合一致，含别名）；否则要求词数相同，数字和不足 4 个字母的词必须一致，4 个字母的词允许 1 处、5 个以上允许 2 处编辑距离。
  - `site/work-fields.js`：模型栏下方显示「是否指 X？」，点击填入登记名并触发 change；打开已有作品时也按自填名直接显示。
  - `site/app.js`：题目页作品搜索、题库模型索引（加入别名）改用 `textMatches`；`site/leaderboard.js` 排行榜搜索同样。
  - `site/platform.css`：提示用强调色；`test/match.test.mjs`（由 suggest.test 改名）加提示与搜索用例；`docs/PRODUCT.md` 同步。
  - 同提交内含后台 agent 写入的 Gallery 交接一节与 `docs/archive/2026-10-08-model-name-duplicates-wsnxxxs.md`。
- 后台 a23efb7（由另一 agent 按提示词执行）：`modelNameKey` 改为只保留字母与数字，与前端 compact 一致；新增只读 `scripts/report-model-duplicates.mjs`；2 条测试；api-contract 说明。

## 决策

- 前端提示允许错字，后端只做无歧义的写法归一，不做错字匹配。
- 不在读榜时自动把 `x:` 自填名归到登记模型；疑似重复由只读报告列出，用户逐件决定后走 `library.setMeta`。
- 搜索只改匹配，不改排序。
- 前端 `models.js` 的显示用名称归一（去空格、`-`、`_`）本轮未改。

## 验证

- `npm run check`：68 个文件 0 错误；`npm test`：33/33；`npm run build`：176 件 / 70 site 文件；`CI=1 npm run check:intake`：0 错误 / 8 条既有提示。
- 现有注册表两两互查 `closestEntry` 无误报；第一版的 Ling 3.0 Flash / Flash VL、Laguna S / XS、GLM-5 / 5V Turbo 互认已通过收紧规则排除。
- 表单夹具 `output/upload-defaults-20261008/form-preview.mjs`：`gpt5.6 luna` 显示提示，点击后值为 GPT-5.6 Luna、厂商栏隐藏、提交 modelId=gpt-5.6-luna。
- 静态构建（无后端）：题库模型索引 `56` → 3 个模型、`luna 56` → 1、`doubao` → 2；波音 787 作品搜索 `56` → 3 件、`qwen38` → 1、`zzz` → 0。控制台仅预期的 `/api/bootstrap` 404。
- 后台（agent 报告）：Windows / Linux check 通过、test 327/327；262 个模型无键冲突；旧一致副本 16 件未登记、疑似重复 0 件。
- 未跑：排行榜搜索的浏览器验证 —— 原因：需要平台后端，本地静态预览不可用；同一函数已单测。真实后端投稿、审核弹窗、真机未测。

## 明确没做

推送、部署、生产库报告、读榜自动合并。

## 遗留物

忽略目录 `output/upload-defaults-20261008/`（夹具、两份后台提示词、构建日志）；`.claude/launch.json` 的 upload-defaults 配置（本地文件）。

## 下一步建议

- 上线后在生产一致副本上只读跑一次重复报告，再逐件决定是否 setMeta。
- 如要统一显示与提交的归一，可把前端 `models.js` 的 nameKey 也改为 compact（会让更多旧自填名显示为登记模型，但计分键不变，需与后台读榜合并一起决定）。
