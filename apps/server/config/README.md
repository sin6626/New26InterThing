# 比赛现场智能识别接口配置

行为数据不使用 MQTT 或 WebSocket。历史数据页勾选记录并点击“智能识别”后，后端读取本目录的 `recognition.json` 调用现场 HTTP 接口。

比赛现场操作：

1. 在 `contest_admin` 的“行为数据映射”配置返回字段：`p_name` 填识别响应字段或点路径，`db_name` 只能填 `field1` 至 `field10`。
2. 修改 `recognition.json` 的 `url`、请求头、请求模板和 `responseDataPath`。
3. 重启 New26InterThing 后端。
4. 在历史数据页勾选少量记录测试，成功后到行为数据页确认结果。

模板变量：

- `$rows`：全部选中记录，按采集时间升序排列。
- `$firstRow`：第一条记录。
- `$firstRow.pressure`：第一条记录中的指定传感器字段，支持点路径。
- `$selectedCount`：选中数量。

`responseDataPath` 指向包含行为字段的对象。例如响应为 `{ "data": { "result": { "action": "装载" } } }`，应填写 `data.result`，行为映射的 `p_name` 填 `action`。如果结果字段自身嵌套，`p_name` 可填 `classification.action`。

配置或映射错误时接口会返回具体中文原因，并且不会写入 `t_behavior_data`。

当前离线适配器支持带 JSON 请求体的 `POST`、`PUT`、`PATCH`。如果赛方文档要求 GET、文件上传或其他非 JSON 协议，应在比赛前修改 `recognition.adapter.ts`，不能只改配置后强行调用。
