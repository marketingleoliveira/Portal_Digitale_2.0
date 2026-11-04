CREATE TABLE IF NOT EXISTS digitale_ai_settings (
 id TINYINT PRIMARY KEY,
 settings JSON NOT NULL,
 updated_by CHAR(36) NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;
INSERT IGNORE INTO digitale_ai_settings(id,settings) VALUES(1,'{"enabled":true,"inactivity_months":3,"hourly_target":20,"daily_target":160,"states":["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"],"segments":["moda fitness","moda praia","moda esportiva","moda íntima","vestuário","lingerie","uniformes"]}');
CREATE TABLE IF NOT EXISTS digitale_ai_settings_audit (
 id CHAR(36) PRIMARY KEY,
 before_settings JSON NOT NULL,
 after_settings JSON NOT NULL,
 changed_by CHAR(36) NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS digitale_ai_client_imports (
 id CHAR(36) PRIMARY KEY,
 filename VARCHAR(255) NOT NULL,
 row_count INT NOT NULL,
 new_count INT NOT NULL DEFAULT 0,
 updated_count INT NOT NULL DEFAULT 0,
 imported_by CHAR(36) NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS digitale_ai_clients (
 cnpj VARCHAR(14) PRIMARY KEY,
 name VARCHAR(200) NOT NULL,
 last_order_date DATE NULL,
 status ENUM('active','inactive','unknown') NOT NULL DEFAULT 'unknown',
 import_id CHAR(36) NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 INDEX idx_ai_clients_status(status,last_order_date)
) ENGINE=InnoDB;
