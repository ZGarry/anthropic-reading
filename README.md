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

1. 勾选已读后，浏览器立即本地保存；文章数量和编号变化不会清空进度。
2. 可以导出 JSON 备份，换浏览器或从旧网址迁移时导入。合并时每篇文章保留较新的修改，包含手动取消已读。
3. 支持文件访问接口的浏览器可以点“连接自动备份文件”，选择本地 JSON。此后勾选会自动更新文件。浏览器重启后可能需要重新允许写入。
4. 其他浏览器仍可使用导出/导入。页面不会自动跨设备同步，也不会把进度上传到公开 GitHub 仓库。
5. 已读完成日期按北京时间展示；历史备份没有完成日期时保持未知，不推断补填。
6. 展开“查看阅读记录与备份内容”可以核对已读数和保存位置，并复制完整备份到文件。备份格式与导出文件一致，可以直接导入恢复；不会上传到服务器。

## 本地运行

```sh
python -m pip install -r requirements.txt
python scripts/refresh_catalog.py
node scripts/check_progress.cjs
python -m unittest discover -s tests
python -m http.server 8765 --bind 127.0.0.1 --directory dist
```

`scripts/export_local.py --output-dir <目录>` 可生成完整单文件网页，个人进度仍需另行导出。

## 覆盖范围

核对九个官方列表。未直接监控 Transformer Circuits 等独立外部博客及论文库；官网下架条目会保留，不自动删除。分类沿用官方标签和团队归属，因此一篇文章可以出现在多个类别。

独立整理，非 Anthropic 官方网站。文章内容及标题属于各自权利人；目录链接到原文，不复制全文。
