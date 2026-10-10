# 2026-10-11 · GLM 5.3 Flash X 上线 · wsnxxxs

- 负责人：wsnxxxs；执行 AI：Codex。范围为私有模型登记、Gallery消费目录、现有服务器投稿归属及本轮交接。

## 目标、改动与决策

用户要求新增 GLM 5.3 Flash X 可选模型，并更正已有同类自填名投稿，提供服务器用于执行。正式ID glm-5.3-flash-x，品牌Z.ai，aliases兼容 glm-5-3-flash-x 和 GLM 5.3 FlashX。展示模型131→132；不填未确认的价格、上下文或权重等参数，旧 GLM 5.3/Flash ID与作品保持。

生产3件通过当前 library.setMeta、现有管理员身份明确登记：little-red-riding-hood/up-imkun6wp、q-5ebd7c84dff7cd8f/up-l1uqw5tv、q-48c3b43eeb284f6d/up-oj8lodzg。前两件verified、后一件unverified；全部保持Max、标题、内容、来源和其他字段。仅登记字段与updated_at变化，新增3条meta审计，重复0修改/0审计。现行后台同作品、同内容摘要实时解析历史身份，无原始票或correction改写。

最终正式包来自固定干净源码和逐文件已验证的生产资源缓存：2288文件与发布Git blob/最终安装SHA一致，2287资源文件与旧生产字节相同。Gallery完整2353文件仅生成data.json变化；线上较新代码、runtime-config.js、index.html、version.json和媒体均保持。后台只更新消费pin/包链接，无运行模块或schema变化，版本7c5ce104保持。各涉及仓一条英文提交，源码main不推送；私有数据包按既有工具发布。

## 验证

- 数据check33/0、test9/9、完整build:data176件/20题、严格intake0错/8既有提示。Gallery check68/0、test33/33、最终生产API配置build176件/70site，严格intake0错/8既有提示。后台Windows check115/0、test332/332；无后台源码变化，未重跑Linux全量。
- 最终包的新一致副本首次3登记/3审计，重跑0/0；正式最新停服一致备份首次3/3、重跑0/0。9569条原票逐字段保持，1080作品除3件登记字段与updated_at外逐字段保持，其他业务表及已有审计保持。模型榜9079有效比较/242参与者/66模型前后相同；Flash X正式行10比较/2公开已验证作品。v41、integrity ok、外键0。
- 公网check:deployment包兼容和CORS通过（63题/43社区题/954公开作品，统计随用户行为变化），public data.json SHA与最终本地构建一致；两公开作品正式ID/名称/Max及榜单正式键通过，旧x:键消失。最终远程全包2288 SHA、2287原资源字节、Gallery完整文件集/非目标SHA、3件状态复核通过。服务active/running/NRestarts0/ExecMainStatus0。
- 共用表单真实浏览器夹具：glm53flashx匹配唯一Flash X，选择后readWorkFields提交正式modelId，厂商栏隐藏；1280与390宽目視无横溢。旧夹具缺harnessOf的脚本错误已修正，最终夹具仅favicon404。公网榜单同两宽目视，品牌标识和已登记状态正确，无横溢、控制台0错误/0警告。搜索包含旧Flash的近似结果沿用既有匹配行为，不把它并入Flash X。
- 初始本地缓存与生产存在换行差异，门禁阻止该候选上线；最终候选逐文件匹配全部旧生产资源后发布。首次切换脚本错误替换DATAPACK_COMMIT变量名，初次运行仍旧链接；复验发现后明确原子切换至正确已验证新包，重新通过公网部署检查和全部最终SHA。初次安装阶段日志22.168秒包含检查，不作为精确停服时长或一次切换成功保证。

## 明确没做

未修改作品源码、首屏/手机截图、后台运行代码、私有原始投票、核验状态或另一前端；未生产登录、提交新作品、投票、付费审核、全交互、真机或跨浏览器验收。

## 遗留物

备份/root/aob-glm-flash-x-20261011/backup/before-registration.db、原包及旧Gallery data.json备份保留。未激活候选、放弃的整包传输与最终包证据保留在本轮忽略运维目录，不作差异清理。Gallery公开源码只记录消费结果，不加入私有仓地址、数据版本历史或凭据。本地output/glm-flash-x-20261011/及output/playwright/glm-flash-x-*为忽略验证证据；本轮临时表单与浏览器会话收工关闭。

## 下一步

无本轮必需待办。源码main仅在后续明确授权时推送。
