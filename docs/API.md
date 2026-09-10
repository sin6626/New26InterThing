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
