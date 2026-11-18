CREATE TABLE IF NOT EXISTS rafael_attendance_calls (
 id VARCHAR(90) PRIMARY KEY,
 channel VARCHAR(32) NOT NULL DEFAULT 'laboratorio',
 status VARCHAR(40) NOT NULL DEFAULT 'em_contato',
 contact_name VARCHAR(120) DEFAULT NULL,
 segment VARCHAR(90) DEFAULT NULL,
 last_stage VARCHAR(80) DEFAULT NULL,
 started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ended_at DATETIME DEFAULT NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_rafael_attendance_started (started_at),
 INDEX idx_rafael_attendance_status (status,started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS rafael_attendance_turns (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 call_id VARCHAR(90) NOT NULL,
 turn_number SMALLINT UNSIGNED NOT NULL,
 speaker ENUM('cliente','rafael') NOT NULL,
 text TEXT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY unique_call_turn_speaker (call_id,turn_number,speaker),
 CONSTRAINT fk_rafael_call FOREIGN KEY (call_id) REFERENCES rafael_attendance_calls(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
