# 设备管理模块

- 页面入口：`app/pages/device/index.vue`
- 前端接口：`app/features/device/api.ts`
- 共享类型：`packages/shared/src/index.ts`
- 后端路由：`apps/server/src/modules/device/device.routes.ts`
- 后端数据库：`apps/server/src/modules/device/device.repository.ts`
- 数据表：`t_device`

第一里程碑只包含设备编号、设备名称筛选和分页列表，不包含新增、编辑和删除。
