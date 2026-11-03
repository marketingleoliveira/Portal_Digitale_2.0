import {sqlDate,windowAt} from './prospecting-policy.mjs';

// Called while the CRM import lock is held, so concurrent deliveries cannot
// choose an owner from the same pre-delivery counts.
export async function selectSdr(connection, now=new Date()) {
  const [owners]=await connection.execute(`
    SELECT p.id, COUNT(a.cnpj) delivered_today, MAX(a.delivered_at) last_delivery
    FROM profiles p JOIN system_users u ON u.id=p.id
    LEFT JOIN prospecting_auto_deliveries a ON a.owner_id=p.id AND a.delivered_at>=?
    WHERE p.is_active=1 AND u.disabled=0
      AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=p.id AND LOWER(r.role)='sdr')
    GROUP BY p.id
    ORDER BY delivered_today ASC, last_delivery ASC, p.id ASC LIMIT 1
  `,[sqlDate(windowAt(now).dayStart)]);
  if(!owners.length)throw Error('no_active_sdr');
  return owners[0].id;
}
