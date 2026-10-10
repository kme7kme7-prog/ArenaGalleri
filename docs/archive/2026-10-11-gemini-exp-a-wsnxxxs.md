# 2026-10-11 · Gemini exp-a 可选模型 · wsnxxxs

- 人员与范围：负责人wsnxxxs，执行AI Codex；本仓仅验证和发布Gallery消费者目录，注册表由独立私有数据仓维护，后台仅消费pin变化。
- 本轮目标：新增Gemini 4.x（灰度） - exp-a为可选模型。
- 改动：新增gemini-4.x-exp-a选项、Google品牌和两个搜索别名，原gemini-4.x保持；本仓源码无功能变化，仅更新交接与本归档。完整2353个生产Gallery文件仅data.json变化，2288个包文件SHA/Git blob核验，2287资源与旧生产逐字节保持。后台激活固定包，无停服，无业务数据库修改；运行代码和版本保持。
- 决策：exp-a独立登记，不合并原灰度模型，不推测规格；只读查找未见同名自填作品，因此无需改投稿。采用已验证作品缓存生成新目录、保留生产资源，不重复编译无变化作品。
- 验证：数据check33/0、test9/9、CI intake176件/0错/8既有提示；Gallery check68/0、test33/33、生产配置build176件/70site、CI intake0错/8既有提示；后台check115/0、test332/332。公网目录与新构建字节一致，bootstrap指向新包，check:deployment兼容/CORS通过；后台名称/两个别名→正式ID，旧灰度→原ID。服务active/running/NRestarts0。共用作品表单搜索唯一项→正式modelId，厂商隐藏，桌面及390宽截图目视无横溢，控制台0错误/警告。
- 明确没做：未生产登录/保存投稿/投票，未验所有原作互动或真机；只改模型注册表，未重复完整build:data；未跑Linux全套单测。构建成功不等于全部交互通过。源码main不push，私有构建包按既有工具发布；各涉及仓各一条英文提交。
- 遗留物：忽略的output/gemini-exp-a-20261011/包含构建、包校验和发布证据，output/playwright/gemini-exp-a-*包含表单截图；本轮预览服务和浏览器已关闭。服务器/root/aob-gemini-exp-a-20261011/backup/保留旧pin、包路径和Gallery目录，旧包未清理。无未提交业务文件。
- 下一步建议：无待确认事项。
