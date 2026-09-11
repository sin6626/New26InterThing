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
