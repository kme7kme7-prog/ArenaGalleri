# 2026-10-07 · Gemini High 与投票合并 · wsnxxxs

- 负责人：wsnxxxs；执行 AI：Codex。范围：生产作品元信息和历史票归属、私有数据仓对应登记、Gallery交接；不改前端源码。
- 目标：将所有当前 Gemini Max 结果改 High，并合并历史投票。
- 改动：当前可维护作品仅飞尘工地 gemini-3.8-flash-max 一件，通过现场后端 setMeta 保存 High；19侧票自动更正，新增20审计。私有数据仓同步manifest、目录和作品说明，ID及源码保留。用户轮次指令授权英文提交；两仓各一条，不推送。
- 决策：生产已支持元信息覆盖和旧票更正，沿用现场代码，避免带入后端另一会话未提交功能。初始化清理在数据库事务中回滚，文件目录使用空隔离目录；正式修改在单一事务内核对后提交。已下架未核验投稿 up-vzwxpl8f 的原始Max字段保留，不恢复作品，不参与计票。未重发数据包，联网Gallery消费后端High覆盖，后续数据包由已更正源登记生成。
- 验证：两轮一致副本演练、停服备份后正式运行及幂等复跑通过。总有效比较5712、参与者147不变；配置115→114。19侧除effort/effortKey/configKey外身份字段一致；原票原列、原始快照及既有审计逐行保留，其他业务表一致。完整性ok、外键0、v40，服务active/running、NRestarts0。
- 公网：Gemini 3.8 Flash High比较309→328、作品24→25，无Gemini Max榜单行，目标作品bootstrap为High；check:deployment通过，51题/31社区题。1280桌面搜索Gemini榜单及作品预览截图目检，0脚本错误；iframe属性和原作THREE.MeshLambertMaterial材质参数警告存在。
- 本地：Gallery check64/0、test29/29、build176件/68site、严格intake176件/0错/8既有提示；数据仓check33/0、test9/9、严格intake176件/0错/8既有提示。未跑数据仓build:data：仅登记元信息修改且本轮不出包；未测试手机、真机、全作品交互、生产登录或新增有效票。
- 遗留物：服务器/root/aob-gemini-high-20261007/backup/platform.db保留回退；忽略output/gemini-high-20261007/保存脚本与私有证据，output/playwright/gemini-high-20261007/保存截图。生产前后端源码、正式包未修改，后端其他会话工作树保留。
- 下一步建议：无必需待办；以后正常出包时消费更正后的源登记。
