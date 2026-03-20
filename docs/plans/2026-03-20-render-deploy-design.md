# Render 部署整理设计

## 背景

现有“公众号 AI 排版工作台”已经不是从零起步的空白项目，而是一个具备主工作台、登录保护、AI 生成接口和导出链路的 Next.js 全栈应用。此前文档主要按 EdgeOne 部署来整理，但如果后续继续使用 Render 作为服务器，更合适的做法不是重写一套后端，而是直接沿用当前 Next.js App Router 的全栈形态。

## 本次设计判断

继续采用单服务架构：

- Render 上部署一个 Next.js Web Service。
- 页面路由、登录页、Studio、API Route Handlers 保持同仓同服务。
- 不拆单独的 API 服务，不额外引入数据库或消息队列作为这轮前置条件。

这样做的原因：

- 当前 `/studio`、`/api/generate`、`/api/topic-strategy`、`/api/image` 已经是统一链路。
- 登录保护依赖中间件和服务端 Cookie，同服务部署最稳。
- 用户现在要的是“继续把 website app 做起来并能产生内容”，不是先把基础设施复杂化。

## Render 侧需要补的最小能力

1. 健康检查接口
   - 新增公开的 `/api/health`
   - 只返回服务是否存活、认证是否已配置、AI 能力是否完成基本装配
   - 不暴露敏感 key

2. Blueprint / 部署清单
   - 新增 `render.yaml`
   - 固定构建命令、启动命令、健康检查路径
   - 列出 AI、认证、超时和腾讯搜索相关环境变量

3. 部署说明
   - README 增加 Render 路线
   - 明确“这是单个 Next.js 服务”而不是前后端拆分项目

## 不在本轮处理的事情

- 不把本地号库和草稿状态迁移到云端数据库
- 不加入 Credits、计费或队列消费系统
- 不重写生成 prompt 或大幅改动现有工作台交互
- 不把 EdgeOne 路线删掉，只是把 Render 路线补齐

## 验收标准

- Render 能按 `npm ci && npm run build` 成功构建
- 服务启动后，`/api/health` 返回 200
- `/login`、`/studio` 和 AI 接口链路维持现有行为
- README 足够让后续继续在 Render 上部署和排障
