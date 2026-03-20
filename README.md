# 微信公众号 AI 排版工作台

一个面向公众号内容团队的 Web App：输入选题和品牌信息，AI 负责生成标题、摘要、正文结构、封面图提示词和配图建议，并输出接近公众号成稿的移动端预览。

## 本地运行

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 登录保护

如果你准备部署到公网，建议先打开登录保护。配置后，`/studio` 和所有 AI 相关接口都需要登录，陌生人不能直接消耗你的 token。

最简单的单账号配置：

```bash
AUTH_SECRET=change_this_to_a_long_random_string
AUTH_LOGIN_EMAIL=owner@example.com
AUTH_LOGIN_PASSWORD=StrongPassword123!
AUTH_LOGIN_NAME=Joyce
```

如果你要给多个内部成员使用，也可以改成：

```bash
AUTH_SECRET=change_this_to_a_long_random_string
AUTH_USERS_JSON=[{"email":"owner@example.com","password":"StrongPassword123!","name":"Joyce"},{"email":"editor@example.com","password":"AnotherStrongPassword!","name":"编辑同学"}]
```

配置完成后重启服务，访问 [http://localhost:3000/login](http://localhost:3000/login) 登录。

## GitHub + Render 部署

如果你准备继续按 Render 作为服务器来推进，这个项目最适合直接部署成一个 Next.js Web Service：前端页面、登录保护和 AI 生成接口都放在同一个服务里，不需要再拆前后端。

### 1. 上传到 GitHub 之前

先确认这些内容不会被提交：

- `.env.local`
- `node_modules`
- `.next`
- 本地导出 HTML
- `src.zip`

这些已经在 [`.gitignore`](/Volumes/T9/AI大本营/微信通信/.gitignore) 里处理好了。

### 2. 推到 GitHub

```bash
git init
git add .
git commit -m "init wechat ai studio"
git branch -M main
git remote add origin 你的 GitHub 仓库地址
git push -u origin main
```

### 3. 在 Render 创建 Web Service

- 打开 [Render](https://render.com/)
- 选择 `New +` → `Web Service`
- 连接 GitHub 并选择这个项目仓库
- 如果启用了 Blueprint，也可以直接识别仓库里的 [`render.yaml`](/Volumes/T9/AI大本营/微信通信/render.yaml)

手动创建时，构建配置保持：

```bash
Build Command: npm ci && npm run build
Start Command: npm run start
```

健康检查路径填：

```bash
/api/health
```

### 4. 在线上配置环境变量

至少要配置两类：

1. AI 相关：

```bash
AI_PROVIDER=doubao
AI_PROVIDER_NAME=豆包
AI_API_KEY=你的方舟 key
AI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
AI_TEXT_API_STYLE=chat
AI_TEXT_MODEL=你的文本 endpoint
ARK_IMAGE_MODEL=你的图片 endpoint
```

2. 登录保护：

```bash
AUTH_SECRET=一个足够长的随机字符串
AUTH_LOGIN_EMAIL=你的登录邮箱
AUTH_LOGIN_PASSWORD=你的登录密码
AUTH_LOGIN_NAME=你的名字
```

如果你要给多个内部同事登录，改成：

```bash
AUTH_SECRET=一个足够长的随机字符串
AUTH_USERS_JSON=[{"email":"a@company.com","password":"StrongPass1!","name":"A"},{"email":"b@company.com","password":"StrongPass2!","name":"B"}]
```

如果你直接使用仓库里的 [`render.yaml`](/Volumes/T9/AI大本营/微信通信/render.yaml)，这些 key 也会作为需要补齐的环境变量模板一起带上去。

### 5. 部署后检查

上线后先验证这几项：

- 打开 `/api/health` 返回 `ok: true`
- 打开 `/login` 能正常登录
- 未登录访问 `/studio` 会跳回 `/login`
- 未登录直接访问 AI API 会返回 `401`
- 登录后能正常生成选题、正文和图片

## EdgeOne 仍可用

如果你后面又想切回 EdgeOne，这个项目也还能继续部署；只是当前这轮整理已经把 Render 作为默认公网服务路径补齐了。

## AI 接入

默认支持两种模式：

- 没有配置任何 API Key：自动使用 mock 内容和 SVG 占位图，方便你先验证产品流程。
- 配置了兼容后端：服务端会调用真实模型生成文案；图片如果没有配置图像模型，会自动回退占位图。

推荐在 `.env.local` 中配置。OpenAI 例子：

```bash
AI_PROVIDER=openai
AI_API_KEY=your_key
AI_TEXT_API_STYLE=responses
AI_TEXT_MODEL=gpt-4.1-mini
AI_IMAGE_MODEL=gpt-image-1
```

豆包例子：

```bash
AI_PROVIDER=doubao
AI_PROVIDER_NAME=豆包
AI_API_KEY=your_ark_api_key
AI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
AI_TEXT_API_STYLE=chat
AI_TEXT_MODEL=your_endpoint_id
ARK_IMAGE_MODEL=your_image_endpoint_id
```

也支持直接沿用方舟文档常见变量名：

```bash
export ARK_API_KEY=your_ark_api_key
export ARK_ENDPOINT_ID=ep-xxxxxx
export ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
export ARK_IMAGE_MODEL=ep-xxxxxx
```

这时应用会自动识别为豆包模式；但如果 `next dev` 已经在运行，记得重启一次。

如果图片也是走方舟 `images/generations`，应用会自动切换到方舟兼容参数：

```bash
size=2K
response_format=url
```

如果你的图片也想走兼容接口，可以额外配置：

```bash
AI_IMAGE_PROVIDER=compatible
AI_IMAGE_API_KEY=your_image_key
AI_IMAGE_BASE_URL=your_image_base_url
AI_IMAGE_MODEL=your_image_model
```

如果暂时只接文本模型，不配图片模型也没问题，应用会继续显示占位图。

如果你想让“老公众号”模式在只输入公众号名时也尽量先找到真实历史文章，可以额外配置腾讯联网搜索 API：

```bash
TENCENTCLOUD_SECRET_ID=your_secret_id
TENCENTCLOUD_SECRET_KEY=your_secret_key
TENCENTCLOUD_REGION=
```

配置后，Studio 的老号分析会优先按公众号名搜索 `mp.weixin.qq.com` 候选文章，再抓取页面元数据做方向提炼；如果没配置、没搜到或接口不可用，会自动回退到手动贴链接 / 手动补标题的流程。

## 首版能力

- 文章 brief 输入：品牌、受众、目标、调性、重点信息、长度、风格
- 老号半自动提炼：可按公众号名做联网搜索，也支持粘贴历史文章链接和手动补标题
- AI 成稿：标题、副标题、导语、章节正文、强调语、CTA、标签
- 人工编辑：可直接修改当前稿件的标题、导语、章节和 CTA
- AI 二次优化：基于“当前编辑后的稿件”继续润色，而不是整篇推翻重写
- AI 配图：封面图提示词、分段配图提示词、按需生成图片
- 公众号预览：移动端成品视图，接近公众号阅读样式
- HTML 导出：可直接下载成单文件 HTML

## 目录结构

- `src/app/page.tsx`：主页
- `src/components/article-workbench.tsx`：主工作台
- `src/app/api/generate/route.ts`：文案生成接口
- `src/app/api/refine/route.ts`：当前稿件 AI 优化接口
- `src/app/api/image/route.ts`：图片生成接口
- `src/lib/`：类型、mock 数据、AI 封装、HTML 导出工具
