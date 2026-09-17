-- 实时页水泵与加热运行时长；历史页仍按 t_sensor_data 独立计算。
CREATE TABLE IF NOT EXISTS t_operational_metrics_accumulator (
  d_no VARCHAR(64) NOT NULL,
  pump_runtime_seconds DOUBLE NOT NULL DEFAULT 0,
  heater_runtime_seconds DOUBLE NOT NULL DEFAULT 0,
  last_calc_time BIGINT NOT NULL DEFAULT 0,
  last_pump_state VARCHAR(16) NOT NULL DEFAULT 'unknown',
  last_heater_state VARCHAR(16) NOT NULL DEFAULT 'unknown',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (d_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='实时运行时长累计';
