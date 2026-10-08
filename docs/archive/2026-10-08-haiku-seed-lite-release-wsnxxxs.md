# 2026-10-08 · Haiku 5.5 与 Seed 2.1 Lite 上线 · wsnxxxs

- 负责人：wsnxxxs；执行 AI：Codex。Gallery 只消费私有注册表新包，未合并其他前端、后端或数据源码。

## 本轮目标

用户要求加入 Claude 新模型，并收录已有 Seed 2.1 Lite 结果，提供服务器用于上线。

## 改动与决策

- Anthropic 官方 https://www.anthropic.com/claude-haiku-5-5 确认2026-10-07发布 Claude Haiku 5.5；私有注册表新增 claude-haiku-5.5，并兼容 claude-haiku-5-5。同时新增 seed-2.1-lite / Seed 2.1 Lite / ByteDance Seed，兼容 Doubao 写法；两项复用原品牌标识，模型可选数129→131，不猜测未核实规格。
- 当前公开数据找到3件已审核的自填名作品：q-5ebd7c84dff7cd8f/up-prgb60ul（小豆包大橘子）、mechanical-keyboard/up-9enb5wdt（Aether65）、q-f3b352aeefe4f218/up-5ccj42u5（朱漆退散）。通过当前服务器的 library.setMeta 登记为 seed-2.1-lite，不直接写数据库字段；保留 High、工具、来源、内容、ID和其他元数据。
- 现行后端按同ID、同内容摘要实时归属历史票，无需改写原始票或 correction；3条 meta 审计，不重复登记。副本与正式停服一致备份验证总票、原始行及非目标表不变后切换。
- 新正式私有数据包已发布，Gallery本地忽略pin、后端消费pin及服务器更新。完整 Windows 构建通过但有无关生成差异；正式包从固定源码导出并复用已验证线上作品构建缓存，由现有 assemble 生成目录。作品及提取页面全量哈希不变；8个包文本文件仅换行。先前已批准、已生产覆盖的 Gemini High 源登记随正常出包进入目录。
- Gallery 无功能源码变更。发布26文件，其中23仅换行，另3为公开目录、入口版本和版本标记；asset f3a63a96af6508dad4726f16，生产API配置不变。源码main不推送，各涉及仓仅本轮英文简单句提交；正式数据包产物另由现有发布工具发布。

## 验证

- Gallery：check64文件/0错误、test29/29、生产API build176作品/68site、CI严格intake0错误/8既有提示。
- 数据：check33/0、test9/9、严格intake176件/0错误/8既有提示、完整build:data176件/20题；复用缓存正式目录由现有assemble重新生成，sourceDirty=false，产物Git archive与发布delta全树哈希相同。
- 后端：check109/0、test324/324；无后端功能源码变动。初始未提交HANDOFF和两份旧归档未编辑、未暂存。
- 副本首次3修改/3审计，重跑0/0。正式最新备份首次3修改/3审计，模型榜有效比较6356→6356、参与者169→169；6761条原票逐字段保持，889作品除3件登记字段和updated_at之外逐字段保持，其他业务表保持；已有审计保持。重跑0修改/0审计；schema v40、integrity ok、外键0。
- 全包目标SHA、Gallery暂存及线上2351文件SHA、精确文件集、公网26更新文件SHA通过；服务active/running、ExecMainStatus0、NRestarts0。
- 公网check:deployment通过：55题/35社区题/760作品。公开模型列表包含两个新模型，3件作品model=seed-2.1-lite / High；配置榜Seed行5比较/3作品，未收录提示消失。公网综合配置榜此时6470比较/169参与者/123配置。
- 实际共用作品表单夹具：两个选项各唯一一项，选择后readWorkFields输出正式modelId，自填厂商隐藏；桌面及390手机截图目检，手机无横溢。夹具仅favicon404，没有脚本错误。公网榜单1280桌面/390手机目检，无横溢，浏览器错误/警告0。

## 明确没做

未生产登录、发起题目、投稿保存或新增投票；未全交互、真机、跨浏览器验收。未改作品源码、复制私有作品到前端、部署后端功能源码、调整其他模型或推送源码main。

## 遗留物

- 服务器备份/root/aob-model-registration-20261008/backup/before-registration.db、gallery-backup和原包保留，可回退。
- 忽略运维证据output/model-registration-20261008/、浏览器证据output/playwright/model-registration-20261008/；源码导出、候选包、未用完的上传及导出链接保留在本轮忽略目录。自动审批拒绝删除本轮导出链接，已通过新目录完成构建，没有重试删除或动正式数据目录。
- 本轮临时表单预览与浏览器会话收工关闭，其他会话不动。后端已有他人未提交文档继续保留。

## 下一步建议

无本轮必需待办；源码main可在下一轮明确授权后统一推送。
