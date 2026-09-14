import type { SafetyFaultCode } from './safety.types.js'

export const safetyFaultDetails: Record<SafetyFaultCode, string> = {
  CONTROL_CONFIG_INVALID: '控制配置无效',
  BUILD_FLOW_TIMEOUT: '水泵启动后未在限定时间内建立安全流量',
  COMMAND_PUBLISH_FAILED: '控制指令发布失败',
  LOW_FLOW: '运行流量持续低于安全阈值',
  PUMP_IDLING: '人工开启水泵后未建立安全流量',
  OVER_PRESSURE: '管路压力达到或超过安全上限',
  OVER_TEMPERATURE: '水温达到或超过安全上限',
  SENSOR_FLOW_TIMEOUT: '流量传感器数据超时或无效',
  SENSOR_PRESSURE_TIMEOUT: '压力传感器数据超时或无效',
  SENSOR_TEMPERATURE_TIMEOUT: '温度传感器数据超时或无效',
  TEMP_SENSOR_REVERSED: '入口温度持续高于出口温度，温度探头疑似装反',
  DRY_HEATING_NO_TEMP_RISE: '有效加热时间内出口温度没有达到最低温升',
}
