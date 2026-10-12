# Jarvis v4 · CloseAI 可视化版

这是一版完整重构，不再只是聊天页。

## 新增

- 首页仪表盘：本月记录、连续记录、活跃计划、高频标签
- 快速记录：仅记录 / 记录并分析
- 结构化分析：核心问题、观察、判断、行动、不确定点分卡片显示
- 自动标签：AI 从已有标签库中自动分类
- 手动纠错：每条记录可重新选择标签，纠错示例会提供给后续分类参考
- 自建标签：可以新增、改名、删除自定义标签
- 记录页：关键词搜索、时间筛选、状态筛选、标签筛选
- 洞察页：心情、精力、压力、睡眠、体重、运动、阅读趋势曲线
- 标签频率图
- AI 趋势解读
- 长期计划：计划生成、进度汇报、复盘、下一步清单
- IndexedDB：手机本地实时保存，适合长期大量记录
- 本地恢复点：最多保留10个滚动恢复点
- JSON 导出/导入
- v3 数据自动迁移：同一 Vercel 域名升级后，会读取 v3 localStorage 并迁移到 v4 IndexedDB

## CloseAI / Vercel 环境变量

保留你现在已经配置好的三个变量即可：

```text
OPENAI_API_KEY=你的 CloseAI Key
OPENAI_API_BASE=https://api.openai-proxy.org/v1
OPENAI_MODEL=gpt-6-luna
```

不用重新生成 Key。

## 从 v3.2 / v3.3 升级

这次文件结构改变较多，建议把仓库根目录内容更新为本压缩包版本。

至少需要更新/新增：

```text
index.html
app.css
app.js
sw.js
manifest.webmanifest
vercel.json
package.json
icon-180.png
icon-192.png
icon-512.png
api/analyze.js
api/plan.js
api/progress.js
api/summarize.js
api/insights.js
```

Vercel Environment Variables 不需要修改。

提交 GitHub 后，Vercel 会自动重新部署。

部署完成后：

1. 浏览器强制刷新一次；
2. iPhone 如果仍显示旧版，可先从主屏幕删除 Jarvis 图标，再用 Safari 打开同一个 Vercel 地址重新“添加到主屏幕”；
3. 不要清除 Safari 网站数据，否则旧版尚未迁移的数据可能丢失。

## 本地数据与隐私

长期数据库默认存在当前设备的 IndexedDB 中，不使用 iCloud，也没有单独的云端数据库。

但当你点击“记录并分析 / AI 解读 / 生成计划”等功能时，为了让模型分析，本次所需上下文仍会发送到你配置的 CloseAI 接口。

## 图表怎么获得数据

趋势图不会凭空猜数字。数据来源有两种：

1. 记录时手动填写“心情 / 精力 / 压力 / 睡眠 / 体重”；
2. 文字里明确出现可无歧义提取的数据，例如“昨晚睡了6小时”“今天跑了40分钟”，AI 分析时会提取。

## 标签纠错如何工作

AI 自动分类后，你可以进入“记录”页面 → “编辑标签”。

每次人工修改都会保存一条本地纠错示例。以后分析时，最近的纠错示例会发给模型，作为你的个人分类偏好参考。

你还可以在“设置 → 标签管理”中创建自己的标签，例如：

- 社区工作
- 编制考试
- 暧昧对象
- 减脂期
- 重要复盘

之后这些标签会自动进入 AI 可选标签库。

## 备份

Jarvis 会实时写入 IndexedDB，并最多保留 10 个本地恢复点。

不过手机本地数据库仍不是绝对永久存储。建议偶尔：

设置 → 备份与恢复 → 导出完整备份

在 iPhone 上选择“文件 → 我的 iPhone”保存即可，不需要 iCloud。
