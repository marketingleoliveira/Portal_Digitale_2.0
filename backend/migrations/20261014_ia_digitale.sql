CREATE TABLE IF NOT EXISTS ia_digitale_actions (
 id CHAR(36) PRIMARY KEY, action VARCHAR(60) NOT NULL, actor_id CHAR(36) NOT NULL,
 details LONGTEXT NOT NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY created_at(created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS ia_digitale_control (
 id INT PRIMARY KEY, requested_at DATETIME(6) NULL, requested_by CHAR(36) NULL,
 claimed_at DATETIME(6) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO ia_digitale_control(id) VALUES(1);
