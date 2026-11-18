-- Dados da empresa e do contato: campos desconhecidos permanecem NULL.
-- Interesse explícito no artigo é separado da apresentação do artigo.
ALTER TABLE rafael_attendance_calls
 ADD COLUMN company_name VARCHAR(180) DEFAULT NULL AFTER contact_name,
 ADD COLUMN dialed_phone VARCHAR(40) DEFAULT NULL AFTER company_name,
 ADD COLUMN contact_role VARCHAR(120) DEFAULT NULL AFTER dialed_phone,
 ADD COLUMN customer_need TEXT DEFAULT NULL AFTER segment,
 ADD COLUMN article_presented VARCHAR(100) DEFAULT NULL AFTER customer_need,
 ADD COLUMN article_interest TINYINT(1) NOT NULL DEFAULT 0 AFTER article_presented,
 ADD COLUMN interest_evidence TEXT DEFAULT NULL AFTER article_interest,
 ADD COLUMN next_action VARCHAR(160) DEFAULT NULL AFTER interest_evidence;
CREATE INDEX idx_rafael_attendance_company ON rafael_attendance_calls (company_name);
CREATE INDEX idx_rafael_attendance_phone ON rafael_attendance_calls (dialed_phone);
