import {isOutsideProfileCnpj} from './prospecting-lost-filter.mjs';
import {DEFAULT_SETTINGS,getSettings,matchesRegion} from './digitale-ai-settings.mjs';
import crypto from 'node:crypto';
import {selectSdr} from './prospecting-assignment.mjs';
import {OWNER,windowAt,sqlDate,quota} from './prospecting-policy.mjs';
import {normCnpj,phone,validCnpj} from './prospecting-verification.mjs';
import {domainOf} from './prospecting-auto-verification.mjs';
const norm = column => `UPPER(REGEXP_REPLACE(COALESCE(${column},''),'[^A-Za-z0-9]',''))`;
const digits = column => `REGEXP_REPLACE(COALESCE(${column},''),'[^0-9]','')`;
export async function duplicate(connection,p) {
  const [clients]=await connection.execute('SELECT cnpj FROM digitale_ai_clients WHERE cnpj=? LIMIT 1',[p.cnpj]);
  if(clients.length)return 'customer_base';
  const common=[p.cnpj,p.company,p.phone,p.phone,'55'+p.phone];
  const [organizations]=await connection.execute(`SELECT id FROM crm_organizations WHERE ${norm('cnpj')}=? OR LOWER(TRIM(name))=LOWER(TRIM(?)) OR ${digits('phone')} IN (?,?,?) OR SUBSTRING_INDEX(SUBSTRING_INDEX(REPLACE(REPLACE(REPLACE(LOWER(COALESCE(website,'')),'https://',''),'http://',''),'www.',''),'/',1),':',1)=? LIMIT 1`,[...common,p.domain]);
  if(organizations.length)return 'crm_organizations';
  const [leads]=await connection.execute(`SELECT id FROM leads WHERE ${norm('cnpj')}=? OR LOWER(TRIM(company_name))=LOWER(TRIM(?)) OR ${digits('contact_phone')} IN (?,?,?) LIMIT 1`,common);
  if(leads.length)return 'leads';
  const [deals]=await connection.execute(`SELECT d.id FROM crm_deals d LEFT JOIN crm_organizations o ON o.id=d.organization_id LEFT JOIN crm_people p ON p.id=d.person_id LEFT JOIN leads l ON l.id=d.lead_id WHERE ${norm('o.cnpj')}=? OR ${norm('l.cnpj')}=? OR LOWER(TRIM(d.title))=LOWER(TRIM(?)) OR ${digits('p.phone')} IN (?,?) OR LOCATE(?,COALESCE(d.description,''))>0 LIMIT 1`,[p.cnpj,p.cnpj,p.company,p.phone,'55'+p.phone,p.cnpj]);
  if(deals.length)return 'crm_deals';
  const [imports]=await connection.execute(`SELECT id FROM crm_external_lead_imports WHERE external_lead_id IN (?,?) OR ${norm("JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(payload),payload,'{}'),'$.cnpj'))")}=? OR ${digits("JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(payload),payload,'{}'),'$.phone'))")} IN (?,?) OR LOWER(JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(payload),payload,'{}'),'$.company')))=LOWER(?) OR LOCATE(?,COALESCE(payload,''))>0 LIMIT 1`,[p.cnpj,'verified_'+p.cnpj,p.cnpj,p.phone,'55'+p.phone,p.company,p.domain]);
  return imports.length?'crm_external_lead_imports':null;
}
export async function counts(connection,now=new Date()) {
  const w=windowAt(now);
  const [[row]]=await connection.execute(`SELECT SUM(delivered_at>=? AND external_batch_id IS NULL) AS hour_count,SUM(external_batch_id IS NULL) AS day_count,COUNT(*) AS total_day_count FROM prospecting_auto_deliveries WHERE delivered_at>=?`,[sqlDate(w.hourStart),sqlDate(w.dayStart)]);
  // Count pre-existing IA deliveries as well on the activation day, without altering them.
  const [[legacy]]=await connection.execute(`SELECT SUM(d.created_at>=?) AS hour_count,COUNT(*) AS day_count FROM crm_deals d WHERE d.source='IA PROSPECÇÃO' AND d.created_at>=? AND NOT EXISTS(SELECT 1 FROM prospecting_auto_deliveries a WHERE a.deal_id=d.id)`,[sqlDate(w.hourStart),sqlDate(w.dayStart)]);
  return {hour:Number(row.hour_count||0)+Number(legacy.hour_count||0),day:Number(row.day_count||0)+Number(legacy.day_count||0),totalDay:Number(row.total_day_count??row.day_count??0)+Number(legacy.day_count||0)};
}
export async function deliverVerified(db,p,candidateId=null,{clock=()=>new Date(),externalBatchId=null}={}) {
  if(!/^[A-Z]{2}$/.test(p.registry?.uf||''))throw Error('outside_target_state');
  if(p.version!==2||p.owner_id!==OWNER||!validCnpj(p.cnpj)||!phone(p.phone)||p.phone_call_tested!==false||!p.registry?.active||!(p.website?.cnpj_match||(p.identity_verified===true&&p.identity_method==='nome_e_telefone_cadastral'&&p.identity_evidence?.company_name_match===true&&p.identity_evidence?.phone_registry_match===true))||!(p.website?.phone_match||p.website?.phone_source==='registry')||domainOf(p.website.url)!==p.domain)throw Error('invalid_verified_proof');
  if (!['comprador_tecidos','confeccao','perfil_pendente'].includes(p.buyer_segment) ||
      p.email_search_completed !== true)
    throw Error('buyer_profile_not_verified');
  const connection=await db.getConnection();let locked=false;
  try {
    const [[lock]]=await connection.query("SELECT GET_LOCK('digitale:crm-import',10) acquired");
    if(Number(lock.acquired)!==1)throw Error('delivery_lock_timeout');locked=true;
    await connection.beginTransaction();
    const settings=await getSettings(connection);
    // UF valida ja foi verificada; nao restringir estado.
    if(!settings.enabled){await connection.rollback();return {ok:true,created:false,deferred:true,reason:'prospecting_paused'};}
    // DIGITALE_LOST_PROFILE_BLOCK_V1
    if (await isOutsideProfileCnpj(connection, p.cnpj)) {
      await connection.rollback();
      return {
        ok: true,
        created: false,
        duplicate: true,
        reason: 'outside_profile_history'
      };
    }
    const [existing]=await connection.execute('SELECT * FROM prospecting_auto_deliveries WHERE cnpj=?',[p.cnpj]);
    if(existing.length){await connection.rollback();return {ok:true,created:false,duplicate:true,deal_id:existing[0].deal_id};}
    const dup=await duplicate(connection,p);
    if(dup){await connection.rollback();return {ok:true,created:false,duplicate:true,reason:dup};}
    const now=clock(), allowance=await counts(connection,now);
    if(!deliveryQuota(allowance,now,Boolean(externalBatchId),settings)){await connection.rollback();return {ok:true,created:false,deferred:true,reason:'outside_window_or_quota'};}
    if(externalBatchId){
      const [batches]=await connection.execute('SELECT target,status FROM prospecting_external_batches WHERE id=? FOR UPDATE',[externalBatchId]);
      if(!batches.length||batches[0].status!=='running')throw Error('external_batch_not_running');
      const [[batchCount]]=await connection.execute('SELECT COUNT(*) total FROM prospecting_auto_deliveries WHERE external_batch_id=?',[externalBatchId]);
      if(Number(batchCount.total)>=batches[0].target){await connection.rollback();return {ok:true,created:false,deferred:true,reason:'external_batch_complete'};}
    }
    const ownerId=OWNER;
    const assignedProof={...p,assigned_owner_id:ownerId,distribution:'nicolle_fixed'};
    const [contexts]=await connection.execute("SELECT p.id pipeline_id,s.id stage_id FROM crm_pipelines p JOIN crm_stages s ON s.pipeline_id=p.id WHERE s.name='Prospecção' ORDER BY p.is_default DESC,p.sort_order,s.sort_order LIMIT 1");
    if(!contexts.length)throw Error('prospecting_stage_missing');
    const organizationId=crypto.randomUUID(),personId=crypto.randomUUID(),dealId=crypto.randomUUID();
    await connection.execute('INSERT INTO crm_organizations(id,name,legal_name,cnpj,website,phone,owner_user_id,created_by) VALUES(?,?,?,?,?,?,?,?)',[organizationId,p.company,p.registry.legal_name,p.cnpj,new URL(p.website.url).origin,p.phone,ownerId,OWNER]);
    await connection.execute('INSERT INTO crm_people(id,name,phone,organization_id,owner_user_id,created_by) VALUES(?,?,?,?,?,?)',[personId,p.company,p.phone,organizationId,ownerId,OWNER]);
    const description=(externalBatchId?`Lote externo ${externalBatchId} — fora da meta operacional.\n`:'')+`Prospecção IA verificada em ${p.checked_at}\nCNPJ: ${p.cnpj} — cadastro ativo, UF ${p.registry.uf}\nTelefone empresarial (${p.website.phone_source||'website'}): ${p.phone}; ligação não realizada.\nCadastro: ${p.registry.url}\nIdentidade empresarial: ${p.website.cnpj_url}\nTelefone: ${p.website.url}\nDescoberta: ${p.discovery_url}`;
    await connection.execute("INSERT INTO crm_deals(id,title,description,value,status,pipeline_id,stage_id,organization_id,person_id,source,owner_user_id,created_by,last_activity_at) VALUES(?,?,?,0,'aberto',?,?,?,?,'IA PROSPECÇÃO',?,?,UTC_TIMESTAMP(6))",[dealId,p.company,description,contexts[0].pipeline_id,contexts[0].stage_id,organizationId,personId,ownerId,OWNER]);
    const payload=JSON.stringify({company:p.company,cnpj:p.cnpj,phone:p.phone,source:'IA_PROSPECCAO',external_batch_id:externalBatchId,verification:assignedProof});
    await connection.execute("INSERT INTO crm_external_lead_imports(id,source_system,external_lead_id,dedupe_key,qualification_status,qualification_score,organization_id,person_id,deal_id,owner_user_id,payload) VALUES(?,'IA_PROSPECCAO',?,?,'verified',100,?,?,?,?,?)",[crypto.randomUUID(),'verified_'+p.cnpj,crypto.createHash('sha256').update('IA_PROSPECCAO:'+p.cnpj).digest('hex'),organizationId,personId,dealId,ownerId,payload]);
    await connection.execute('INSERT INTO prospecting_auto_deliveries(cnpj,candidate_id,deal_id,organization_id,person_id,owner_id,proof,delivered_at,external_batch_id) VALUES(?,?,?,?,?,?,?,?,?)',[p.cnpj,candidateId,dealId,organizationId,personId,ownerId,JSON.stringify(assignedProof),sqlDate(clock()),externalBatchId]);
    
    // Registra a sincronizacao na mesma transacao da entrega ao CRM.
    // A ausencia de email nunca impede a entrega do lead.
    const disparoEmail = String(p.email || '').trim().toLowerCase();
    const nicolleId = 'fba75bd9-8f92-4e2b-83f9-3bc48d7fa4bd';

    if (
      ownerId === nicolleId &&
      disparoEmail.length <= 254 &&
      /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(disparoEmail)
    ) {
      await connection.execute(
        `INSERT INTO prospecting_disparo_outbox
          (deal_id, owner_id, email, company, phone, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [
          dealId,
          ownerId,
          disparoEmail,
          String(p.company || '').slice(0, 255),
          String(p.phone || '').slice(0, 40)
        ]
      );
    }

    if(candidateId)await connection.execute("UPDATE prospecting_auto_candidates SET status='delivered',reason=NULL,verified_at=UTC_TIMESTAMP(6),proof=?,company=?,phone=?,cnpj=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?",[JSON.stringify(p),p.company,p.phone,p.cnpj,candidateId]);
    const finalWindow=windowAt(clock());
    if(!finalWindow.open||finalWindow.date!==windowAt(now).date||finalWindow.hour!==windowAt(now).hour){await connection.rollback();return {ok:true,created:false,deferred:true,reason:'window_changed'};}
    if(externalBatchId)await connection.execute("UPDATE prospecting_external_batches SET status='completed',completed_at=UTC_TIMESTAMP(6) WHERE id=? AND target<=(SELECT COUNT(*) FROM prospecting_auto_deliveries WHERE external_batch_id=?)",[externalBatchId,externalBatchId]);
    await connection.commit();return {ok:true,created:true,deal_id:dealId,organization_id:organizationId,person_id:personId,owner_id:ownerId};
  }catch(e){await connection.rollback();throw e;}finally{if(locked)await connection.query("SELECT RELEASE_LOCK('digitale:crm-import')");connection.release();}
}

export function deliveryQuota(allowance,now=new Date(),external=false,settings=DEFAULT_SETTINGS){
 const total=allowance.totalDay??allowance.day;
 if(!settings.enabled||!windowAt(now).open||total>=settings.daily_target)return 0;
 // DIGITALE_EXTERNAL_QUOTA_FIX_V1
  const remainingDaily = Math.max(0, settings.daily_target-total);
  if (external) return remainingDaily;
  return Math.max(0, Math.min(settings.hourly_target-allowance.hour, remainingDaily));
}
