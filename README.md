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

## Sprint 4

- 支持邮箱注册、登录、退出与 30 天安全会话；密码使用 scrypt 加盐保存
- 账号默认使用免费版，登录与搜索等基础功能不依赖支付配置
- 可选 Stripe Checkout 商业版订阅；在 `.env` 填写 `STRIPE_SECRET_KEY`、`STRIPE_PRICE_ID` 和 `STRIPE_WEBHOOK_SECRET` 后启用
- Stripe 回调地址为 `POST /billing/webhook`，本地联调时需由 Stripe CLI 转发到 `http://localhost:4000/billing/webhook`

## Sprint 5–8 完善

- 单次搜索最多使用 3 组检索词并行查询各素材源，再统一去重和排序；保留继续加载翻页
- 收藏、下载、搜索历史和项目按登录账号隔离；升级前的本地数据保留在访客空间
- 项目支持名称与备注编辑、收藏素材批量加入、全部清空和 JSON 导出
- 免费版限制为 3 个项目、每项目 100 条素材；商业版取消数量限制
- Stripe Billing Portal 支持用户管理付款方式和取消订阅；订阅取消、更新及续费失败会通过签名 Webhook 自动同步账号权益

## Sprint 9

- 搜索结果与收藏支持按素材来源、横竖屏和视频时长筛选
- 支持按相关度、画面分辨率和视频时长排序，并可一键重置筛选
- 素材卡片展示分辨率，并提供明确的原始来源与授权入口
