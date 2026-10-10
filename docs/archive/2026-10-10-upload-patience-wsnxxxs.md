# 2026-10-10 · 投稿等待与小字提醒 · wsnxxxs

- 负责人：wsnxxxs｜执行 AI：Codex 主代理。
- 目标：删除上一轮调查记录，取消上传60秒断开，使用小字提醒。
- 改动：删除旧调查交接、归档和本轮自建调查输出；submit.js新增现有fine样式提醒。API HTTPS包含后台新增upload-timeout.conf，请求体空闲等待为1d（24小时）。Nginx该定时器不能通过0关闭；上传大小上限保持。
- 发布：保留线上连接修复。隔离构建采用origin/main的app.js/platform.js和本地已上线ui.js；完整2353文件比对只有submit.js/index.html/version.json变化，其余2350项保持。data.json/runtime-config.js保持字节一致。后端模块、数据包、版本标记与业务数据未改。备份/root/aob-upload-patience-20261010T063751Z/backup；nginx -t后reload，安装约1.907秒。
- 验证：Gallery check68/0、test33/33；生产API配置build176结果/70site，严格intake0错/8既有提示。后台check115/0、test332/332。HTTP/1.1与HTTP/2匿名请求暂停70秒后恢复，分别70.112/70.084秒正常返回401和Gallery跨域头；401为故意不带凭据的测试预期。公网5文件SHA、check:deployment通过，服务active/NRestarts0、Nginx active。
- 目视：公网题目上传页显示12.5px灰色提醒，控制台错误/警告0。未验证手机、实际登录上传、试加载或最终投稿；不把暂停测试视为所有上传交互通过。
- 决策：取消一分钟断开，改为24小时空闲等待；提醒不呈现运维实现细节。没有待审批的线上变更。
- 遗留物：发布构建与受控验证位于忽略output/upload-patience-20261010/，不含凭据。其他会话输出保留。两仓各一条英文提交，不push。
