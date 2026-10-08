# 2026-10-08 · 模型候选与搜索联合发布 · wsnxxxs

- 负责人：wsnxxxs；执行 AI：Codex。范围：Gallery 与配套后台推送、部署及验证。

## 本轮目标与改动

用户授权推送现有修改并部署。Gallery dc03ef85d083777045eaf754f494e40ec91b1f36 发布上传默认值、候选列表、模型名称提示与统一搜索；后台取消定期复查、Ultra/Ultracode和模型名去点/只读报告三个本地提交，与远端已上线的目录提速/媒体缓存正常合并为 f492d80c86df148a68940aa990bfe6d2f804819d。HANDOFF新增段落冲突保留两侧记录，功能无冲突，不强推。两仓公开功能CI成功。

生产短marker、公网bootstrap同为c4583e4，完整运行SHA与该Git归档一致。以已推送固定提交归档构建，后台仅catalog/config/moderation/admin.js/report-model-duplicates五运行文件变化；Gallery10文件变化，新增match.js。完整2353文件集合/SHA一致，data.json和runtime-config.js逐字节保持。后端先上线，再切Gallery，最后发布版本标记，资产d663fe5cfd009c1580e3217b。

## 决策

保留远端已上线修改与当前正式数据包；不改另一前端、Nginx、生产配置或业务归属。部署前和停服最新备份均执行新旧榜单、全部旧表逐行保留、数据库完整性门禁，失败不发布。备份留存供回滚，回滚代码不恢复旧库覆盖新业务写入。

## 验证

- Gallery check68文件/0错、test33/33；固定源码生产API构建176件/70site，CI=1 intake0错/8既有提示。真实HTTP临时库integration通过；原根integration.json数据源码pin过期，仅隔离复制配置按当前已验证包sourceCommit校准，根配置保持。
- 后台合并后Windows Node24.16.0与生产Linux Node22.23.2 check111/0、test328/328。合并前首轮随机监听端口触发Undici bad port，重跑327/327；无测试修改。
- 最新一致副本和停服备份7079票/966作品/v41；新旧模型/配置榜64/130行，6686/6801有效比较、177参与者全字段一致；全部旧表逐行保持，最终integrity ok、外键0。备份复验和切换约53.09秒，服务active/running、NRestarts0。
- 上传差异包SHA通过，暂存/正式Gallery完整2353文件集合/SHA通过，版本标记最后发布。公网10变化文件及data.json/runtime-config.js共12文件SHA通过。check:deployment56题/36社区题/844作品，生产API/CORS/包兼容通过，作品数为当时快照。Ultra/Ultracode已下发，capture/contentModeration/autoModeration均true。
- 使用Playwright技能，公网模型索引搜索56得到GPT-5.6 Luna/Sol/Terra，榜单gpt56 luna显示Luna两配置及模型结果。桌面与390手机目检，无整页横向溢出、控制台错误/警告0。上传采用压缩传输解决慢连接；准备脚本tarfile filter参数适配服务器旧Python后通过，均先于生产切换。

## 明确没做

未生产管理员登录、投稿、投票、改登记或付费审核；未做真机、全部作品交互或生产故障注入。管理默认值/候选及名称提示完整夹具验证沿用原功能归档，不称为本轮生产表单验收。没有私有数据包更新、前端作品副本提交、Nginx修改或另一前端发布。

## 遗留物

远程备份/root/aob-model-suggest-20261008/backup/保存platform.db、runtime.tar.gz和旧gallery。忽略证据与固定构建位于output/model-suggest-release-20261008/，截图output/playwright/model-release-*；保留其他会话文件和原备份。后台发布准备已随合并提交归档，最终上线结论由本记录覆盖。Gallery本轮仅更新HANDOFF及本归档，一条英文记录提交并推送。

## 下一步建议

无必需待办。根integration.json若后续开展更广的数据工具联调，再按独立任务核准更新对应数据源码pin。
