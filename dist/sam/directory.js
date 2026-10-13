window.READING_DIRECTORY = {
  title: 'Sam Altman 阅读目录',
  backupName: 'Sam-Altman',
  prefsKey: 'sam-altman-reading-preferences-v1',
  topics: {ai:'AI 与智能',startups:'创业与公司',career:'工作与人生',investing:'投资与资本',society:'经济与社会',science:'科技与能源',essays:'随笔与其他'},
  sources: {all:'全部博客',Blog:'个人博客'},
  intro: meta => `个人博客 · 已遍历 ${meta.pageCount} 页 · ${meta.firstDate} — ${meta.lastDate}`,
  progressText: (read,total) => `已读 ${read} / ${total} · 从第一篇开始，一篇篇读完`,
};
