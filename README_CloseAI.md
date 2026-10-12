# Jarvis PWA v3 - CloseAI 适配版

本版本适配 CloseAI 的 OpenAI 兼容接口。

## Vercel 环境变量

部署后进入：
Settings → Environment Variables

添加这三个变量：

OPENAI_API_KEY
= 你在 CloseAI 控制台创建的 sk- 开头 API Key

OPENAI_API_BASE
= https://api.openai-proxy.org/v1

OPENAI_MODEL
= 你在 CloseAI 控制台“模型定价/密钥管理”里确认可用的模型 ID

例如（仅当你的账户确实显示这个模型可用）：
gpt-5.6-luna

添加后必须重新 Redeploy。

## 注意

1. API Base 必须带 /v1。
2. 不要把 CloseAI 的 Key 发给别人，也不要写进 index.html。
3. 如果报 401，通常是 API Base 或 Key 配错。
4. 如果报 404，通常是 API Base 缺 /v1、模型名不支持，或接口地址错误。
5. 这个版本继续使用 Responses API；CloseAI 文档说明支持 Responses API。
6. CloseAI 是第三方中转服务，Jarvis 发给模型分析的上下文会经过该服务。
