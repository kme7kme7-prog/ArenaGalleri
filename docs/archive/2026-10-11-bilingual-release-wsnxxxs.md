# 2026-10-11 · 中英文界面发布 · wsnxxxs

- 负责人：wsnxxxs；执行 AI：Codex 主代理与 GPT-6.1 Sol / medium 平台代理。
- 范围：Gallery 前端发布及本轮发现的语言适配修正。用户明确授权推送与部署；仅使用提供的凭据进行 SSH 认证，未将凭据写入文件、Git 或发布包。

## 本轮目标

推送中英文功能并部署到现有生产 Gallery，核对完整目录、真实运行配置与公网中英文页面。

## 改动与决策

- 开始与收尾 fetch 确认 main 同步远端；功能提交3ac719d正常推送。生产前端从253d5e198065a92544e315c2更新至最终79b9b1bd64cf51af941ecb95。
- 消费当前生产目录作为逐文件基线，保留实际runtime-config.js、data.json和全部作品媒体；候选使用已提交功能源码及本轮两处修正，沿用仓库cache-bust工具生成完整模块版本、importmap与CSP。字节一致或仅换行不同的无关源码保留生产版本，不重建作品包。
- 真实登录弹窗发现Turnstile未跟随手动语言选择：site/turnstile.js显式传en/zh-CN，在localechange时仅重建验证组件，保留表单。解绑生命周期监听，旧回调与已排队过期重置不能恢复旧token；扩展既有测试验证此行为。实现依据Cloudflare[语言配置](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/)、[支持语言](https://developers.cloudflare.com/turnstile/reference/supported-languages/)与[组件生命周期](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/)文档。
- 真实综合榜完整加载后发现“写作第… · 三维第…”组合字符串遗漏：site/leaderboard.js将各项独立为data-board-standing，复用既有精确词条，任意分类组合均可回切；模型及厂商名称继续保留原文。
- 初次上线29项静态变化，最终修正版仅再替换leaderboard.js、turnstile.js、index.html和version.json。相对发布前总计30项变化、完整2358文件；2328原文件逐SHA保持，5个新语言模块新增。本轮修正和发布记录随本归档所在的一条英文提交收尾。
- 保留当前较新的后台260ae05c+base.3629a9ed，不部署另一仓源码。后台运行文件、版本、MainPID=886410、active/running/NRestarts0保持；Nginx active，未重启任何服务。

## 验证

- 最终npm run check：75文件、0错误；npm test：43/43。
- 最终npm run build：176件作品、75个site文件；CI=1 npm run check:intake：0错误、8项既有提示。标准本地构建与生产候选运行配置不同，资产哈希分别生成。
- 服务器安装前后完整Gallery文件集合与SHA门禁通过；后台55运行文件与版本保持，最终复核记录galleryManifest/backendUnchanged均true。保留原生产目录的配置及数据摘要。
- 公网32个文件逐SHA核验（30项发布文件加data/runtime-config）、无查询参数首页、5个新增模块版本映射、全部inline CSP摘要通过。
- npm run check:deployment通过：实际API配置正确，Gallery Origin CORS、公开目录69题/49社区题/1321件公开DTO、数据包兼容、ETag重验证304、匿名session200/no-store均通过。业务目录可继续随真实投稿变化，不将这些数量作为固定门禁。
- 公共16路由×桌面1440/手机390扫描：等真实榜单完成加载及各页面标题就绪后，无可视UI中文残留、横向溢出、pageerror或业务POST；中文回切保持题目数，刷新记住en。作品标题、提示词及模型名字按原文保留。
- 真实登录弹窗2宽×EN→ZH→EN共6状态：Cloudflare iframe语言参数和界面同步，弹窗及用户名/密码输入节点和值保持，无文档或弹窗横溢、pageerror及业务POST。目视英语Success!/Privacy/Help、中文成功/隐私/帮助与表单中英文通过。
- 公共页保留既有allowfullscreen优先级提示；登录过程Cloudflare自身输出GPU/字体及内部调试信息，Gallery来源控制台错误0。这些信息已保留在忽略证据中，未称所有第三方控制台静默。
- 浏览器复查采用完整刷新，避免仅切hash仍使用上次发布的旧模块实例；等待榜单aria-busy移除并出现排名节点，避免扫描加载占位而漏掉实际数据。

## 明确没做

未修改私有数据仓、真实本地配置、作品资源、后台源码/数据库或Nginx配置。未执行生产登录提交、注册、邮件发送、上传或投票；未重复后台全套测试，因为后台未变。此前本地模拟接口覆盖账户审核及投稿流程，不等同全部生产交互验证。

## 遗留物

- 服务器/root/gallery-i18n-release-20261011/backup保留发布前静态文件；revision-backup保留补齐前四个文件，支持逐项回滚。
- 忽略证据output/i18n-release-20261011/保存候选、完整manifest、公网摘要、安装回执与浏览器结果；截图位于output/playwright/i18n-release-20261011/。SSH传输中断后改用系统OpenSSH完成传输，校验后才安装；连接已关闭。
- 本轮无待确认决策。后续功能增加UI文字时继续维护明确语言目录和原文隔离规则。
