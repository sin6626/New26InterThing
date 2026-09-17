-- 故障来源旁表：不修改旧 t_error_msg，历史缺失来源时由查询层解释为 system。
CREATE TABLE IF NOT EXISTS t_error_source (
  fault_id INT NOT NULL,
  source VARCHAR(32) NOT NULL,
  PRIMARY KEY (fault_id),
  KEY idx_error_source_source (source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='故障判定来源';
