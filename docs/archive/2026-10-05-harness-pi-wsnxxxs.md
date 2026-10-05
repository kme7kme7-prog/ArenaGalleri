# 2026-10-05 · Harness 单框输入与 Pi · wsnxxxs

- 人员与范围：wsnxxxs；Codex 主代理，仅 Gallery 前端，无子代理。用户授权提交、推送与部署。
- 目标与改动：共用 work-fields 使用候选输入框，加入 Pi，移除独立其他 Harness；登记名称映射原ID，自定义提交harnessOther，保留旧记录回填和空值校验；submit移除旧切换调用，PRODUCT同步。
- 决策：Pi尚未登记于私有注册表，候选沿用手填接口，不改数据包。按用户要求先提交推送再部署，提交时部署待执行。
- 验证：check63/0、test29/29、正式数据build176件/68site、严格intake0错/8既有提示；真实共用表单核对旧自定义回填、Pi、自定义、Codex ID、空值拒绝，桌面与390手机无横溢。未执行生产登录、投稿、审核保存或全量作品交互。
- 部署准备：资产目标465a5700a96f182a44bb06d1，52项前端哈希变动，data.json与线上一致。脚本核对旧站全目录哈希，复制后覆盖增量，再切换并核对全目录哈希。最终执行结果在忽略目录output/harness-pi-20261005/deploy-result.json。
- 遗留物：上述output目录保存夹具、增量、哈希清单与脚本。服务器/root/aob-harness-pi-20261005/gallery-backup保留旧站回退材料。凭据不写文件。无其他未提交文件。
