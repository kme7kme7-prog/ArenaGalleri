# 2026-10-11 · 题库连接页调查 · wsnxxxs

- 负责人：wsnxxxs。父 agent 进行线上只读采样；两名 GPT-6.1 Sol / high 子 agent 分别调查远端前端历史与后端聚合逻辑。
- 范围：定位用户截图的频繁连接页并提出方案；未实施运行代码修复、推送或部署。

## 结论与证据

远端 `3cfdac1` 为防止 API 暂时失败后回退到旧数据包目录，增加 catalogState 门禁。这解决了目录不完整，却让题库首次展示依赖完整 bootstrap。加载状态本身不代表请求失败。

- 本地 main 为 `1aa8b67`；fetch 后 origin/main 为 `0fb51c6`。生产包含远端门禁与本地署名等改动，不等于任一完整分支。
- 已下载公网 app.js/platform.js，确认 app.js:1678 在目录未就绪时清 DATA.tasks，1766 在题库渲染前进入 platformOffline，1519 起生成截图中的文案。platform.js:47 每次 bootstrap no-store，15秒超时。
- 远端 `d8ad4c1`/`0fb51c6` 只提前显示首页及 hero 插图，题库门禁仍保留。顶栏账号也等待同一 bootstrap。
- 已成功初始化的同一文档，普通网络刷新失败保留 available 和目录；缺口主要在整页刷新/新开页没有可复用的最新公开目录。现有 remembered 仅为内存缓存。

2026-10-11 Brisbane 匿名公开读取，带 Gallery Origin：

| 采样 | 状态 | 首字节 | 完整响应 | 压缩体积 |
| --- | --- | --- | --- | --- |
| curl 1 | 200 | 8.046秒 | 9.413秒 | 245,899字节 |
| curl 2 | 200 | 3.452秒 | 4.747秒 | 245,899字节 |

第一份解压JSON为1,247,882字节，65题/1259作品。计数会随业务变化。响应 gzip、Cache-Control:no-store。首字节包含网络/代理/服务器等待，未使用服务端日志或分段计时，不能将全部耗时归为某个后端函数。

独立无头 Chromium 1440×1000 真实加载：bootstrap 与 data.json 均在导航约4051ms发出；data.json耗时541ms，bootstrap耗时5076ms；4598ms显示“正在连接展览馆”，9176ms显示“全部题目”。bootstrap为200，pageerror为0。目视最终题库结构正常；截图时封面尚未全部就绪，未声称全部资源/交互完成。

## 后端代码依据

只读相邻仓库当前本地 `cd10a0d`，没有假定与生产完全一致：

- server/app.mjs:145 bootstrap聚合公开目录、会话、本人/审核信息、反应、盲评池、featured和totals；无响应级缓存。http.mjs:17统一no-store。
- library.uploads在bootstrap和allWorks重复调用；catalog.refresh频繁同步读取来源文件；公开DTO逐件经过preview manifest读取和文件stat。已有POSIX SHA缓存不能消除所有聚合成本。
- totals等待完整综合leaderboard，缓存未命中时涉及榜单计算；poolStats逐题查询。尚未做各阶段耗时采样，不能宣称某一项是当前生产主要瓶颈。
- 已有GET /api/auth/me，但字段和moderator角色输出与bootstrap.user不一致，需要先统一契约；没有可直接替代的Gallery公开目录接口。
- 当前tracked Nginx catalog限流含nodelay，Node超额直接429；本轮采样未见429，未核实生产限流配置，不归因于限流排队。

## 建议方案（未实施）

1. 将题库目录、账号会话、盲评/榜单统计拆为独立加载状态。题库首屏只等待公开目录；账号慢不挡题库，统计慢不挡卡片。无数据时先显示题库框架和卡片骨架，失败局部重试；已有目录继续显示并提示更新失败。
2. 后端新增纯公开Gallery目录响应；明确DTO白名单，排除mine、私有审核和账户字段。先用现有进程内缓存和并发请求合并，按包版本及题目/作品/审核/撤回等变更失效，避免每个访客重新聚合。先不引入Redis、微服务或分页重构。
3. 公开响应使用ETag与条件校验；在要求实时可见性时优先每次复核的HTTP策略。缓存命中应在重型计算前完成；否则304只省传输、不省计算。账号及私有响应保持no-store。
4. 如产品允许短时间旧公开目录，额外使用有时限的最近成功快照与后台再验证，并显示更新时间；不把构建时旧PACK冒充完整目录，不缓存整个bootstrap，不让缓存决定写操作权限。严格即时撤回要求下采用快速校验+骨架，不承诺离线旧目录可见。
5. 减少一次聚合中的重复uploads/catalog/preview读取；totals独立于完整榜单计算。先增加Server-Timing或结构化分段指标验证主要成本，再决定进一步优化。

推荐验收：慢会话不挡目录；首次慢目录显示局部骨架；已有目录刷新失败仍可浏览；撤回/审核触发失效；公开缓存无私有字段；429遵守Retry-After。记录实际目录可用时间与p95，而不是只看HTTP成功。上述为建议，未实施或承诺具体性能。

参考：[MDN HTTP缓存](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching)、[Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control)、[web.dev stale-while-revalidate](https://web.dev/articles/stale-while-revalidate)。后者适用于允许有限陈旧的公开读取，不自动适用于身份或即时可见性控制。

## 验证与遗留物

- 已运行：git历史/公网源码核对、2次curl匿名采样、独立真实浏览器加载与最终截图目检。
- 未运行check/test/build/intake：本轮仅调查与记录，没有修改功能、测试、构建或数据包。
- 未做生产登录、业务写入、服务器日志/运行配置核对、手机/弱网故障注入、长期性能统计。
- 仅修改本归档与根HANDOFF，按用户通用提交授权一条英文记录提交，不push。
- 忽略证据：output/loading-analysis-20261011/（公网源码、匿名响应、headers、browser.json、probe.mjs）；output/playwright/loading-analysis-20261011-*.png。CLI run-code两次语法失败，最终改用仓库已有playwright库完成，不把失败尝试记为验证通过。
