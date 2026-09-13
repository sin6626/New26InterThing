# HTTP API

基础地址默认是 `http://localhost:3001/api`。

## 查询设备列表

```http
GET /devices?page=1&pageSize=20&number=202&deviceName=水循环
```

查询参数：

| 参数 | 必填 | 说明 |
|---|---|---|
| `page` | 否 | 页码，默认 1 |
| `pageSize` | 否 | 每页数量，默认 20，最大 100 |
| `number` | 否 | 设备编号模糊查询 |
| `deviceName` | 否 | 设备名称模糊查询 |

成功响应：

```json
{
  "code": 0,
  "message": "查询成功",
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "pageSize": 20
  }
}
```

数据库字段在 API 中统一转换为 camelCase，例如 `device_name` 转为 `deviceName`、`ctime` 转为 `createdAt`。

参数错误返回 HTTP 400：

```json
{
  "code": 400,
  "message": "请求参数错误",
  "data": null
}
```

未知接口返回 HTTP 404，未处理的后端异常返回 HTTP 500；两者采用相同错误结构，`code` 分别为 `404` 和 `500`。

## 传感器历史页面

以下接口固定读取 `t_sensor_data` 和 `t_sensor_field_mapper`，不接受动态表名。

### 页面选项

```http
GET /sensor-history/options
```

返回设备编号数组和可见字段配置。字段的 `key` 是设备协议字段名，页面不会接触 `field1` 至 `field10`。

### 历史分页

```http
GET /sensor-history?page=1&pageSize=20&deviceNumber=202111&status=all&startTime=2026-09-10%2008:00:00&endTime=2026-09-10%2010:00:00
```

| 参数 | 必填 | 说明 |
|---|---|---|
| `page` | 否 | 页码，默认 1 |
| `pageSize` | 否 | 每页数量，默认 20，最大 100 |
| `deviceNumber` | 否 | 精确匹配设备编号 |
| `startTime` | 否 | `YYYY-MM-DD HH:mm:ss`，包含边界 |
| `endTime` | 否 | `YYYY-MM-DD HH:mm:ss`，包含边界且不得早于开始时间 |
| `status` | 否 | `all`、`normal` 或 `abnormal`，默认 `all` |

成功响应的 `data` 为 `{ items, total, page, pageSize }`。每条数据包含 `deviceNumber`、动态 `fields`、`status`、`statusCode`、`online` 和 `recordedAt`。

### 历史趋势

```http
GET /sensor-history/trend?deviceNumber=202111&status=all&limit=10
```

设备、时间和状态参数与历史分页一致；`limit` 默认为 10，范围为 10 至 500。响应 `data` 包含正序的 `times`，以及带字段键、名称、单位和数值数组的动态 `series`。

三个接口均返回 `{ code, message, data }`。参数格式或范围错误返回 HTTP 400，数据库异常返回 HTTP 500。

## 故障信息页面

故障页面只使用以下 HTTP 接口，不通过 WebSocket 推送或自动轮询。接口固定读取 `t_error_msg`、`t_error_code_mapper` 和 `t_device`。

### 页面选项

```http
GET /faults/options
```

返回 `deviceNumbers` 设备编号数组，以及数据库现有类型组成的 `types` 筛选项。类型码不在应用中写死含义。

### 故障分页

```http
GET /faults?page=1&pageSize=20&deviceNumber=202111&type=3&startTime=2026-09-10%2008:00:00&endTime=2026-09-10%2010:00:00
```

| 参数 | 必填 | 说明 |
|---|---|---|
| `page` | 否 | 页码，默认 1 |
| `pageSize` | 否 | 每页数量，默认 20，最大 100 |
| `deviceNumber` | 否 | 精确匹配设备编号 |
| `type` | 否 | 精确匹配设备上报的原始类型码 |
| `startTime` | 否 | `YYYY-MM-DD HH:mm:ss`，包含边界 |
| `endTime` | 否 | `YYYY-MM-DD HH:mm:ss`，包含边界且不得早于开始时间 |

成功响应的 `data` 为 `{ items, total, page, pageSize }`。每条记录包含 `id`、`deviceNumber`、`errorNumber`、`type`、`message` 和 `occurredAt`。

### 故障类型统计

```http
GET /faults/statistics?deviceNumber=202111&type=3
```

支持与分页接口相同的设备、类型和时间筛选，但不接受分页参数。响应 `data` 为 `{ type, label, count }[]`，统计范围是全部匹配记录而非当前页。

三个接口均返回 `{ code, message, data }`。参数格式或范围错误返回 HTTP 400，数据库异常返回 HTTP 500。

## 本地故障报告

设备不会主动发布故障消息，后端不订阅 `device/error`。本地判断模块通过 `createFaultReporter()` 提供的 `reportFault()` 报告故障：

```ts
await reporter.reportFault({
  deviceNumber,
  errorNumber: 'LOW_FLOW',
  type: '6',
  detail: '运行中流量 0.10L/min，低于配置阈值',
})
```

报告器按 `errorNumber + type` 查询 `t_error_code_mapper`，将标准中文信息和具体原因写入 `t_error_msg`。写入成功后通过现有 `/ws` 广播 `{ type: 'fault.alert', data: FaultItem }`，供应用布局显示右上角警告；故障页面仍由 HTTP 主动查询。

## 智能识别与行为数据

行为数据不使用 MQTT 或 WebSocket。历史数据页提交记录 ID，后端重查 `t_sensor_data`、调用本地配置的现场识别接口，并按 `t_behavior_field_mapper` 将响应写入 `t_behavior_data`。

### 发起智能识别

```http
POST /behaviors/recognize
Content-Type: application/json

{ "rowIds": [101, 102] }
```

`rowIds` 必须是 1 至 500 个不重复正整数，并且一次只能选择同一设备。成功响应包含 `saved`、`selectedCount` 和新行为记录 `behaviorId`。请求无效返回 HTTP 400；接口未配置、现场接口失败、响应路径错误或字段未命中返回 HTTP 422，并保留可排查的中文原因。

现场接口地址、请求模板和响应路径配置见 `apps/server/config/README.md`；代码只允许字段映射写入 `field1` 至 `field10`。

### 行为字段

```http
GET /behaviors/options
```

返回 `t_behavior_field_mapper` 中合法且可见的动态字段，字段包含 `key`、`label`、`unit` 和 `type`。

### 行为数据分页

```http
GET /behaviors?page=1&pageSize=20&startTime=2026-09-12%2008:00:00&endTime=2026-09-12%2010:00:00
```

页码默认 1，每页默认 20、最大 100；开始和结束时间格式为 `YYYY-MM-DD HH:mm:ss`，可单独提供，结束时间不得早于开始时间。成功响应的 `data` 为 `{ items, total, page, pageSize }`，每条记录包含动态 `fields` 和 `recordedAt`。

## 手动控制与操作日志

比赛系统最多只有一台设备。控制定义读取 `t_direct_config`，当前控制状态统一保存在 `t_direct_global`；请求中的设备编号用于生成 MQTT 报文和记录操作日志。

### 查询控制快照

```http
GET /controls/e46488d793245429
```

返回动态控制字段、父子显示条件、控件类型、范围、选项和当前值，不返回 MQTT 模板等协议细节。

### 执行人工指令

```http
POST /controls/commands
Content-Type: application/json

{
  "deviceNumber": "e46488d793245429",
  "configId": 21,
  "value": "on"
}
```

后端重新读取配置、校验值和安全边界。只有 `pump`、`heater` 两个设备运行指令按配置生成 MQTT 报文；`master` 只负责切换后端自动状态机，目标温度、PID、超时和安全阈值等控制参数也只保存到 `t_direct_global`，不发送 MQTT。MQTT 使用 QoS 1 单次发布，不离线排队、不重试。成功只代表 Broker 已确认接收；发布成功后才更新状态并写成功日志。发布失败不修改当前状态，但会写失败日志。

## 自动水循环

### 获取自动控制快照

```http
GET /api/automation/:deviceNumber
```

返回状态机状态、实际与期望执行器状态、PID 诊断、累计水量以及 `safety` 安全快照。`safety` 包含故障锁定、故障码、中文事实详情、发生时间、保护动作、故障入库状态、四类传感器新鲜度以及复位条件。页面首次进入必须调用该接口，WebSocket 只补充后续的 `automation.status` 和 `water-flow.realtime` 更新。

### 启停自动模式

```http
POST /api/automation/:deviceNumber/start
POST /api/automation/:deviceNumber/stop
```

启停接口与指令页面的 `master` 开关进入同一个自动控制引擎。`master` 不发布 MQTT；启动时状态机只先发布水泵开启。水泵、加热和自动模式开启均经过后端统一安全门；关闭动作始终允许。故障锁定时启动返回 HTTP 409 和具体原因。

### 人工复位安全故障

```http
POST /api/automation/:deviceNumber/fault/reset
```

只有配置有效、四类传感器数据新鲜、温压恢复安全且实际与期望水泵/加热均已关闭时才能复位。失败返回 HTTP 409 和不满足条件；成功仅解除故障锁定并返回 `stopped` 快照，不恢复 `master`，也不自动开启设备。

### 清零累计水量

```http
POST /api/automation/:deviceNumber/water-flow/reset
```

将 `t_water_flow_accumulator` 中该设备的累计水量清零，并向 `t_direct_history` 写入审计记录，不发送 MQTT。

### 时间同步

```http
POST /controls/time-sync
Content-Type: application/json

{
  "deviceNumber": "e46488d793245429",
  "time": "2026-09-12 14:30:00"
}
```

`time` 可省略，省略时使用后端当前本地时间。后端负责生成 `device/updateTime` 报文。

### 操作日志

```http
GET /operation-logs/options
GET /operation-logs?page=1&pageSize=20&deviceNumber=e46488d793245429&result=success
```

日志支持按设备编号、指令类型、结果及起止时间筛选，按操作时间和记录编号倒序分页。参数错误返回 HTTP 400，配置不存在返回 HTTP 404，MQTT 不可用返回 HTTP 503，数据库异常返回 HTTP 500。
