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
