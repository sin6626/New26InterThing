# New26InterThing

面向物联网应用创新比赛的水循环监控与控制系统。项目已完成从旧 JavaScript 工程到 TypeScript Monorepo 的主体重构，现在进入最终比赛交付收口。

## 已实现能力

- 设备列表与动态字段映射。
- MQTT 传感器实时/补发数据分流、MySQL 入库与 WebSocket 推送。
- 实时监控、秒级温度/流量趋势、分钟汇总趋势与运行指标。
- 历史数据、历史告警状态、故障信息、行为识别和操作日志。
- 人工控制、自动水循环、时间比例 PID、累计水量、运行时长和出口水温变化速度。
- 持续安全保护、故障锁定/复位、设备在线判定与水力联合诊断。
- 仅用于现场模拟的进程级调试模式；默认关闭，后端重启后恢复关闭。

## 项目结构

```text
apps/web          Nuxt 4 + Vue 3 前端
apps/server       Express + MQTT + WebSocket + MySQL 后端
packages/shared   前后端共享 TypeScript 类型
docs              API、里程碑、现场手册和新旧对照
```

`contest_admin` 是独立后台，只通过同一 MySQL 数据库维护设备、字段映射、控制参数和故障码，不调用本项目 HTTP API。

## 首次运行

1. 安装 Node.js 和 pnpm，确保 MySQL 与 MQTT Broker 已启动。
2. 复制 `.env.example` 为 `.env`，填写本机数据库和 MQTT 参数。
3. 确保 `DB_NAME` 与 `contest_admin` 指向同一数据库。
4. 执行：

```powershell
pnpm install
pnpm check:env
pnpm dev
```

前端默认地址为 `http://localhost:5174`，后端默认地址为 `http://localhost:3001`。

## 常用命令

```powershell
pnpm dev          # 同时启动前后端
pnpm dev:web      # 只启动前端
pnpm dev:server   # 只启动后端
pnpm check:env    # 检查环境变量与 MySQL 连接
pnpm test         # 运行全量测试
pnpm typecheck    # 检查 TypeScript
pnpm build        # 最终生产构建（按约定由用户统一执行）
```

## 比赛文档

- [现场运行手册](./docs/比赛现场运行手册.md)
- [HTTP API 与 WebSocket 协议](./docs/API.md)
- [新旧项目对照](./docs/新旧项目对照.md)
- [最终验收记录](./docs/最终验收记录.md)
- [重构里程碑目录](./docs/重构计划.md)

## 安全提醒

- 正常模式下，安全保护和故障锁定优先于所有人工与自动指令。
- 调试模式会跳过安全锁和启动数据校验，只能用于模拟测试；测试故障识别或连接真实设备时必须关闭。
- 页面显示“MQTT 已连接”只代表后端已连接 Broker，设备是否在线以 `device/sensor` 实时报文为准。
