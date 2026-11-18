// Uma única reavaliação após a correção do verificador, sem reabrir recusas comerciais.
export const VERIFICATION_POLICY='razao-social-20261117-v3';
export function recoverableCandidate(row) {
  if(row?.status!=='rejected')return false;
  let proof;try{proof=typeof row.proof==='string'?JSON.parse(row.proof):row.proof;}catch{}
  const technical=['cnpj_ausente_ou_invalido','website_cnpj_inconclusive'].includes(row.reason);
  // O classificador antigo não reconhecia "CONFECÇÕES/CONFECCOES".
  // Somente nomes vindos de um site com produção já constatada podem voltar
  // à verificação completa; o CNAE e a identidade precisam passar novamente.
  const oldClassifier=['outside_textile_buyer_profile','outside_target_cnae','not_apparel_manufacturer'].includes(row.reason);
  return (technical||oldClassifier)&&proof?.verification_policy!==VERIFICATION_POLICY;
}
export async function recoverCandidate(db,row,official,evidence) {
  if(!recoverableCandidate(row))return 0;
  const [result]=await db.execute(`UPDATE prospecting_auto_candidates c
    SET c.status='discovered',c.reason='verification_policy_changed',c.next_attempt_at=UTC_TIMESTAMP(6),
        c.discovery_url=?,c.proof=JSON_SET(IF(JSON_VALID(c.proof),c.proof,'{}'),
          '$.verification_policy',?,'$.recovery.previous_reason',?,
          '$.recovery.checked_at',?,'$.discovery',JSON_EXTRACT(?,'$.discovery')),
        c.updated_at=UTC_TIMESTAMP(6)
    WHERE c.id=? AND c.status='rejected' AND c.reason=?
      AND NOT EXISTS (SELECT 1 FROM prospecting_approved_leads a WHERE a.candidate_id=c.id OR a.cnpj=c.cnpj)
      AND NOT EXISTS (SELECT 1 FROM prospecting_auto_deliveries d WHERE d.candidate_id=c.id OR d.cnpj=c.cnpj)`,
    [official.url,VERIFICATION_POLICY,row.reason,new Date().toISOString(),JSON.stringify(evidence),row.id,row.reason]);
  return Number(result.affectedRows||0);
}
