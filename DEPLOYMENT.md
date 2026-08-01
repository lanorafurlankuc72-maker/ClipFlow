# ClipFlow 免费测试部署

免费测试版由两个服务组成：Render 运行 API，Vercel 运行网页。API Key 只填写在平台的环境变量中，不要写入 GitHub。

## 1. 部署 Render API

1. 注册并登录 Render，选择 **New → Blueprint**。
2. 连接 GitHub 仓库 `lanorafurlankuc72-maker/ClipFlow`。
3. Render 会读取根目录的 `render.yaml` 并创建 `clipflow-api`。
4. 首次创建时填写素材 API Key。音效搜索需填写 `FREESOUND_API_KEY`。使用 DeepSeek 文案拆解时，再填写 `DEEPSEEK_API_KEY`，并确认 `AI_PROVIDER=deepseek`、`DEEPSEEK_MODEL=deepseek-v4-flash`。Stripe Key 可以留空。
5. `WEB_ORIGIN` 和 `APP_URL` 暂时填写 `https://example.com`。
6. 部署完成后复制 Render 地址，例如 `https://clipflow-api.onrender.com`。
7. 打开 `https://你的Render地址/health`，看到 `status: ok` 表示 API 正常。

Freesound Key 获取位置：登录 Freesound 后打开 `https://freesound.org/apiv2/apply/` 创建 API 凭证，将生成的 key 填入 Render 的 `FREESOUND_API_KEY`。不要把 key 填入 Vercel 或提交到 GitHub。

## 2. 部署 Vercel 网页

1. 注册并登录 Vercel，选择 **Add New → Project**。
2. 导入同一个 GitHub 仓库。
3. Root Directory 选择 `apps/web`。
4. 开启 **Include source files outside of the Root Directory**。
5. 添加环境变量 `NEXT_PUBLIC_API_BASE_URL`，值为上一步复制的 Render 地址，末尾不要加 `/`。
6. 点击 Deploy，完成后复制 Vercel 地址，例如 `https://clipflow.vercel.app`。

## 3. 回填正式网页地址

1. 回到 Render 的 `clipflow-api`。
2. 在 Environment 中把 `WEB_ORIGIN` 和 `APP_URL` 都改成 Vercel 地址。
3. 保存并重新部署 API。
4. 打开 Vercel 地址测试搜索、注册、收藏和项目。

## 免费版限制

- Render 免费 API 空闲后会休眠，第一次访问可能需要约一分钟。
- 免费实例文件系统不持久，重新部署或重启后 SQLite 中的账号和项目可能清空。
- 正式公开使用前，应将数据层切换到 Neon PostgreSQL 并配置备份。
