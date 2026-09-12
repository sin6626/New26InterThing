# 项目协作说明

## 重构边界

- 从 `H:\Project\26InterThing` 分阶段迁移，保持业务功能和设备流程一致，UI 可重做。
- 不修改现有 MySQL 表结构；`contest_admin` 是独立管理后台，不属于本仓库重构范围。
- 前端使用 Nuxt、Vue、TypeScript、Element Plus、Tailwind CSS；后端使用 Express、TypeScript。
- 项目只面向 Windows 桌面比赛环境，不做手机端，也不引入图片资源。

## 当前进度

- 第一里程碑：设备列表纵向闭环已完成。
- 第二里程碑：MQTT `device/sensor` → 动态字段映射 → `t_sensor_data` → WebSocket `/ws` → 实时监控页。
- 第三里程碑：独立 `sensor-history` 页面模块，提供动态历史表格、筛选分页和按分钟趋势图；不迁移识别按钮。已完成。
- 第四里程碑：本地规则调用 `reportFault()` → `t_error_code_mapper` 中文映射 → `t_error_msg` → 全局右上角警告；故障页面保持纯 HTTP 查询。已完成基础记录能力，具体安全规则留在对应控制里程碑实现。
- 第五里程碑：历史数据勾选 → 可配置 HTTP 智能识别 → `t_behavior_field_mapper` 动态映射 → `t_behavior_data` → 行为页面 HTTP 查询；不使用行为 MQTT 或 WebSocket。已完成。
- 后续模块继续按页面纵向切片迁移，删除无用旧接口，不提前搭建通用框架。

## 开发约定

- 根目录统一使用 pnpm workspace 命令。
- 自动化测试不得写真实数据库；真实联调只允许受控单条消息。
- 各里程碑开发期间不运行生产构建；全部功能开发完成后由用户统一执行构建。
- 前端 HTTP 请求继续由响应拦截器输出结构化调用信息。
- Git 提交使用 Conventional Commits，说明使用中文。
- 类型、对象、函数参数和较长表达式使用易读的多行格式，不为压缩行数把多个字段或步骤挤在同一行。
