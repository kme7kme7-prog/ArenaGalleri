# 2026-10-05 · 全部成员 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Claude Opus 5.5（Claude Code 桌面版）

## 本轮目标

用户要求给后台加成员管理与角色控制。确认先做第一步：「审核 · 管理」新增「全部成员」，仅高级管理员可见、普通管理员不给看；先出原型，确认后落地；随后要求补最近活跃迁移并提交两仓。

## 改动

- 原型（忽略目录 `output/member-management-20261005/preview.html`，launch `member-management`）：六个场景，用户确认后按原型落地。
- `site/member-management.js`（新增）：成员列表（搜索用户名 / 昵称，邮箱、活跃时间、排序下拉，按角色与可信成员分组的胶囊）与角色弹窗（账号与参与情况、打码邮箱、可信条件、角色记录、跳全部作品；三种角色权限卡，选中后显示变化说明，降级警示色；自己与 ADMIN_USERNAMES 固定账号只读）。
- `site/account.js`：`MANAGE_TABS` 加 `members`，仅高级管理员；打开该标签时读取 `admin/users`，保存后 `refreshPlatform('review')`；成员筛选事件；`#/review/works?q=` 带入作品搜索；`ACTIONS` 补 `role: '调整角色'`。
- `site/platform.css`：成员行与弹窗样式，760px 以下单列。
- 文档：PRODUCT / ARCHITECTURE / DESIGN 同步。
- 配套后端扩充 `GET /api/admin/users` 并新增 `users.last_seen_at` 迁移（见后端同日归档）。
- 以上为本提交。

## 决策

- 角色保持 admin / moderator / user 三级，不做权限矩阵或自定义角色。
- 普通管理员不显示成员列表；封禁、强制下线、手动设可信暂不做。
- 邮箱只显示是否绑定，弹窗里显示打码地址；「最近活跃」改由后端账号字段提供，退出后保留。

## 验证

- `npm run check`：61 文件 / 0 错；`npm test`：28/28。
- `npm run build`：176 件 / 67 site 文件；`CI=1 npm run check:intake`：0 错 / 8 既有提示。
- 真实本地后端临时库（忽略的 `output/member-management-20261005/harness.mjs`，launch `member-management-real`，`/__as/<用户名>` 切换账号）：计数与可信标记、搜索保持焦点、胶囊 / 邮箱 / 排序 / 无结果与清除；普通管理员降为成员、成员升为普通管理员后后端角色、行与胶囊更新；角色记录与「记录」页「调整角色」；自己与固定账号只读；跳全部作品带昵称搜索；普通管理员看不到入口且接口 403，成员进不了审核页；切换账号后被切走账号的最近活跃仍保留。1280 桌面与 390 浅色手机无横溢、无脚本错误。
- 未跑：真机、Safari / Firefox —— 原因：本轮只在 Browser 窗格内核对；未写生产数据。

## 明确没做

- 没有推送或部署；前后端需同版本发布（旧后端不返回新字段，列表会缺少统计）。
- 没有封禁、强制下线、手动可信。
- 后端 `/admin/` 页的旧用户表未改动。

## 遗留物

- 忽略目录 `output/member-management-20261005/`（原型与联调脚本）及 `.claude/launch.json` 中两条本轮配置，可保留供复查。

## 下一步建议

- 迁移上线前的历史账号若当时没有会话，最近活跃为空，登录一次后补上。
- 需要时可再做第二步（封禁 / 强制下线 / 手动可信），封禁需要迁移和会话清理。
