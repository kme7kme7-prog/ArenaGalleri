# 2026-10-06 · Dots3-Note-Preview 登记与联合发布 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Codex（GPT-6）；接续用户已授权的提交、推送、部署与指定作品改登记。

## 本轮目标

将线上自填模型 Dots3-Note-Preview 并入既有 dots3-note，保留原作品、历史票和比较数，完成两端配套发布与验收。

## 改动

- Gallery 固定源码 dbea8e70d78d64e20146fc9fce0d8b97f975c5e9，生产 API 根地址构建，资产5ad2894c7118400476fe77ae；本地忽略pin更新至新正式包。私有仓库地址和产物SHA不写入公开记录。
- 后端e9f3282与新正式包上线；以shadow通过setMeta将little-red-riding-hood/up-n2x66q0t登记为dots3-note，自动更正同digest的6侧票，原作品ID不变。
- check:deployment原先未规范化根API地址，错误请求/bootstrap；补齐前端同样的/api/规范化，并检查staleBuild。该消费端检查工具不改变已发布页面资产。

## 决策

- 从已有不可变Git tag导出私有产物，关闭Windows换行转换，逐Git blob验证再安装。未引入凭据文件或改写共用datapack客户端。
- 按后端部署手册使用真实current旧包生成差异；所有上传使用SSH标准输入并核对SHA-256。Gallery暂存全量核对后切换，version.json最后单独发布。
- listed:true在源注册表保留；包生成和公开目录裁掉此字段，用注册表和公开模型列表验证上架。没有改变模型ID。

## 验证

- Gallery check64/0、test29/29、生产build176件/68site、严格intake0错/8既有提示；后端本地及Linux check109/0、test318/318；数据仓check33/0、test9/9、严格intake176件/0错/8提示。
- 新包2288文件逐Git blob一致；4文件差异、0删除，本地试应用和服务器整树SHA通过。Gallery4文件变化、0删除，暂存和正式目录完整manifest/精确文件集合通过；公网变化文件SHA与本地一致、version缓存为no-cache且HTML版本一致。
- 首次演练脚本忘记使榜单缓存失效，重读确认数据更正成功后修脚本。最终全新副本首次编辑1件、改票6侧、加审计7条，重复运行全部为0；生产停服VACUUM INTO一致快照后执行同样流程并验证。
- 维护窗口有效比较4945→4945；原始5232票除更正字段逐列保留，718件作品除目标登记字段/更新时间逐列保留，原审计保留，只新增7条。integrity_check=ok、foreign_key_check=0行、user_version=40，服务active/running、NRestarts0。
- 公网bootstrap版本和数据包正确，旧x:dots3-note-preview消失，新dots3-note显示Dots3-Note-Preview、rednote hilab、6比较/1作品。check:deployment通过（47题/27社区题）。浏览器实际榜单搜索及截图目检通过，无未收录标记、无脚本警告/错误。公网比较数会继续随正常用户投票增加。

## 明确没做

未修改游戏、其他模型ID、原作文件、Nginx或凭据；未做生产登录、邮件、投稿、新增有效投票、全交互、真机及旧标签页加载失败恢复验证。构建成功不代表这些交互通过。

## 遗留物

服务器备份/root/aob-dots3-release-20261006/backup/包含旧代码/版本/数据指针、Gallery及部署前/登记前一致数据库快照；旧包继续保留。忽略output/dots3-release-20261006/保留脚本、校验及失败尝试证据；没有清理其他会话文件。

## 下一步建议

本次目标已完成；保留备份供回退。后续发布继续以现场版本门禁和配套包版本为准。
