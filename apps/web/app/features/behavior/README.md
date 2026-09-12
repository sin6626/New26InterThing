# 行为数据

行为数据只来自历史传感器记录触发的智能识别 HTTP 接口。页面通过 HTTP 查询 `t_behavior_data`，不订阅 MQTT 或 WebSocket。字段由 `t_behavior_field_mapper` 动态决定；现场接口配置位于 `apps/server/config/recognition.json`。
