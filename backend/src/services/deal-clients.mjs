import {getSettings} from './digitale-ai-settings.mjs';
import {normCnpj,validCnpj} from './prospecting-verification.mjs';
import {clientStatus} from './digitale-ai-clients.mjs';
export function dealCnpj(deal) {
  const text=deal.description||'';
  const organization=normCnpj(deal.organization?.cnpj);
  return validCnpj(organization)?organization:normCnpj(text.match(/CNPJ:\s*([A-Z0-9]{2}\.?[A-Z0-9]{3}\.?[A-Z0-9]{3}\/?[A-Z0-9]{4}-?\d{2})(?![A-Z0-9])/i)?.[1]);
}
// Only enrich rows already authorized by the CRM read policy. No source is changed.
export async function enrichDealClients(connection,deals) {
  if(!deals.length)return deals;
  const docs=new Map(deals.map(d=>[d.id,dealCnpj(d)]));
  const missing=deals.filter(d=>!validCnpj(docs.get(d.id)));
  if(missing.length){
    const [linked]=await connection.execute(`SELECT d.id,o.cnpj organization_cnpj,l.cnpj lead_cnpj FROM crm_deals d LEFT JOIN crm_organizations o ON o.id=d.organization_id LEFT JOIN leads l ON l.id=d.lead_id WHERE d.id IN (${missing.map(()=>'?').join(',')})`,missing.map(d=>d.id));
    for(const r of linked)docs.set(r.id,validCnpj(normCnpj(r.organization_cnpj))?normCnpj(r.organization_cnpj):normCnpj(r.lead_cnpj));
  }
  const cnpjs=[...new Set([...docs.values()].filter(validCnpj))];
  if(!cnpjs.length)return deals.map(d=>({...d,customer:null}));
  const [clients]=await connection.execute(`SELECT cnpj,name,DATE_FORMAT(last_order_date,'%Y-%m-%d') last_order_date,average_ticket FROM digitale_ai_clients WHERE cnpj IN (${cnpjs.map(()=>'?').join(',')})`,cnpjs);
  const {inactivity_months}=await getSettings(connection);
  const known=new Map(clients.map(c=>[c.cnpj,{...c,average_ticket:c.average_ticket===null?null:Number(c.average_ticket),status:clientStatus(c.last_order_date,new Date(),inactivity_months)}]));
  return deals.map(d=>({...d,customer:known.get(docs.get(d.id))||null}));
}
