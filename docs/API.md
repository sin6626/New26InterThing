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

成功响应的 `data` 为 `{ items, total, page, pageSize }`。每条数据包含 `deviceNumber`、动态 `fields`、`status`、`statusCode`、`online` 和 `recordedAt`。`online=0` 表示正常联网实时数据，`online=1` 表示断网补发数据；两类数据都保留在历史记录中。`vstatus` 由后端入库时根据当前控制参数计算：达到最高安全温度或最高安全压力，以及水泵运行时流量低于最低安全流量，均记为告警 `1`，其余记为正常 `0`。调试模式不改变历史数据状态判定。

### 历史趋势

```http
GET /sensor-history/trend?deviceNumber=202111&status=all&limit=10
```

设备、时间和状态参数与历史分页一致；`limit` 默认为 10，范围为 10 至 500。响应 `data` 包含正序的 `times`，以及带字段键、名称、单位和数值数组的动态 `series`。

### 历史运行指标

```http
GET /sensor-history/operational-metrics?deviceNumber=202111&startTime=2026-09-10%2008:00:00&endTime=2026-09-10%2010:00:00
```

`deviceNumber` 必填。`startTime`、`endTime` 必须同时提供；未提供时间范围时统计该设备数据库中最新记录之前的 120 分钟。

接口根据 `water_Y2/field7`、`heat_Y1/field6` 的设备实际反馈和相邻采样时间差，估算查询范围内的水泵、加热运行秒数；超过当前 `data_timeout` 的报文断档不累计。根据 `temp_out/field2` 最近 60 秒窗口计算出口水温每分钟变化，并按自然分钟保留最后一个有效值。

历史运行时长是离散采样推导的查询区间估算值，不等同于实时页“当前服务进程启动以来”的累计值。

四个接口均返回 `{ code, message, data }`。参数格式或范围错误返回 HTTP 400，数据库异常返回 HTTP 500。

## 实时 WebSocket

浏览器连接 `/ws` 后接收以下消息：

- `system.status`：后端与 MQTT Broker 的连接状态。
- `sensor.realtime`：只广播 `online=0` 的实时传感器数据，`dataKind` 固定为 `realtime`；补发数据不会通过该消息覆盖当前值。
- `device.presence`：设备在线状态，包含 `deviceNumber`、`status` 和服务端记录的 `lastSeenAt`。超过控制参数 `device_offline_timeout` 未收到实时数据后变为 `offline`。
- `hydraulic.diagnosis`：当前水力联合诊断，包含诊断编码、名称、详情和级别。
- `automation.status`、`water-flow.realtime`：自动控制与累计量状态。
- `operational-metrics.realtime`：设备实际水泵/加热运行时长与出口水温每分钟变化速度。
- `fault.alert`：故障记录成功入库后的全局告警。

断网补发数据仍写入历史，但不刷新设备在线时间，也不驱动实时广播、累计量、自动控制、安全保护或水力诊断。

## MQTT 边界

| Topic | 方向 | 用途 |
|---|---|---|
| `device/sensor` | 设备 → 后端 | 传感器 JSON，必须包含 `d_no`；`online=1` 表示补发 |
| `device/direct` | 双向 | 后端发布水泵/加热指令，设备回报执行结果 |
| `device/updateTime` | 后端 → 设备 | 人工发起的时间同步 |

新后端不订阅 `device/behavior`、`device/error`、`device/heartbeat`、`team/Data` 或 `team/command`。行为数据由 HTTP 识别链路产生，故障由后端本地规则产生，设备在线由实时传感器报文判定。

## 故障信息页面

故障页面只使用以下 HTTP 接口，不通过 WebSocket 推送或自动轮询。接口固定读取 `t_error_msg`、`t_error_code_mapper` 和 `t_device`。

故障记录的 `source` 固定为 `system`（系统判定）或 `intelligence`（智能判定）。来源保存在 `t_error_source` 旁表；没有旁表记录的旧故障统一返回 `system`。列表和统计接口支持可选参数 `source=system|intelligence`，非法值返回 HTTP 400。`GET /faults/options` 的 `sources` 始终返回这两个固定选项。

当前确定性安全规则、设备离线和水力诊断产生的故障均为 `system`。比赛方智能识别协议尚未确认错误字段，因此当前不会生成 `intelligence` 故障。

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

## 告警配置

告警配置保存在 `t_fault_rule_config`，修改后立即生效，并以 `fault_rule_config` 类型写入操作历史。

- `GET /api/fault-rules`：返回全部规则及保护、记录、弹窗开关。
- `PUT /api/fault-rules/:faultCode`：请求体为 `protectionEnabled`、`recordEnabled`、`notificationEnabled` 三个布尔值。
- 核心安全规则的 `protectionLocked=true`，接口会强制保持保护开启；页面仍可独立关闭历史记录或右上角弹窗。
- 未锁定的水力诊断和设备离线规则可整体停用。停用后不执行该规则的保护动作，也不入库、不弹窗。
- `recordEnabled=false` 但 `notificationEnabled=true` 时只即时弹窗，不写故障历史；反之则只保存记录。

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

提交值与当前值相同时返回 `status: "unchanged"`，不重复发布 MQTT、不重复切换自动状态机，也不写成功操作历史。数值控件按数值语义比较，例如 `20` 与 `20.0` 视为相同；失败操作和智能识别事件不受此规则影响。

## 自动水循环

### 调试模式

```http
GET /automation/debug-mode
POST /automation/debug-mode
Content-Type: application/json

{ "enabled": true }
```

调试模式仅保存在当前后端进程中，默认关闭。开启后会清除模拟故障锁，跳过安全锁定、自动启动数据可用性校验以及自动控制参数的业务范围和组合关系校验；参数仍必须是有限数字，控制策略等结构字段仍须有效。只能用于现场模拟。关闭后从下一条实时数据开始恢复全部保护。调试模式不改变历史数据 `vstatus` 判定。

### 获取自动控制快照

```http
GET /automation/:deviceNumber
```

返回状态机状态、实际与期望执行器状态、PID 诊断、累计水量以及 `safety` 安全快照。`safety` 包含故障锁定、故障码、中文事实详情、发生时间、保护动作、故障入库状态、四类传感器新鲜度以及复位条件。页面首次进入必须调用该接口，WebSocket 只补充后续的 `automation.status` 和 `water-flow.realtime` 更新。

### 获取运行指标快照

```http
GET /automation/:deviceNumber/operational-metrics
```

返回累计的水泵和加热运行秒数、设备实际开关状态、出口水温每分钟变化速度及更新时间。泵与加热运行时长定时保存到 `t_operational_metrics_accumulator`，服务重启后恢复；出口温度变化速度仍根据重启后的最近 60 秒采样重新形成。页面后续通过 `operational-metrics.realtime` 实时更新。

```http
POST /automation/:deviceNumber/operational-metrics/reset
```

将该设备实时页面的水泵和加热累计运行时长同时清零，并写入操作历史；不删除 `t_sensor_data`，因此不影响历史页面按时间范围重新计算。

### 启停自动模式

```http
POST /automation/:deviceNumber/start
POST /automation/:deviceNumber/stop
```

启停接口与指令页面的 `master` 开关进入同一个自动控制引擎。`master` 不发布 MQTT；启动时状态机只先发布水泵开启。水泵、加热和自动模式开启均经过后端统一安全门；关闭动作始终允许。故障锁定时启动返回 HTTP 409 和具体原因。

### 人工复位安全故障

```http
POST /automation/:deviceNumber/fault/reset
```

只有配置有效、四类传感器数据新鲜、温压恢复安全且实际与期望水泵/加热均已关闭时才能复位。失败返回 HTTP 409 和不满足条件；成功仅解除故障锁定并返回 `stopped` 快照，不恢复 `master`，也不自动开启设备。

### 清零累计水量

```http
POST /automation/:deviceNumber/water-flow/reset
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

### 操作历史

```http
GET /operation-logs/options
GET /operation-logs?page=1&pageSize=20&source=application&deviceNumber=e46488d793245429&result=success
```

新项目只读写空表起步的 `t_operation_history`，旧项目继续使用 `t_direct_history`。`source` 仅允许 `application`（应用层）、`device`（设备）、`recognition`（智能识别）；列表提供操作时间、来源、设备编号、指令名称、类型、原值、新值、结果，不提供备注或原因。支持按来源、设备编号、指令类型、结果及起止时间筛选，按操作时间和记录编号倒序分页。参数错误返回 HTTP 400，配置不存在返回 HTTP 404，MQTT 不可用返回 HTTP 503，数据库异常返回 HTTP 500。
