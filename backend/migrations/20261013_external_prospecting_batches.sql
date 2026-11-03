CREATE TABLE IF NOT EXISTS prospecting_external_batches (
 id CHAR(36) PRIMARY KEY,
 target INT NOT NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'running',
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 completed_at DATETIME(6) NULL,
 label VARCHAR(191) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE prospecting_auto_deliveries ADD COLUMN IF NOT EXISTS external_batch_id CHAR(36) NULL;
ALTER TABLE prospecting_auto_deliveries ADD INDEX IF NOT EXISTS external_batch_id(external_batch_id);
