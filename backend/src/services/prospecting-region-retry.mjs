// Only an exclusively geographic rejection can reenter full verification.
// Delivered, approved and known CRM companies stay untouched.
export async function reopenGeographicCandidates(connection) {
  const [result]=await connection.execute(`UPDATE prospecting_auto_candidates c
    SET c.status='review',c.reason='region_configuration_changed',
        c.next_attempt_at=UTC_TIMESTAMP(6),c.updated_at=UTC_TIMESTAMP(6)
    WHERE c.status='rejected' AND c.reason='outside_target_state'
      AND NOT EXISTS (SELECT 1 FROM prospecting_auto_deliveries d
        WHERE d.candidate_id=c.id OR d.cnpj=c.cnpj)
      AND NOT EXISTS (SELECT 1 FROM prospecting_approved_leads a
        WHERE a.candidate_id=c.id OR a.cnpj=c.cnpj)
      AND NOT EXISTS (SELECT 1 FROM crm_organizations o
        WHERE REGEXP_REPLACE(COALESCE(o.cnpj,''),'[^0-9]','')=c.cnpj
          OR SUBSTRING_INDEX(SUBSTRING_INDEX(REPLACE(REPLACE(REPLACE(LOWER(COALESCE(o.website,'')),'https://',''),'http://',''),'www.',''),'/',1),':',1)=c.domain)
      AND NOT EXISTS (SELECT 1 FROM digitale_ai_clients b WHERE b.cnpj=c.cnpj)
      AND NOT EXISTS (SELECT 1 FROM leads l
        WHERE REGEXP_REPLACE(COALESCE(l.cnpj,''),'[^0-9]','')=c.cnpj)
      AND NOT EXISTS (SELECT 1 FROM crm_external_lead_imports i
        WHERE JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(i.payload),i.payload,'{}'),'$.cnpj'))=c.cnpj)`);
  return Number(result.affectedRows||0);
}
