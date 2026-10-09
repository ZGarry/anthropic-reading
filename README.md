# Anthropic 阅读目录

按类别筛选，再按原发布日期从早到晚阅读。收录 News、Research、研究团队、Science 与 Engineering 官方列表；自动合并重复文章，保留原文链接。

## 每日更新

- GitHub Pages 承载 `dist/` 静态页面。
- GitHub Actions 每天北京时间 **09:17** 运行普通 Python 抓取脚本，也支持手动运行。没有 AI 模型、AI 定时任务或模型 API。
- 每次对比完整官方列表，以文章稳定标识和最终链接去重；发布日期早于上次检查的补收文章也会被发现。
- `data/checks/YYYY-MM-DD.json` 按北京时间记录当日每次检查，含成功/失败、数量、新增链接标识；`data/last-check.json` 保存最近成功抓取结果。
- 官网解析失败时保留原目录；页面显示失败与上次成功日期，Actions 运行标为失败。每日没有新增也会提交核对记录。
- GitHub 的定时任务可能延迟；页面超过一天未成功更新时显示提醒。

## 阅读记录

公开目录与个人阅读状态分开。公开仓库不保存个人已读清单、备份或凭据。

1. 勾选已读后，浏览器立即保存；文章数量和编号变化不会清空进度。
2. 已接入 Firebase Authentication 的 Google 登录和 Firestore 同步。站点所有者需按 [云端设置说明](FIREBASE_SETUP.md) 完成一次性配置；配置为空时明确显示“云同步等待启用”，不能登录，也不会上传。
3. 服务启用后，同一 Google 账号在不同设备自动恢复和同步。首次登录可将原本机记录合并到所选账号；不同账号的缓存和本地文件连接相互隔离。
4. 多设备修改按文章合并，较新的修改优先，取消已读也同步。只有服务端确认后才显示“云端已保存”；离线时保留本机记录，联网后重试。
5. 云端保存当前记录及按北京时间归档的每日快照。同一天的快照随修改更新。数据库权限只允许该 Google 账号访问自己的记录；个人进度不写入 GitHub。
6. JSON 导出/导入、备份内容预览和可选的本地文件自动备份继续可用。历史备份没有完成日期时保持未知，不补填。

## 本地运行

```sh
python -m pip install -r requirements.txt
npm ci
npm test
npm run build
python scripts/refresh_catalog.py
python -m unittest discover -s tests
python -m http.server 8765 --bind 127.0.0.1 --directory dist
```

`npm run test:rules` 使用 Java 21+ 启动本机 Firestore 模拟器，验证账号隔离与写入权限，不连接真实数据库。

`scripts/export_local.py --output-dir <目录>` 可生成完整单文件网页，个人进度仍需另行导出。离线文件只用本机记录，Google 登录请打开 GitHub Pages 网站。

## 覆盖范围

核对九个官方列表。未直接监控 Transformer Circuits 等独立外部博客及论文库；官网下架条目会保留，不自动删除。分类沿用官方标签和团队归属，因此一篇文章可以出现在多个类别。

独立整理，非 Anthropic 官方网站。文章内容及标题属于各自权利人；目录链接到原文，不复制全文。
