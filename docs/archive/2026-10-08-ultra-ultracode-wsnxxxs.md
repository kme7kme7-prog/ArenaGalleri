# 2026-10-08 · 后台登记 Ultra 与 Ultracode · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Codex 桌面客户端；无子代理。
- 范围：相邻后台3个源码/测试文件，Gallery 仅本轮 HANDOFF 与归档，均未提交。

## 本轮目标

登记 Ultra、Ultracode 为常用档位，统一大小写和 bootstrap/管理后台候选；按用户要求不 commit、push、部署，不改数据库结构和历史作品档位。

## 改动

- 后台 EFFORTS 严格为 Low、Medium、High、XHigh、Max、Ultra、Ultracode；管理筛选和编辑/投稿候选同步。
- effortOf 已忽略大小写匹配 EFFORTS，无需修改；搜索未发现其他硬编码高低/代表作兜底/导出顺序或旧快照。
- 新增1条真实 HTTP/SQLite 回归验证 bootstrap 和 ultracode 提交保存。Gallery 功能源码不改，原有补两档、去重及高低顺序保持。

## 决策

档位仍是自由文本；新保存值规范为 Ultra、Ultracode，不批量改历史。高低 Ultracode > Ultra > Max > XHigh > High > Medium > Low；前后端可任意顺序上线，无待拍板事项。

## 验证

- Gallery 本地 `npm run check` 67文件/0错误、`npm test` 31/31。
- 后台 Windows 与独立 WSL Ubuntu Linux 工作区（均 Node24.16.0）：check109/0、test325/325；新增用例确认临时库 GET /api/bootstrap 完整列表及末尾两档，提交 ultracode 后响应和 SQLite 均为 Ultracode。
- 独立管理临时库 bootstrap 同列表，手动 HTTP 核对 ultra→Ultra、ULTRACODE→Ultracode。浏览器核对后台筛选/编辑候选 DOM 与编辑弹窗截图，无真实业务保存。
- 首轮新用例被未绑定邮箱的夹具账号拦下，改用既有 verifiedUser 后两平台全过；Linux 首次启动的 shell 引号问题修正后验证完成。
- 本地后台旧库 `.data/platform.db` v13 只读统计 ultra/ultracode 类值各0件，不能代表生产；生产数量未核查。未修改业务库或历史作品。
- `git diff --check` 通过。未重新 build/intake：Gallery 仅记录、无源码/数据包变化，后台没有这两个脚本。未测生产、真机或全交互验收。

## 明确没做

未改 Gallery/另一前端源码、私有数据包、数据库 schema 或历史作品档位；未 commit、push、部署、重启或写入生产。

## 遗留物

两仓本轮改动未提交；起始工作树均干净。后台忽略证据 `output/ultra-efforts-20261008/`，Gallery 忽略日志 output-ultra-gallery-test.log。临时库/Linux 工作区保留，临时管理服务收工停止。详细后台记录在相邻仓库同名归档。

## 下一步建议

后续获授权再提交和上线，不需数据库迁移或前后端固定上线顺序。
