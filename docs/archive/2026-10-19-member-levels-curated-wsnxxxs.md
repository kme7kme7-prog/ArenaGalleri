# 2026-10-19 · 成员分级与精选榜前端 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：前端 Sonnet 5.5、设计 Opus 5.5、后端 GPT-6.1-Sol、review GPT-6.1-Sol
- 人员与范围：Gallery 前端（`site/*`、i18n、测试）由前端 Sonnet 5.5 实现；后台页面（`arenaofbias-server/admin/*`）同由前端实现，随后端仓库提交；API 与规则由后端实现；设计稿与界面规范由设计 Opus 5.5 出；review 共四轮。本档只记 Gallery 仓库内的改动，后台与服务端以各自仓库提交为准。
- 提交号：见本轮提交

## 本轮目标

按新的成员分级（Lv0–Lv3）重做前端：Lv0 先通过资格考试才能发起题目、上传作品；盲评投票/跳过改按服务端时间等待；排行榜拆为大众榜与精选榜；后台补精选题目与分区、资格考试标准对、投票风控三类维护页；与真实后端联调后收口。

## 改动

- 等级与引导：菜单/个人中心显示等级；`site/level-gate.js` 在发起题目、上传作品处给 Lv0 看资格考试引导；成员管理改为等级与考试情况。
- 资格考试：新增 `#/exam`（`site/exam.js`），题量与及格数取 API（`exam.correctRequired`），不写死；中途离开保存进度，可回看改选，交卷后只公布总分。`scripts/datapack.mjs` 把 `exam` 加进保留路由名。
- 盲评：投票/跳过等待读 `voteAllowedAt`/`skipAllowedAt`/`serverNow`（5 秒/3 秒，两侧都就绪后计时）；未登录与未绑定邮箱的票提示为计入大众榜；快速连选与访客间隔走人机验证面板。
- 排行榜：大众榜与精选榜，`#/leaderboard/curated[/<分区>]`（`site/curated.js`）；分区与「空/收集中/从零开始」状态均取 API；盲评题目列表给精选题加标记。
- 文案：英文集中在新增 `site/i18n-levels.js`（最后加载、覆盖旧措辞），删去失效的「36 题精选前端」旧条目；`legal.js` + `i18n-platform.js` 的隐私条目补「盲评提交」（记录 IP 与浏览器标识，原始 IP 保留 180 天后仅留网段）。
- 后台（随服务端仓库提交）：精选题目与分区维护、资格考试标准对维护、投票风控（`#/vote-risk`，仅 Lv3）。
- 测试：`test/arena-loading.test.mjs`（`watchFrameLoad` 改为消息驱动）、`test/curated-leaderboard.test.mjs`。

## 决策

- 就绪只认该 iframe 自己发出的 `aob:work-ready`（校验 `event.source`、`event.origin`、`event.data`），原生 `load` 仅作提示；预取只抽签不建 iframe，不触发 ready。理由：作品可能在 load 之后才渲染完，按 load 计时会让「看满 5 秒」名不副实。
- 人机验证挂件按挑战里的 `action` 渲染（盲评为 `arena`），服务端严格校验 action 与域名；登录调用保持原样。
- 考试：ready 失败每 2 秒重试直到成功；`answer_too_early` 有 `answerAllowedAt` 就按服务端时间解锁，没有就重发 ready；已有答卷优先于 `exam.ready`（继续不受题库就绪限制，仅新开/重来受限）；退出考试使在途 ready 失效。
- Lv0 只被拦新建题；旧题被驳回后按原作者规则可重提（后端 resubmit 不要求 Lv1，实测 200）。
- 前端不写猜测分支：字段按真实后端取值，去掉 ready/`answerAllowedAt` 的容错。
- 耐久产品规则已上浮到 `docs/PRODUCT.md`。
- 待拍板：无。

## 验证

- `npm run check`：通过（85 个文件，0 错误）
- `npm test`：通过（56/56）
- 真实后端联调（隔离本地库，见遗留物）：后台标准对增改停启与真实 preview、精选勾选与分区、用户改级、投票风控全部视图与软作废/撤销；Gallery 盲评两侧就绪（3 秒可跳过/5 秒可投）、Lv1 第 3 次快速选择验证、访客首验与第 6 次验证、考试 15/20 未过与 16/20 升 Lv1、大众榜/精选榜、Lv0 投稿拦截均跑通。
- 联调桩改为按 token 回显真实 `action`（缺 action 则失败），首验、间隔验证与快速选择验证在严格桩下通过。
- 目视：桌面与 390 宽、浅/深色，英文界面做了 DOM 未翻译扫描。
- review 修复（四轮）：前两轮审后端（等级/考试/精选/验证与 v44；投票证据/风控/软作废与 v45），未发现业务问题，仅修一处后端测试随机重复对，不涉及本仓库；第三轮——Turnstile 未传 action、就绪误按原生 load、考试 ready 失败不可恢复、已有答卷被 `exam.ready` 挡住、Lv0 重提旧题被拦、作品下架（`gone()`）后访问已替换节点；第四轮——`cleanup()` 未使 ready 请求失效，退出考试后仍重试。均已复测。
- `CI=1 npm run check:intake`：通过（176 件结果，0 错误，8 条既有提示：1 条厂商待确认、7 条预览模型体积）。
- 未跑通：`npm run build` —— 原因：本机没有私有 `datapack.json`（`fetch-datapack.mjs` 报 Missing private datapack.json），没有构造 pin 或拉取生产数据。

## 明确没做

- 未部署，未 push 到生产，未向生产写数据。
- 未接真实 Cloudflare：Turnstile 只用本地假挂件与 Siteverify 桩验证 action，真实挂件、真实域名校验未测。
- 既有问题未修：重提页「审核意见」时间显示 Invalid Date（`moderation.at` 是毫秒数，被写进 `data-i18n-date` 后解析失败）；`site/home.js:115` 遗留定时器；后台登录偶发要点两次。
- 竞技场站隐私页未同步「盲评提交」条目（Gallery 的 `legal.js` 已加）。
- `/api/references` 未按等级拦（后端行为，前端未处理）。
- 渲染很慢、需 8 秒兜底才发就绪的作品未实测（演示作品均在 1–2 秒内就绪）。

## 遗留物

- `.local/tier-redesign/`（联调脚本、假挂件、种子数据、隔离数据库 `qualification-demo/`）不入库，可在不需要时整体删除。
- 演示库里 lv1-demo 有占位邮箱和一道已驳回的题 `q-1251edec6cb9caad`，仅在本地隔离数据中。
- 新增未跟踪文件：`site/curated.js`、`site/exam.js`、`site/i18n-levels.js`、`site/level-gate.js`，需随本轮提交。

## 下一步建议

- 上线前在预发布环境用真实 Cloudflare 站点密钥过一遍 action/域名校验。
- 同步竞技场站隐私页；修 Invalid Date（统一把毫秒数转成 ISO 再写属性）。
