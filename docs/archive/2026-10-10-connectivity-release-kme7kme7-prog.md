# 2026-10-10 · 连接恢复联合发布 · kme7kme7-prog

用户授权立即部署已推送的Gallery3cfdac1与后台7c5ce10。以前端线上完整目录为基础替换app.js/platform.js，经现有cacheBustSite生成index.html/version.json和匹配CSP。资产3739f58b8d2614ce04250835，2353文件集合保持，只有四文件SHA变化；data.json/runtime-config.js与所有作品不变。未发布本地83作品旧包，保留线上按需预览优化，不改Show1或Nginx。

Linux Gallery check68/0、test33/33；后台check111/0、test330/330。最新一致副本新旧配置榜/模型榜和作品清单相同，8159/8022有效票、211参与者；停服最新备份v41、1054作品/8495票，上线后完整性ok/外键0，业务库未替换。

公网check:deployment通过：60题、40社区题、928作品，API配置/CORS/数据包一致。app.js/platform.js/index.html/version.json/runtime-config.js/data.json六文件公网SHA与发布清单相同；importmap与入口脚本指向新版本，内联CSP哈希匹配。服务active/running、NRestarts0。单次loopback首屏1.928s、重叠auth/me34ms、空闲2ms；公网auth/me200/206ms，不代表持续负载保证。

没有更新数据包，未重新build/intake，完整发布包由逐文件保留与清单验证。先前本地故障/恢复浏览器验证见功能归档；本次未重新生产浏览器目检，未登录、投稿、投票或审核。未跟踪live-patch/和patch-live.mjs未动。

备份/root/aob-connectivity-20261010/backup/；旧Gallery/www/wwwroot/gallery.connectivity-before-20261010。忽略证据在相邻Show1的.local/gallery-connectivity-20261010/。回滚只恢复运行代码与Gallery，避免覆盖上线后业务数据。
