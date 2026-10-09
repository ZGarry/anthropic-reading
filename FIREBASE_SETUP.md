# 启用 Google 登录和免费的阅读记录同步

网页继续托管于 https://zgarry.github.io/anthropic-reading/ 。账号使用 Firebase Authentication 的 Google 登录，进度使用 Cloud Firestore。无需自己的服务器、Cloud Functions、Cloud Storage 存储桶或 AI 调用。

## 一次性云端设置

1. 用站点所有者的 Google 账号登录 Firebase 控制台，创建 Firebase 项目，保留 **Spark 免费方案**。无需绑定账单或升级 Blaze；不需要 Google Analytics。
2. 在 Authentication 中启用 Google 提供方，并选择自己的支持邮箱。在 Settings / Authorized domains 中加入 `zgarry.github.io`，不要填写路径。
3. 建立 Cloud Firestore 默认数据库，选择 Standard、生产模式和合适的地区。地区创建后不能直接更改；个人使用可以选择香港 `asia-east2`。只有一个数据库享有免费配额。
4. 注册 Web 应用，复制公开的 `firebaseConfig` 对象为 JSON 文件。不要复制服务账号私钥、OAuth client secret 或管理员凭据。
5. 在本项目目录执行 `node scripts/configure_firebase.cjs <公开配置文件路径>`，会更新 `dist/firebase-config.js`。
6. 将本仓库的 `firestore.rules` 发布到 Firestore Rules，并部署 `firestore.indexes.json` 中的索引豁免。也可使用 CLI：`npx firebase login`，然后 `npx firebase deploy --only firestore --project <项目ID>`。登录授权需由项目所有者完成。
7. 执行 `npm test`、`npm run test:rules`、`npm run build`，提交并推送。GitHub Actions 会更新 GitHub Pages。
8. 在已发布网页上点击“使用 Google 账号登录”，确认自己的账号，然后将本机旧记录合并。换另一浏览器登录同一账号，核对已读数量；测试一条已读/取消已读后在另一设备核验。只有这些真实环境检查完成，才算云同步已启用。

`dist/firebase-config.js` 为 `null` 时，网页明确显示“云同步等待启用”，登录按钮不可用。本机阅读功能仍可使用，绝不把未接通的服务显示为保存成功。

## 数据和权限

- 当前进度：`users/{Google账号UID}/progress/current`。
- 按北京时间保存的日快照：`users/{UID}/daily/YYYY-MM-DD`。日快照是普通文档；未使用收费的托管备份/PITR服务。同一天后续同步更新当天快照，不删除过去日期。
- 仅已登录的 Google 账号能读写其 UID 下的数据。未登录、其他账号、非 Google 登录、任意其他路径和删除请求都被规则拒绝。
- 云端只上传文章稳定 ID、已读状态、修改时间和已有完成时间；不上传文章全文或 Google 密码。
- 每次写入用事务合并，按文章保留较新的修改，显式“未读”同样同步。同时间冲突使用一致的取舍；历史零时间的已读不会被新设备默认未读覆盖。
- 离线或失败时保存在当前账号的本机缓存，联网后重试；收到服务端确认后才显示“云端已保存”。账号切换会停止前一账号的监听，缓存与本地文件连接按账号分开。
- 登录后的首次本机迁移需要用户在网页确认目标账号；其他账号不会自动继承它。原始未登录记录仍保留，可额外导出。

## 免费额度与验证

官方 Firestore 免费额度包括 1 GiB 存储、每天 50,000 次读取和 20,000 次写入。一次有修改的同步写入当前进度及当天快照，各一次。Spark 未启用付费，超限或不可用时前端显示失败并保留本机记录。

- https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- https://firebase.google.com/docs/firestore/quotas
- https://firebase.google.com/docs/auth/web/google-signin

`npm run test:rules` 仅在本机 Firestore 模拟器运行，不操作真实个人数据。测试覆盖本账号访问、跨账号拒绝、未登录拒绝、畸形写入拒绝和历史快照权限。
