-- 新项目专用操作历史。旧项目继续使用 t_direct_history；不迁移旧记录。
CREATE TABLE IF NOT EXISTS t_operation_history (
  id BIGINT NOT NULL AUTO_INCREMENT,
  operate_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source VARCHAR(24) NOT NULL,
  trigger_mode VARCHAR(24) DEFAULT NULL,
  direct_type VARCHAR(64) NOT NULL,
  d_no VARCHAR(64) DEFAULT NULL,
  config_id BIGINT DEFAULT NULL,
  direct_name VARCHAR(255) DEFAULT NULL,
  old_value VARCHAR(255) DEFAULT NULL,
  new_value VARCHAR(255) DEFAULT NULL,
  result VARCHAR(64) NOT NULL,
  related_id BIGINT DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_operation_history_time (operate_time, id),
  KEY idx_operation_history_source (source),
  KEY idx_operation_history_type (direct_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='新项目操作历史';
