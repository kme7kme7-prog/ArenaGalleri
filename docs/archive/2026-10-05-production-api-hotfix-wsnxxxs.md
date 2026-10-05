# 2026-10-05 · 恢复生产 API 配置与社区题库 · wsnxxxs

- 负责人：wsnxxxs；执行 AI：Codex。范围为 Gallery 生产配置、发布验收工具与交接文档。用户要求立即修复上一轮发布后题目消失，沿用提交推送及部署授权。

## 根因与修复

- 上轮构建未设置生产 `API_BASE_URL`，把生产绝对地址覆盖成源码默认 `api/`；Gallery 主机的 `/api/bootstrap` 返回404，前端静态回退只展示正式包20题，漏掉19道社区题与后台投稿作品。后端实际返回39道公开题，题目和作品数据没有被删除。
- 主代理上轮验收只检查独立API并把20题误判为完整上线，本轮明确更正此结论。先从上一轮旧站备份恢复生产 runtime-config，再以 `API_BASE_URL=https://api.arenaofbias.icu/api/` 重建发布版本 `a021f7b3a179302e1878f1b8`，更新 index/version 让缓存识别新版本；默认作品数降序保留。
- 新增 `npm run check:deployment -- <Gallery URL> <expected API directory URL>`：读取公网实际 runtime 配置，验证明确生产地址、配置API的bootstrap、CORS、目录兼容性和题目覆盖；ARCHITECTURE补生产构建及逐题ID验收。没有更改浏览器静态回退行为。

## 验证

- check64/0、test29/29；生产地址build176件/68site、严格intake0错/8既有提示。
- 新部署检查通过：实际API地址为生产API、公开39题、社区19题、后台返回487件作品。浏览器全部题库展示486件（原有存疑计数规则），39个题目ID与bootstrap逐项一致，missing/extra均空，作品数降序通过。
- 1280桌面与390手机完整题库目检、无横溢、脚本错误0；源码现有缓存测试覆盖runtime改变会生成新版本。未增加重复单元测试。
- 本轮只切换静态Gallery，catalog字节不变，未改后端、数据库或数据包。新配置及资产版本已公网核对。

## 决策与遗留

- 相对api配置仍供本地同源联调；生产明确指定API地址并核对浏览器全部公开题ID，不把静态回退当成功部署。
- 忽略目录 `output/api-config-hotfix-20261005/` 保存清单、脚本、结果及截图；服务器 `/root/aob-api-config-hotfix-20261005/gallery-backup` 为本轮静态切换备份，上一轮完整回退材料保留。凭据未写入文件。
- 未进行生产登录、邮件、投稿、审核、有效投票或全量作品交互验证。没有删除题目或修改题目公开状态。
