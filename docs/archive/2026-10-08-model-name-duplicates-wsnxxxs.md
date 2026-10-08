# 2026-10-08 · 后台模型名称去点与只读报告 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Codex 桌面客户端，无子代理。
- 范围：相邻后台名称匹配/报告/测试/契约；Gallery仅本轮HANDOFF和归档，保留既有未提交匹配功能及暂存测试重命名。

## 本轮目标

后端 compact 与前端一致，先检查冲突及持久化影响，补点匹配并提供只读疑似重复清单。禁止 commit/push/部署/写生产，不改 schema、历史数据或读榜 x: 归属。

## 改动

- 后台 catalog 的 modelNameKey 改为 NFKC/小写后只保留字母和数字；改前完整名称/别名检查262模型、442写法、303键、跨模型冲突0。仅内存名称索引使用，无持久化键消费者；modelKey/entityKey 不改。
- 新只读 CLI `node scripts/report-model-duplicates.mjs --db <一致副本> [--dist <包目录>]` 输出空model_id、model_other精确命中登记名称/别名的作品、题目、登记模型、状态和 config/model 有效票数。SQLite只读事务，无平台启动/迁移/清理/合并，人工修正仍走library.setMeta。
- 后台新增2测试，契约同步；Gallery不改功能文件。本轮所有修改未提交。

## 决策

后端仅精确 compact，不做错字或词序近似，不把 x: 自填名在读榜时自动归登记模型。旧数据逐件由用户决定；无待拍板事项，前后端可任意顺序上线。

## 验证

- 后台 Windows / WSL Ubuntu Linux（Node24.16.0）最终标准 check111/0、test327/327。新增测试涵盖 gpt56 luna/GPT-5.6-Luna/别名/全角命中、5.7和错字不命中、x:键不变，真实CLI临时库列出1件、配置2票/模型1票，源库字节保持。
- Linux中途全量/串行在既有blind-pool厂商刷新断言失败；修改前HEAD也复现同一失败，未改无关代码/测试；最后标准全量通过。详细基线、失败和诊断日志保留在后台忽略证据。
- 只读已有一致副本（2026-10-08 02:25:55 Brisbane，v40）874作品/6645票，16件未登记、精确匹配疑似重复0件；DB/WAL SHA不变。该旧副本不代表当前生产，未连接生产。
- Gallery本地check68/0、test33/33；diff检查通过。无本轮Gallery源码/包变化，未重新build/intake；后台没有这两个脚本。未浏览器、真机或生产交互验收。

## 明确没做

未改历史数据、schema、榜单读取归属、私有包、另一前端或本轮Gallery功能源码；未commit、push、部署、重启或写生产。

## 遗留物

两仓本轮记录和后台相关文件未提交；Gallery既有他人未提交文件及暂存测试重命名保持。后台忽略 `output/model-name-duplicates-20261008/` 保存完整碰撞检查、报告、日志和Linux工作区路径；Gallery忽略 output-model-name-gallery-test.log。相邻后台同名归档记录完整实现和有效票口径。

## 下一步建议

获授权后再提交/上线；如要当前生产疑似重复清单，用最新一致副本重跑，不将旧副本0件当作线上结论。
