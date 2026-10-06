# 2026-10-06 · Xiaomi MiMo Harness 候选 · wsnxxxs

- 人员与范围：wsnxxxs；Codex 主代理，仅 Gallery，无子代理。用户要求加入两个 Harness 并提供生产服务器连接信息；依本轮用户指示提交一条英文提交，不推送。
- 目标与改动：共用 work-fields 候选补充 Xiaomi MiMo Desktop、Xiaomi MiMo Code，覆盖投稿、作者编辑、管理员审核和作品管理；PRODUCT 同步。
- 决策：沿用 Pi 的名称候选方式，未登记时发送 harnessOther；数据包登记后优先使用登记 ID，避免重复候选。不修改私有注册表、后端或数据库。
- 验证：npm run check 64文件0错误；npm test 29/29；npm run build 176作品/68site；CI=1 npm run check:intake 0错误/8既有提示。共用表单两个名称均产生准确 harnessOther，桌面及390手机目检，手机无横溢。夹具仅缺 favicon 404，无脚本错误；公网浏览器错误/警告0，实际发布模块生成两个候选，3个发布文件SHA一致，check:deployment通过（48题/28社区题）。未执行生产登录、投稿、审核保存、真机或全部交互验证。
- 发布：资产 d0bc1855fbc63a42cc8cf00c，3个静态文件差异；发布前后全目录SHA核对，data.json和生产API配置一致。初次构建采用API目录地址，与生产根地址写法不同，在切换前拦截并按生产配置重建。SSH管道传输缓慢，停止准备进程后改用scp，上传SHA通过才执行切换。
- 遗留物：忽略目录 output/playwright/xiaomi-mimo-20261006/ 保存脚本、清单、结果及截图；生产 /root/aob-xiaomi-mimo-20261006/gallery-backup 保留回退目录。凭据未写入文件或提交。无待定事项。
