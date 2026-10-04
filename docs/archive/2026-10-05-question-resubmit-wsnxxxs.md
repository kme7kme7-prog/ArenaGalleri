# 2026-10-05 · 被拒题目修改后重新提交 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Claude Code

## 本轮目标与决策

用户问被退回题目的提交人能否看到原因并修改重传；当时只能看到理由、删除后重新发起。先在 Design 画布出交互设计（我的题目四种状态、重提表单、完成页、审核端、手机），用户确认规则后实现：只有从未公开的被拒题目可重提；不查发起资格但计入待审数量；示例默认保留、可移除；不限次数，内容未改由后端拒绝。

## 改动

- site/account.js：我的题目行显示审核意见（platform.js reviewVerdict）、「修改后重新提交」入口、第 N 次提交与上次意见；审核页题目行加「重新提交 · 第 N 次」、上次意见与本次改动（字段前后值、提示词逐行对比）；记录页识别 question-resubmit。题目 rejected 标签改为「未通过」。
- site/publish.js：`#/new/<id>` 进入重提模式，读取 `GET /api/me`，审核意见置顶、标题/简述/提示词「已修改」、示例保留/移除、提交 `POST /api/questions/:id/resubmit`，完成页阶段条；被拒完成页文案改为按意见修改后重新提交。
- site/line-diff.js 与 test/line-diff.test.mjs；platform.css 审核意见、历史、对比样式；studio.css 手机下可重提行按钮换行。PRODUCT.md 同步。

## 验证

- npm run check：62 文件、0 错；npm test：29/29；build 176 件 / 67 site 文件；CI=1 npm run check:intake：0 错、8 条既有提示。
- 本地预览（scratchpad preview.mjs，本轮后端工作树 + 临时库 + 合成题目与示例）：三种作者状态、无改动提交显示后端拒绝、改提示词标注已修改、移除示例、成功后第 2 次完成页；管理员题目队列显示上次意见、标题与提示词对比。1280 桌面与 375 手机深浅主题目检，无横向溢出；仅预期的 400 控制台记录。期间修正手机按钮挤压、侧栏标题换行、错误未清除、日期间距。
- 未跑：跨仓 integration smoke；未验参考图修改重提、真机与 Safari/Firefox。

## 明确没做与遗留物

未推送、部署或生产写入。主工作区有他人未提交的「全部题目筛选」改动，本轮在独立工作树 question-resubmit 分支完成并按用户授权本地提交一条，未合入 main；合入时 account.js、platform.css、PRODUCT.md、HANDOFF.md 可能需手动解决冲突。本机 .claude/launch.json（忽略文件）新增 question-resubmit 预览项，指向 scratchpad 脚本。无待拍板事项。
