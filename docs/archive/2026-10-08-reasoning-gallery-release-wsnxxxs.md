# 2026-10-08 · 推理 Gallery 发布 · wsnxxxs

- 负责人：wsnxxxs｜执行 AI：Codex
- 范围：推送既有 Gallery 提交并部署静态站；不部署后端、不迁移数据。

## 本轮目标

用户授权推送并部署 Gallery。后端 add9352 和两道题的推理类别迁移已完成，Gallery 接续发布。

## 改动

- 发布既有提交 7fd682b（推理类别、AI 评分预留），无新增功能修改。目标资产 f2ba61934a98214672db0099，原线上资产46e0b821de041e68103608a0。
- 固定提交隔离构建使用既有已验证数据包及生产 API 根地址，原本地配置保持；完整目录2351文件，25个前端文件变化，其中8个只有换行差异。data.json 和 runtime-config.js 与生产逐字节一致。
- HANDOFF 和本归档为本轮发布记录（未提交）。

## 决策

先核对上传 SHA 和完整暂存目录，再备份并切换 Gallery。保留旧站以便恢复，不停后端服务；本轮不操作数据库或 Gallery 投稿接口。

## 验证

- 固定提交 npm run check：64文件，0错误；npm test：29/29。
- 生产 API 构建：176件作品、68个site；CI=1 npm run check:intake：0错误、8条既有提示。
- 当前后端固定提交真实 HTTP 临时库 npm run test:integration：通过。
- 发布前生产版本及两个推理题的类别、盲评池排除已只读核对。推送、暂存演练、切换、公网 check:deployment 和桌面/手机浏览器核对尚待执行，完成后追加结果。
- 未执行生产登录、投稿、发起题目或有效投票；避免为发布验收写入业务数据。真实 aiScore 尚未接入，本轮无法验证真实评分显示。

## 明确没做

不部署后端、不迁移两道题、不更新数据包；不提交私有数据来源、版本历史或凭据。

## 遗留物

忽略证据和构建：output/playwright/reasoning-release-20261008/。本轮文档未提交；旧站备份与上线结果待追加。

## 发布结果追加（2026-10-08 02:55 AEST）

- GitHub 拒绝4次推送，均为 Internal Server Error：普通 HTTPS 两次、HTTP/1.1 加完整包一次、GitHub CLI 已登录凭据一次。仓库未归档、未禁用，当前 GitHub CLI 账号具有 push 权限；远端 main 仍为1d88a8a，目标7fd682b未到远端。首次请求ID20B6:1DC323:238738:2F8FFC:6AC67941，最后请求ID20FF:391C18:23CAC4:2FDF23:6AC67987。
- SSH备用传输因主机密钥未验证未建立；未绕过主机密钥检查。本轮无法修复 GitHub 服务端错误，停止发布。
- 未上传或切换服务器文件、未停服、未创建新生产备份。线上 Gallery 仍是资产46e0b821de041e68103608a0；后端active/running，NRestarts0。
- 未执行服务器暂存演练、部署后 check:deployment、新版公网 SHA 或桌面/手机目检。固定提交检查、构建、intake 与真实本地联调通过不代表新版已上线。
- 本轮 HANDOFF 与本发布归档仍未提交；保留构建材料供重新推送通过后接续。正文中的待执行状态由本追加结果说明。

## 按用户要求重试结果（2026-10-08 02:58 AEST）

用户要求使用 `git push -v`：成功后部署并验收，仍失败则不部署、不更换远端或认证方式，把完整错误写入归档后停止。

执行原 origin 的 `git push -v origin main`，原认证不变。以下为完整标准输出及错误输出，退出码1：

```text
Pushing to https://github.com/wsnxxxs/ArenaGalleri.git
POST git-receive-pack (6498 bytes)
remote: Internal Server Error
remote: Request ID 1740:19A653:243634:307079:6AC67A1C
remote: Time 2026-10-07T16:58:05Z
To https://github.com/wsnxxxs/ArenaGalleri.git
 ! [remote rejected] main -> main (Internal Server Error)
error: failed to push some refs to 'https://github.com/wsnxxxs/ArenaGalleri.git'
```

- `git ls-remote origin refs/heads/main` 回查仍为1d88a8ae3deb18f16aa57feeb2c7baf0aa684b30，目标7fd682b未推送成功。
- 完整输出另外保存在忽略证据 output/playwright/reasoning-release-20261008/push-retry-verbose.log。未切换远端或认证方式，未再尝试其他推送途径。
- 按失败分支停止。本次未连接部署服务器、未部署或停服，未执行新版公网9文件SHA、check:deployment或桌面/手机页面验收；现有准备材料保持。
- 本次仅更新 HANDOFF 和发布归档，未提交。成功分支要求的英文发布记录提交尚未执行。

## 临时分支隔离测试（2026-10-08 03:00 AEST）

按用户要求执行 `git push -v origin 7fd682b:refs/heads/release/reasoning-gallery`，仍使用原 origin 和原认证。完整输出如下，退出码1：

```text
Pushing to https://github.com/wsnxxxs/ArenaGalleri.git
POST git-receive-pack (6519 bytes)
remote: Internal Server Error
remote: Request ID 0F4F:1DC323:241A5E:305EB8:6AC67A92
remote: Time 2026-10-07T17:00:03Z
To https://github.com/wsnxxxs/ArenaGalleri.git
 ! [remote rejected] 7fd682b -> release/reasoning-gallery (Internal Server Error)
error: failed to push some refs to 'https://github.com/wsnxxxs/ArenaGalleri.git'
```

- 完整输出同时保存在忽略证据 output/playwright/reasoning-release-20261008/push-isolated-branch.log。
- ls-remote 回查 main 仍为1d88a8ae3deb18f16aa57feeb2c7baf0aa684b30，release/reasoning-gallery 不存在。新分支与 main 推送均失败，此测试不能将故障限定为 main 引用。
- 按用户指定的失败分支停止。未创建PR或尝试合并、未部署、未连接部署服务器、未修改 secret scanning 或任何安全设置。
- 本次只追加 HANDOFF 与归档，未提交。新版公网9文件SHA、check:deployment及桌面/手机验收仍未执行。

## 旧提交引用更新探测（2026-10-08 03:01 AEST）

执行用户指定的 `git push -v origin 1d88a8a:refs/heads/probe/ref-update` 成功（退出码0），随后立即执行 `git push origin --delete probe/ref-update`，删除成功（退出码0）。按用户指定的诊断口径记录：「仓库可以更新分支，故障跟 7fd682b 的内容有关」。本次证明已在远端的旧提交可新建/删除分支；7fd682b所需的新对象及具体触发原因尚未定位。

完整推送输出：

```text
Pushing to https://github.com/wsnxxxs/ArenaGalleri.git
POST git-receive-pack (241 bytes)
remote:
remote: Create a pull request for 'probe/ref-update' on GitHub by visiting:
remote:      https://github.com/wsnxxxs/ArenaGalleri/pull/new/probe/ref-update
remote:
To https://github.com/wsnxxxs/ArenaGalleri.git
 * [new branch]      1d88a8a -> probe/ref-update
updating local tracking ref 'refs/remotes/origin/probe/ref-update'
```

完整删除输出：

```text
To https://github.com/wsnxxxs/ArenaGalleri.git
 - [deleted]         probe/ref-update
```

- 请求ID：成功推送及删除的命令输出均未提供 Request ID，无法记录具体值。以上保留完整输出，不填入其他请求的ID。
- ls-remote 确认 probe/ref-update 不存在，main仍为1d88a8ae3deb18f16aa57feeb2c7baf0aa684b30。未创建PR、未部署、未修改安全设置，本轮记录未提交。
- 原始日志保存在忽略证据 output/playwright/reasoning-release-20261008/push-probe-ref-update.log 与 delete-probe-ref-update.log。无业务源码修改，未重跑构建或测试。

## 最终发布结果（2026-10-08 03:24:26 AEST上线确认）

- 用户确认其他会话已推送7fd682b，并授权完成Gallery部署、验收、更新两份记录后以一条英文提交推送。开始通过ls-remote复核main确为7fd682b582c92cab19c2f40f24fb687131a42669；本轮没有重新修改或提交功能源码，也没有操作游戏PR。
- 复用同一固定提交隔离构建和既有已验证数据包。check64/0、test29/29、生产API build176件/68site、严格intake0错/8既有提示、固定当前后端真实HTTP临时库integration通过。本轮记录提交前复跑check/test。
- 服务器Python3.11使用不带filter参数的tarfile，经普通文件、精确成员集合及解包路径检查后，先在独立目录完整演练。上传包SHA、2351文件暂存清单及SHA、切换前生产未变核对均通过。
- 03:24:22.104 AEST开始目录切换，03:24:26.218确认公网版本；两次rename间约0.125ms。Gallery资产从46e0b821de041e68103608a0变为f2ba61934a98214672db0099，完整上线目录2351文件SHA匹配目标。仅25个前端文件变化，其中8个仅换行；data.json和生产runtime-config.js逐字节保持。旧站备份/root/aob-reasoning-gallery-release-20261008/gallery-backup已保留。
- 后端全程active/running、NRestarts0，版本仍为add9352。切换前后bootstrap有效比较6410→6410、参与者166→166，55题。本轮不改数据库，不删除任何票；后端计分与两道推理题迁移已在前一轮生效。

### 公网与页面验收

- 指定9项（app.js、arena.js、categories.js、leaderboard.js、platform.js、studio.css、ui.js、index.html、version.json）SHA全部匹配；另外16个发布文件以及未改动的data.json/runtime-config.js同时通过，共27项。
- `npm run check:deployment -- https://gallery.arenaofbias.icu/ https://api.arenaofbias.icu/api/` 通过：生产API/CORS/兼容和数据包一致，55题、35社区题、761作品、后端版本一致。
- Playwright Chrome 1280×900桌面及390×844手机：题库、盲评大厅、综合榜、写作榜、奥赛题页截图已目检，DOM核对无整页横向溢出，浏览器错误0/警告0。另核对桌面推理筛选与BLUE页，以及奥赛直达盲评链接返回大厅。
- 题库全部55题，分类计数写作12/推理2/设计7/三维34。页面作品计数760，沿用排除存疑作品的规则，API返回761。盲评可开始50题，分类写作9/设计7/三维34，不含推理；综合榜范围53题且无推理类别/目标题目选项，123配置；写作榜525比较、79参与者、73配置。
- 奥赛显示7份作品，BLUE显示1份作品；均显示AI评分暂未开放及各卡AI评分待开放，无对应盲评入口或单题榜面板。真实aiScore尚未接入，未伪造分数作生产验收。初次DOM检查用带中点的连续文本寻找AI评分通知，没有匹配页面的分行显示；改按实际文本分行核对后通过，产品未改。
- 本次不重跑后端五项门禁、数据库integrity/外键检查（没有部署后端或操作数据库）；未做生产登录、发起推理题、投稿、审核、有效投票、真实手机或全部作品交互测试。

### 遗留与交付

- 奥赛封面仍沿用既有「本题封面作品 · 盲评票数足够后改由票选决定」说明，本轮仅部署既定提交，未改这处文案。后端实际排除推理计分及票选代表作；此UI文案需另轮处理，不作为已完成的修复。
- 证据、原始失败输出、暂存/切换日志、公网SHA、DOM记录及桌面/手机截图保存在忽略目录output/playwright/reasoning-release-20261008/。未无差别清理生成物、其他会话文件或旧备份。
- 本轮提交仅HANDOFF和本发布归档，使用wsnxxxs及GitHub noreply邮箱、一条英文简单句，并推送main。此前正文的待推送、待部署和未完成验收描述均由本最终结果覆盖。

### 勘误（2026-10-08）

旧提交探测记录中按用户指定口径写下的「故障跟7fd682b的内容有关」并未定位具体内容问题。现在同一7fd682b未经重写已成功到达远端，不能将当时的500断言为该提交内容有错；保留各次请求ID与完整输出供追溯，未修改任何仓库安全设置。
