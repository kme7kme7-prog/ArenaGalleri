# 2026-10-07 · OMP Harness 候选 · wsnxxxs

- 人员与范围：wsnxxxs；Codex 主代理，无子代理。仅 Gallery 共用作品表单、PRODUCT、HANDOFF 与本轮归档；用户授权一条英文提交和指定服务器部署，不推送。
- 本轮目标与改动：统一 OMP 显示名称，完整记录可选 Harness。搜索 git 跟踪的 site/、docs/、scripts/、test/、HANDOFF，没有待替换的旧名称；只增加 OMP 回退候选及产品说明。本轮四文件统一提交。
- 决策：登记名称优先，现有名称过滤避免重复；未登记时候选发送 harnessOther=OMP，登记时发送 harnessId=omp。登记 ID 保留小写，Pi 与 OMP 独立。未修改数据包、私有注册表、其他仓库、后端、数据库或本地忽略配置。
- 验证：npm run check 64文件0错误；npm test 29/29；采用生产根API地址的 npm run build 176作品/68site；CI=1 npm run check:intake 0错误/8既有提示。构建数据内 OMP 已登记且无作品使用；构建产物实际 uploadFlow 投稿表单的本地夹具恢复合成草稿、确认试加载、填写并捕获提交，登记和内存中删除登记两场景均只有一个 OMP，分别发送 harnessId=omp / harnessOther=OMP；Pi 独立保留。1280桌面与390手机截图目检、宽度检查无横溢。无脚本错误，夹具2条iframe浏览器提示（allow/allowfullscreen、同源sandbox）。没有持久修改数据包或发送生产投稿。
- 发布与公网验证：沿用已配置的SSH部署密钥连接用户指定IP与root账户，凭据不落盘。资产 0f44e6373582a250b59d1936，差异仅 work-fields.js、index.html、version.json；上传逐文件SHA、切换前后完整目录SHA及准确文件集合通过，data.json与runtime-config.js字节一致。公网3文件SHA通过，check:deployment通过（49题/29社区题）；生产浏览器首页加载错误/警告0，线上模块与公开数据生成登记/回退候选及提交字段再次核对通过。
- 明确没做：生产登录、真实投稿或审核保存、真机与全部交互验证；未改后端、私有数据、生产数据库，未推送。构建及上述验证不代表全部交互通过。
- 遗留物：忽略目录 output/playwright/omp-20261007/ 保存表单夹具、截图、发布清单及结果；生产 /root/aob-omp-20261007/gallery-backup 保留回退副本。无待定事项。
