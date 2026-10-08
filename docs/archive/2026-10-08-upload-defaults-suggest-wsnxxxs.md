# 2026-10-08 · 上传表单默认值与候选搜索 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Claude Opus 5.5

## 本轮目标

用户要求：普通管理员与高级管理员上传时，服务商、生成方式、人工介入默认填好；所有人的推理档位增加 Ultra、Ultracode；模型名称输入数字不用加点也能找到（56 即 5.6）；输入 6 先出 GPT-6 系列而不是 Opus 4.6；同等匹配按全站作品数并综合发布新旧排序；后端部分给出提示词。

## 改动

- `site/work-fields.js`：新上传时若当前用户为普通或高级管理员（`isStaff`），预填官方 / 一轮 / 只给了题目提示词；编辑已有作品不预填，普通用户不变。档位候选改为 `effortOptions()`，在后台列表后补 Ultra、Ultracode（去重）。模型、档位、Harness 的选项带全站作品数，模型另带首件作品进站时间与别名。
- `site/suggest.js`（新）：取代原生 datalist 下拉的站内候选列表，datalist 保留用于识别已登记项。分词匹配，版本号忽略点；以输入开头的版本排在只包含该数字的之前，连续匹配优先；同等匹配按 ln(作品数+1)、同系列版本新旧与首件作品进站时间综合排序。方向键 / 回车 / Esc 操作，选择后触发 input 与 change。
- `site/account.js`：批量核验的档位输入使用同一候选列表与 `effortOptions()`。
- `site/featured.js`：档位高低补 Ultracode > Ultra > Max。
- `site/platform.css`：候选列表样式。
- `test/suggest.test.mjs`：排序回归测试。
- `docs/PRODUCT.md`：投稿表单说明。
- 后台提示词：`output/upload-defaults-20261008/backend-effort-prompt.md`（忽略目录），把 `EFFORTS` 补上 Ultra、Ultracode。

## 决策

- 注册表没有发布日期，新旧用同系列版本号先后（GPT-6.1 晚于 GPT-6）与该模型首件作品进站时间代替。数据包作品的 addedAt 多集中在 09-25，进站时间这一项区分度有限，主要靠版本号。
- 默认值只针对管理员的新上传，避免作者编辑或审核时把缺项悄悄补成默认值。
- 前端先补 Ultra / Ultracode，前后端可以按任意顺序上线。

## 验证

- `npm run check`：67 个文件，0 错误；`npm test`：31/31。
- `npm run build`：176 件 / 69 个 site 文件；`CI=1 npm run check:intake`：0 错误 / 8 条既有提示。
- 构建产物本地表单夹具 `output/upload-defaults-20261008/form-preview.mjs`：moderator 预填官方 / single-turn / none，user 三项为空；档位候选含 Ultra、Ultracode；输入 56 只列出 GPT-5.6 四个，方向键加回车选中 GPT-5.6 Sol 后厂商栏隐藏；输入 6 依次为 GPT-6.1 Sol、GPT-6 Astra/Sol/Luna/Astra Pro；375 手机宽度无横向溢出。
- 未跑：真实后端登录投稿、管理员审核弹窗、批量核验弹窗内的候选列表，真机与读屏器验证。

## 明确没做

后端改动、推送、部署。

## 遗留物

忽略目录中的夹具与提示词 `output/upload-defaults-20261008/`；`.claude/launch.json` 新增 upload-defaults 配置（本地文件）。

## 下一步建议

- 把提示词交给后端 agent 执行；之后可与下一次 Gallery 发布一起上线。
- 其他可选 UX 建议见本轮对话回复，未实施。
