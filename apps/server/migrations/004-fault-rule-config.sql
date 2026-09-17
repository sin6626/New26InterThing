CREATE TABLE IF NOT EXISTS t_fault_rule_config (
  fault_code VARCHAR(64) NOT NULL,
  fault_name VARCHAR(128) NOT NULL,
  category VARCHAR(24) NOT NULL,
  protection_enabled TINYINT(1) NOT NULL DEFAULT 1,
  protection_locked TINYINT(1) NOT NULL DEFAULT 0,
  record_enabled TINYINT(1) NOT NULL DEFAULT 1,
  notification_enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (fault_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='告警规则配置';

INSERT IGNORE INTO t_fault_rule_config VALUES
('OVER_TEMPERATURE','超温保护','safety',1,0,1,1,NOW()),
('OVER_PRESSURE','超压保护','safety',1,0,1,1,NOW()),
('LOW_FLOW','持续低流量','safety',1,0,1,1,NOW()),
('COMMAND_PUBLISH_FAILED','控制指令发布失败','safety',1,0,1,1,NOW()),
('SENSOR_FLOW_TIMEOUT','流量传感器超时','safety',1,0,1,1,NOW()),
('SENSOR_PRESSURE_TIMEOUT','压力传感器超时','safety',1,0,1,1,NOW()),
('SENSOR_TEMPERATURE_TIMEOUT','温度传感器超时','safety',1,0,1,1,NOW()),
('CONTROL_CONFIG_INVALID','控制配置无效','safety',1,0,1,1,NOW()),
('BUILD_FLOW_TIMEOUT','建流超时','safety',1,0,1,1,NOW()),
('PUMP_IDLING','水泵空转','safety',1,0,1,1,NOW()),
('TEMP_SENSOR_REVERSED','温度探头装反','safety',1,0,1,1,NOW()),
('DRY_HEATING_NO_TEMP_RISE','加热无温升','safety',1,0,1,1,NOW()),
('HYDRAULIC_BLOCKAGE','管路堵塞','diagnostic',1,0,1,1,NOW()),
('HYDRAULIC_PUMP_ABNORMAL','水泵异常','diagnostic',1,0,1,1,NOW()),
('HYDRAULIC_SENSOR_ANOMALY','水力传感器异常','diagnostic',1,0,1,1,NOW()),
('HYDRAULIC_LEAK_OR_BURST','泄漏或爆管','diagnostic',1,0,1,1,NOW()),
('E002','设备离线','communication',1,0,1,1,NOW());

UPDATE t_fault_rule_config SET protection_locked = 0;
