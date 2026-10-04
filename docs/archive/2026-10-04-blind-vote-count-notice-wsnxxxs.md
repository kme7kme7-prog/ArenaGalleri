# 2026-10-04 · 盲评计票提示弹窗 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Claude Opus 5.5

## 本轮目标

未登录用户开始盲评时提示「登录用户投票才会计入」。先做原型给用户看，用户确认样式后落地：每个标签页只提示一次，未绑定邮箱的账号也提示。

## 改动（未提交）

- `site/arena.js`：在对战页抽取第一组作品之前判断，后台可用、用户未登录或未绑定邮箱、本标签页还没提示过（`sessionStorage` 的 `arena-login-notice`）时弹出计票提示。「先体验」、×、Esc 都直接开始；「登录后开始 / 绑定邮箱后开始」走 `requireUser`，「注册」走 `openAuth({ mode: 'register' })`，完成或取消后再抽作品。离开页面时关闭弹窗，不再抽作品。所有入口（首页、大厅行、随机一道题、直链）都会经过这一步。
- `site/platform.css`：新增 `.arena-login-sheet`、`.vote-ways`、`.vote-way-mark`，用于两行对比，计票一行盖朱红印章。
- `docs/PRODUCT.md`、`docs/DESIGN.md`：各补一句行为与样式。

## 决策

- 提示放在对战页而不是大厅入口，一处覆盖所有入口；放在抽作品之前，这样登录后开始的这一轮都会计票。
- 用户已确认：每个标签页只提示一次；未绑定邮箱也提示（用户说明现在注册必须绑定邮箱，这种账号应该已经不存在，仅作兜底）。对战底部原有的不计票提示保留。

## 验证

- `npm run check`：59 文件 / 0 错；`npm test`：27/27。
- 为不覆盖共用的 `dist/`，在忽略目录 `output/blind-login-prompt-20261004/build` 的源码快照里跑 `npm run build`：176 件 / 66 site；`CI=1 npm run check:intake`：0 错 / 8 条既有提示。
- Browser 用合成接口（`output/blind-login-prompt-20261004/preview.mjs`，端口 4460）加载快照构建，核对了：首页 → 大厅 → 随机一道题时弹窗出现；用合成账号走登录分支后开始计票对局；未绑定邮箱的版本（标题、按钮、无注册入口）；点「先体验」后换题不再弹出；没有捕获到控制台错误。原型阶段另核对了深色 / 浅色主题、390 宽无横向溢出、注册入口能打开注册表单。
- 未测：生产后端、真实账号、真机、Safari / Firefox。

## 明确没做

未提交、未推送、未部署；后端无需改动。

## 遗留物

`site/arena.js`、`site/platform.css`、两份文档和本归档均未提交。忽略目录 `output/blind-login-prompt-20261004/` 内有预览脚本和快照构建；`.claude/launch.json`（本地排除）新增 `blind-login-prompt` 配置。

## 下一步建议

用户授权后提交，随下次 Gallery 发布上线。
