# ClipFlow 数据库部署

生产环境使用 Neon PostgreSQL，本地开发在未配置 `DATABASE_URL` 时继续使用 SQLite。

## Neon 项目

- 项目：`ClipFlow`
- 数据库：`neondb`
- 分支：`main`
- 已初始化：用户、会话、收藏、下载、搜索历史、项目和项目素材表

连接串属于敏感信息，不要写入代码、提交到 GitHub 或放入 Vercel 的公开变量。

## Render 配置

1. 打开 Render Dashboard，进入 `clipflow-api`。
2. 进入 **Environment**。
3. 新增 `DATABASE_URL`，值从 Neon Console 的 **Connect** 面板复制。
4. 保存并重新部署服务。
5. 访问 `https://你的-render-域名/health`。

成功响应应包含：

```json
{
  "status": "ok",
  "service": "clipflow-api",
  "database": "connected"
}
```

## 本地开发

- `DATABASE_URL` 留空：使用 `data/clipflow.db`。
- `DATABASE_URL` 填写 Neon 连接串：使用 PostgreSQL。
- 测试始终显式使用内存 SQLite，不会修改 Neon 数据。

## 现有 SQLite 数据

当前改造会创建 PostgreSQL 表结构，但不会自动复制旧的 `data/clipflow.db` 数据。正式环境目前没有需要保留的数据时，可以直接切换。若以后需要迁移已有用户数据，应先备份 SQLite，再使用单独的数据导入脚本。
