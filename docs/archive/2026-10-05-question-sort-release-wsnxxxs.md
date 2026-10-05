# 2026-10-05 · 题库默认排序与联合发布 · wsnxxxs

- 负责人：wsnxxxs；执行 AI：主代理与三个 GPT-6.1 Sol / medium 子任务，分别负责 Gallery 排序、后端、游戏与数据复核。用户授权提交、适用合并推送、联调与部署。

## 本轮目标与改动

- Gallery `site/app.js` 默认题库排序由 date 改为 works，数量多的在前；既有有效排序偏好仍保留。数量并列沿用逆目录顺序，存疑作品沿用原计数规则；PRODUCT 同步。既有作品管理提交 `0615641` 随本轮推送发布。
- 后端管理 UI 既有 `ec6af47` 随本轮推送发布；后端最终 `2d073149e6b27788f8ddbc78e0d7ecae0ef8d0e1`。固定 Git 归档源码与生产逐文件比对，仅 admin/admin.js 和版本标记需要替换，没有新迁移。
- 游戏最终 `e9bcb7ed486378576560e6ca4772c30dee14503a`（origin/fork 一致），数据最终 `b325758948f694d553d3e60b0293c51081c0d62c`（origin 一致）；两仓只补本轮复核归档，业务源码与正式包不变，无需重发游戏或数据包。

## 决策与远端

- 四仓 fetch 后检查本地及远端分支，现有功能分支全部包含于 main，无新增合并；独立 datapack 产物分支、旧 worktree 与既有文件保留。公开 CI 不读取私有数据。
- 使用负责人现有 GitHub noreply 身份，每仓本轮一条简单英文提交；不改公开占位配置，不记录凭据。
- 2026-10-05 21:49 AEST 已完成线上切换，Gallery 资产 `a84b499a08d45f89c07a8a0e`、后端 `2d073149`。数据库停服一致备份后，切换前后21张表原列原行摘要一致；v40、integrity ok、外键0。服务 active/running，ExecMainStatus0、NRestarts0；全站文件SHA与目标一致，catalog字节不变。
- 首次暂存解包因服务器旧 Python 不支持 filter 参数失败，发生在停服之前；兼容调整后成功，不影响生产。发布脚本仅存忽略的 output 中。

## 验证

- Gallery check63/0、test29/29、build176件/68 site、CI=1 intake0错/8既有提示；使用当前真实后端和正式包运行 integration smoke 通过。
- 后端 check108/0、test317/317，[公开 CI 成功](https://github.com/kme7kme7-prog/arenaofbias-server/actions/runs/37304858091)。作品移动、历史票归属更正回归通过。
- 游戏 lint、typecheck、build:check，社区题号3项、loading、投票分布与 work-ready16项通过；数据 check33/0、test9/9、intake0错/8既有提示、build176件/20题通过。正式包2288文件SHA及远端Git blob逐项一致，不产生新包。
- 真实临时库浏览器：默认works且20题数量降序、改为date后刷新保持；管理弹窗把临时投稿从中国建筑移到滕王阁并保存，列表归属更新，Pi自定义Harness随保存通过。桌面及390手机无横溢、脚本错误0。
- 公网17项全部通过：API与Gallery版本、CORS、catalog一致、6个变动资产SHA、匿名管理拒绝、私有配置404、游戏首页与提示词API。生产浏览器默认works，20题计数顺序41/31/21/20/12/11/8/6/3/3/3/3/2/2/2/2/2/2/2/0，桌面1280与390手机截图已目检，无横溢、脚本错误0。

## 明确没做与遗留物

- 没有生产登录、邮件、投稿、审核、移动真实作品、新增有效投票或全量作品交互验证；未安装SSH/systemd/nginx候选安全模板，不修改游戏或正式包。
- 回退材料：服务器 `/root/aob-sort-release-20261005/backup/`，包含旧Gallery、旧后端运行文件和停服数据库备份；忽略的 `output/sort-release-20261005/` 保存发布清单、脚本、结果和截图。未清理其他会话文件或旧工作树。
- Gallery 本轮归档与源码统一提交推送；最终提交号与CI结果以 Git main 与根目录 HANDOFF 及工具结果为准。
