# ClipFlow

AI 剪辑素材搜索工作台。输入自然语言需求，一次聚合搜索 Pexels、Pixabay、Unsplash 与 GIPHY。

## 技术栈

- Web：Next.js 16、React 19、TypeScript、Tailwind CSS 4、shadcn/ui 组件结构
- API：Node.js、Express 5、Zod
- Provider：独立 workspace 包，通过统一接口注册和聚合

## 本地开发

要求 Node.js 20.9+ 与 pnpm 10。

```bash
pnpm install
copy .env.example .env
pnpm dev
```

Web 默认运行于 `http://localhost:3000`，API 默认运行于 `http://localhost:4000`。

至少在 `.env` 中配置一个素材平台 Key 后才能返回真实素材；未配置或单个平台失败时，聚合接口仍会返回其他平台结果及清晰的 Provider 状态。

## 常用命令

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Provider 扩展

实现 `SearchProvider` 接口并在 `packages/providers/src/registry.ts` 注册即可。聚合器不依赖具体 Provider 实现。

## Sprint 2

- 收藏、下载记录和搜索历史保存在 `data/clipflow.db`
- 可选 AI 搜索增强支持 OpenAI 或 DeepSeek；在 `.env` 中设置 `AI_PROVIDER` 和对应 Key
- AI 未配置或请求失败时会自动回退到原始关键词，不影响基础搜索
- 运行环境要求 Node.js 22.5 或更高版本

## Sprint 3

- 支持创建、删除项目，以及将搜索素材加入项目或移出项目
- PWA 清单和离线应用外壳已启用，生产构建可安装到手机桌面
- 项目数据与素材归档继续保存在 `data/clipflow.db`
