// DIGITALE_LOST_PROFILE_BLOCK_V1
// Consulta somente o MariaDB do Portal Digitale.
export async function isOutsideProfileCnpj(db, input) {
  const cnpj = String(input || '').replace(/\D/g, '');

  if (!/^\d{14}$/.test(cnpj)) {
    return false;
  }

  const [leads] = await db.execute(`
    SELECT 1 AS blocked
    FROM leads
    WHERE status = 'fora_de_perfil'
      AND REGEXP_REPLACE(COALESCE(cnpj,''), '[^0-9]', '') = ?
    LIMIT 1
  `, [cnpj]);

  if (leads.some(row => Number(row.blocked) === 1)) return true;

  const [deals] = await db.execute(`
    SELECT 1 AS blocked
    FROM crm_deals d
    JOIN crm_organizations o
      ON o.id = d.organization_id
    WHERE d.status = 'perdido'
      AND LOWER(
        TRIM(
          REGEXP_REPLACE(
            REPLACE(
              REPLACE(COALESCE(d.loss_reason,''), '_', ' '),
              '-', ' '
            ),
            '[[:space:]]+', ' '
          )
        )
      ) IN ('fora de perfil', 'fora do perfil')
      AND REGEXP_REPLACE(COALESCE(o.cnpj,''), '[^0-9]', '') = ?
    LIMIT 1
  `, [cnpj]);

  return deals.some(row => Number(row.blocked) === 1);
}
