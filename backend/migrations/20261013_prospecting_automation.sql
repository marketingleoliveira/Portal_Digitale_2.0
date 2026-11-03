-- Existing Site Digitale queue belongs to a different database; retain it unchanged.
CREATE TABLE IF NOT EXISTS prospecting_auto_candidates (
 id CHAR(36) PRIMARY KEY, discovery_url TEXT NOT NULL, domain VARCHAR(191) NOT NULL,
 cnpj VARCHAR(14) NULL, company TEXT NULL, phone VARCHAR(11) NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'discovered', reason VARCHAR(191) NULL,
 proof LONGTEXT NULL, attempts INT NOT NULL DEFAULT 0, next_attempt_at DATETIME(6) NULL,
 discovered_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), verified_at DATETIME(6) NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY unique_domain(domain), UNIQUE KEY unique_cnpj(cnpj), KEY status_retry(status,next_attempt_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS prospecting_auto_deliveries (
 cnpj VARCHAR(14) PRIMARY KEY, candidate_id CHAR(36) NULL, deal_id CHAR(36) NOT NULL,
 organization_id CHAR(36) NOT NULL, person_id CHAR(36) NOT NULL,
 owner_id CHAR(36) NOT NULL, proof LONGTEXT NOT NULL,
 delivered_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY unique_deal(deal_id), KEY delivered_at(delivered_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS prospecting_auto_runs (
 id CHAR(36) PRIMARY KEY, started_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 finished_at DATETIME(6) NULL, found INT NOT NULL DEFAULT 0, delivered INT NOT NULL DEFAULT 0,
 deficit INT NOT NULL DEFAULT 0, status VARCHAR(30) NOT NULL DEFAULT 'running',
 error VARCHAR(191) NULL, KEY started_at(started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS prospecting_auto_runtime (
 id INT PRIMARY KEY, heartbeat_at DATETIME(6) NULL, status VARCHAR(30) NOT NULL,
 next_run_at DATETIME(6) NULL, query_cursor INT NOT NULL DEFAULT 0,
 provider_retry_at DATETIME(6) NULL, provider_failures INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO prospecting_auto_runtime(id,status) VALUES(1,'awaiting_service');

-- Normalize only the new automation tables to the CRM collation.
ALTER TABLE prospecting_auto_candidates CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE prospecting_auto_deliveries CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE prospecting_auto_runs CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE prospecting_auto_runtime CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
