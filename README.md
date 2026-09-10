# New26InterThing

面向物联网应用创新比赛的水循环监控与控制系统。本仓库正在从旧项目分阶段重构，当前完成第一阶段设备列表纵向闭环。

## 目录

```text
apps/web          Nuxt 前端
apps/server       Express 后端
packages/shared   前后端共享类型
docs              重构与接口文档
```

## 首次运行

1. 复制 `.env.example` 为 `.env`，填写本机 MySQL 配置。
2. 确保 `DB_NAME` 与 `contest_admin` 使用的数据库相同。
3. 安装并检查：

```powershell
pnpm install
pnpm check:env
pnpm dev
```

前端默认地址为 `http://localhost:5174`，后端默认地址为 `http://localhost:3001`。
可通过根目录 `.env` 中的 `WEB_PORT` 修改前端开发端口。后端 API 的 CORS 默认允许所有来源。

## 常用命令

```powershell
pnpm dev          # 同时启动前后端
pnpm dev:web      # 只启动前端
pnpm dev:server   # 只启动后端
pnpm test         # 运行测试
pnpm typecheck    # 检查 TypeScript
pnpm build        # 生产构建
```

当前迁移范围和后续顺序见 `docs/重构计划.md`。
