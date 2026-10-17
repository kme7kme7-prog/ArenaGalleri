# 2026-10-17 · 最新代码与VPS性能检查

- 范围与人员：按用户要求先获取最新代码，再检查盲评作品持续加载可修复、可优化的点。主代理独立执行，无子代理。用户提供的SSH认证仅用于登录，未写入文件、脚本、仓库或调查记录。
- 本轮修改仅为本交接与归档；未修改业务源码或生产服务配置，未commit、push、部署、重启或终止截图任务。

## 最新代码

四仓均完成`fetch origin --prune`并核对`HEAD...origin/main`为0/0。Gallery快进一条至`25ce716`，私有数据源码快进两条；后台`e0e3bc1`、另一前端`6f30e30`本来已是最新。Gallery两份本地调查归档完整保留；HANDOFF暂存恢复时发生的头部冲突已合并，新增上游登录交接与本地调查均保留，stash已清除。

新Gallery提交主要为登录界面、标识动画和验证码显示；最新代码仍有前轮确认的对局请求无截止时间、iframe load单一就绪条件及统计全量读取路径。仅获取最新源码未改变线上部署或激活数据包。

## 现场证据

服务器为4核。内存约4.9GB可用、无swap、根磁盘78%使用，采样未显示内存耗尽或磁盘满。两次逐秒vmstat显示CPU空闲约3%与1%，无明显I/O等待或steal。

- 第一组2秒进程采样：截图Chrome GPU进程约312% CPU，Node约78%；Chrome使用`swiftshader-webgl`软件渲染，是主Node的子进程。截图任务可暂时占据约三核。
- 稍后第二组2秒采样：同一GPU进程0%，Node约111.5%。这说明截图负载会变化，不能把第一组采样写成永久失控或唯一根因；Node自身开销也需优化。
- 独立截图服务inactive，主服务CPU配额为infinity。仓库现有`deploy/systemd/arenaofbias-capture.service`已包含独立用户、`CPUQuota=100%`和内存上限；现场没有通过`CAPTURE_ENDPOINT_FILE`采用此模式。
- 主服务保持active/running，MainPID与NRestarts=0前后相同；API和作品源均由此Node进程处理。

直接在VPS访问loopback、丢弃响应正文的少量样本：

| 请求 | HTTP | 总耗时（秒） |
| --- | --- | --- |
| API session | 200 | 3.605 |
| API catalog | 200 | 1.766 |
| API activity | 200 | 24.617 |
| 作品HTML | 200 | 1.976 |
| 作品CSS | 200 | 3.509 |

这些请求绕过公网传输与Nginx代理；统计与作品资源在Node侧也存在等待，不能只归因跨地区线路。样本不是长期分位数或压力测试。

## 隔离副本剖析

使用SQLite只读连接的backup API建立一致副本，数据库留在VPS root专用0700检查目录；没有下载业务数据库到本机。现场server/admin等代码另存私有副本；隔离进程使用复制数据库和新建数据目录，关闭截图与审核，只在loopback监听，并以nice19运行。读取正式不可变数据包，不修改它或原作品。V8 profiler仅连接隔离进程，没有打开生产调试端口。

| 隔离请求 | 总耗时 | realpathSync次数 / 累计耗时 | readFileSync次数 / 累计耗时 |
| --- | --- | --- | --- |
| activity | 4709 ms | 27337 / 1397 ms | 27512 / 426 ms |
| catalog冷构建 | 2168 ms | 16821 / 832 ms | 18349 / 293 ms |

还有同量级existsSync调用。CPU采样热点包括lstat、readFileUtf8、题目lookup/fromRow与SQLite查询。调用计数包含该请求时间窗内同一隔离进程的内部任务，计时包含仪器开销及调度等待；副本媒体目录为空，与真实部署的完整媒体投影有区别，不能直接换算生产优化收益。

现场代码与最新后台主线按内容比较、忽略CRLF后，仍有`app.mjs`、`library.mjs`、`questions.mjs`、`show1compat.mjs`四项真实差异，包括arena-only隔离和社区提示词版本等。catalog、catalog-response、arena、content与featured的相关逻辑一致。后续实施须保留这些现场功能，并处理主线归属，不能整仓覆盖生产。

## 可执行的优化顺序（尚未实施）

1. 将截图浏览器迁入已有独立worker方案并限制其CPU预算，验证排队、截图成功率和超时恢复。主服务与截图需要分别控制资源；此项改善截图运行时的竞争，不会自动消除Node自身重复计算。
2. 在同一次读取内复用不可变数据包快照和题目/配置查询结果，减少逐作品进入`catalog.refresh()`导致的realpath、源信息读取和JSON解析。跨await、换包和撤下时仍要保留现有修订复核，不能以全局永久缓存替代。
3. 减少重复作品投影：`library.eligible`已map(withDisplay)，其filter(isEligible)又执行withDisplay；现场visibleEffective及资格判断也重复取同题。可先在同步投影阶段复用，保持审核、身份、公开范围语义。
4. 合并并发的公共池统计计算，将私人权限、反应和审核字段单独处理。目录冷构建也需优化；若增加缓存，必须验证票数、撤下、外部写库、换包及管理员身份切换的失效行为。
5. 为对局抽取设置明确截止时间、离开取消和可重试错误；单侧资源等待应区分未加载与失败，并保留侧内重载。25秒提示不是恢复机制，也不能用固定时间或旧8秒probe兜底作为真实渲染成功依据。
6. 作品头部固定fold脚本可考虑保持现有执行时机的内联注入，减少一次阻塞请求；若改defer则需另验控制区隐藏时机，避免改变盲评呈现。缓存优化需保留令牌隔离和实时访问门禁。

## 验证与遗留物

- 最新Gallery：check78文件/0错误，test51/51。
- 最新后台：check124文件/0错误。Mac默认临时目录首次test355/357，两个失败涉及`/var`与`/private/var`规范路径；设置`TMPDIR=/private/tmp`完整重跑357/357，没有为此修改测试或源码。
- 未build/intake或线上Linux全套单测：无业务源码、数据包消费配置或发布候选变更；本轮为检查，测试不代表已经修复性能。
- VPS检查目录`/root/aob-timeout-inspect-6kxhv6wn/`保存一致DB副本、现场源码、隔离profile与结果；无常驻隔离服务。生成物包含业务数据，维持root私有访问，不纳入公开仓库。
- 本机忽略目录`output/arena-timeout-investigation-20261017/server/`保存现场源码副本、差异清单和脱敏摘要。不含SSH密码、业务数据库或服务密钥。其他三仓工作区干净，Gallery只有本轮及前轮调查文档未提交。
