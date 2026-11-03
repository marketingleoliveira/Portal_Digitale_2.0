CREATE TABLE IF NOT EXISTS ia_digitale_verification_events (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 candidate_id CHAR(36) NOT NULL, run_id CHAR(36) NOT NULL, attempt INT NOT NULL,
 stage VARCHAR(30) NOT NULL, status VARCHAR(30) NOT NULL,
 reason VARCHAR(191) NULL, details LONGTEXT NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY candidate_attempt(candidate_id,attempt,id), KEY created_at(created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
