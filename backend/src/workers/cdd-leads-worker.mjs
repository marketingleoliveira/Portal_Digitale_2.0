import {readFileSync} from 'node:fs';
import {db} from '/var/www/Portal-Digitale-2.0/backend/src/database.js';
const digit=v=>String(v??'').replace(/\D/g,'');
const str=v=>String(v??'').trim();
// Campos reais retornados pelo endpoint v5: contato_telefonico e contato_email.
// Normaliza formatos: string, array, {ddd,numero}, {email}, {enderecos:[...]}.
function flatten(v,depth=0){
 if(v==null||depth>4)return [];
 if(Array.isArray(v))return v.flatMap(x=>flatten(x,depth+1));
 if(typeof v!=='object')return [String(v)];
 const result=[];
 for(const k of ['numero','telefone','celular','email','endereco','valor','contato','contatos','telefones','emails','itens','lista','dados','principal']){
  if(v[k]!=null)result.push(...flatten(v[k],depth+1));
 }
 return result.length?result:[];
}
function phone(r){
 const vals=[r.contato_telefonico,r.telefone,r.telefones,r.contato?.telefone,r.contato?.telefones,r.contatos?.telefones,r.celular,r.telefone_principal];
 function extract(v){
  if(Array.isArray(v))return v.flatMap(extract);
  if(v==null)return [];
  if(typeof v==='object'){
   let ddd=digit(v.ddd||v.codigo_area||v.area);
   let direct=digit(v.numero||v.telefone||v.celular||v.valor||'');
   const out=[];
   if(ddd.length===2&&(direct.length===8||direct.length===9))out.push(ddd+direct);
   if(direct.length===10||direct.length===11)out.push(direct);
   return [...out,...['telefones','contatos','lista','itens','dados'].flatMap(k=>extract(v[k]))];
  }
  const n=digit(v);return n.length===10||n.length===11?[n]:[];
 }
 for(const v of vals){const valid=extract(v).find(v=>(v.length===10||v.length===11)&&/^[1-9]/.test(v));if(valid)return valid;}
 return '';
}
function email(r){
 const vals=[r.contato_email,r.email,r.email1,r.emails,r.contato?.email,r.contato?.emails,r.contatos?.emails,r.email_principal];
 for(const v of vals){for(const item of flatten(v)){const e=String(item).trim().toLowerCase();if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)&&e.length<=254)return e;}}
 return '';
}
function cnpjValid(v){
 const n=digit(v);if(n.length!==14||/^(\d)\1+$/.test(n))return false;
 const calc=nums=>{let weight=nums.length-7,sum=0;for(const ch of nums){sum+=Number(ch)*weight--;if(weight<2)weight=9;}const k=sum%11;return k<2?0:11-k};
 return calc(n.slice(0,12))===Number(n[12])&&calc(n.slice(0,13))===Number(n[13]);
}
function cnaeOf(r){const p=r.atividade_principal||r.cnae_principal||r.codigo_atividade_principal||r.cnae||r.atividades?.principal||'';return digit(typeof p==='object'?(p.codigo||p.codigo_atividade||p.cnae||''):p)}
function cnaeMatches(v){return /^(1411|1412|1413|1420)\d{3}$/.test(v)}
async function main(){
 await db.query(`CREATE TABLE IF NOT EXISTS digitale_casa_prospects(
 cnpj VARCHAR(14) NOT NULL PRIMARY KEY,
 company VARCHAR(255) NOT NULL,
 phone VARCHAR(32) NOT NULL,
 email VARCHAR(255) NOT NULL,
 cnae VARCHAR(7) NOT NULL,
 uf CHAR(2) NOT NULL DEFAULT 'SP',
 status VARCHAR(32) NOT NULL DEFAULT 'A_VALIDAR',
 discovered_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 INDEX idx_cdd_date(discovered_at),INDEX idx_cdd_status(status)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
 await db.query(`CREATE TABLE IF NOT EXISTS digitale_casa_usage(
 id INT NOT NULL PRIMARY KEY,requests INT NOT NULL DEFAULT 0,
 requests_date DATE NULL,weekly_imports INT NOT NULL DEFAULT 0,
 last_page INT NOT NULL DEFAULT 0,last_run_at DATETIME(6) NULL,
 last_status VARCHAR(100) NULL,balance_total INT NULL,
 last_found INT NOT NULL DEFAULT 0,last_imported INT NOT NULL DEFAULT 0,
 last_duplicates INT NOT NULL DEFAULT 0
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
 await db.query("INSERT IGNORE INTO digitale_casa_usage(id) VALUES(1)");
 const file='/etc/ia-digitale/casa-dos-dados.env';
 const txt=readFileSync(file,'utf8');const token=txt.match(/^CASA_DOS_DADOS_API_KEY=(.+)$/m)?.[1]?.trim();
 if(!token||token.length<25||token.includes(' ')){await db.execute("UPDATE digitale_casa_usage SET last_status='TOKEN_NAO_CONFIGURADO',last_run_at=UTC_TIMESTAMP(6) WHERE id=1");console.log('CDD_TOKEN_AUSENTE_OU_INVALIDO');return;}
 const req=async(url,method='GET',body)=>{
  const res=await fetch(url,{method,headers:{'api-key':token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(22000)});
  let json={};try{json=await res.json()}catch{}
  if(!res.ok){const e=new Error('CDD_HTTP_'+res.status);e.http=res.status;throw e;}
  return json;
 };
 try{
  const balance=await req('https://api.casadosdados.com.br/v5/saldo');
  const current=Number(balance.saldo_total);
  if(!Number.isFinite(current)){console.log('CDD_SALDO_INESPERADO');return;}
  await db.execute("UPDATE digitale_casa_usage SET balance_total=? WHERE id=1",[current]);
  console.log('CDD_SALDO_OK disponivel='+current);
  if(current<1){console.log('CDD_SEM_SALDO_PESQUISA_BLOQUEADA');return;}
  if(process.env.CDD_ALLOW_ONE_SEARCH!=='1'){console.log('CDD_MODO_LEITURA_SEM_PESQUISA');return;}
  const [[usage]]=await db.execute('SELECT requests,requests_date,last_page FROM digitale_casa_usage WHERE id=1');
  const [[clock]]=await db.execute("SELECT DATE(UTC_TIMESTAMP()-INTERVAL 3 HOUR) today,DAYOFWEEK(UTC_TIMESTAMP()-INTERVAL 3 HOUR) dow");
  const today=String(clock.today).slice(0,10);
  if(Number(clock.dow)===1||Number(clock.dow)===7){console.log('CDD_BLOQUEIO_FINAL_DE_SEMANA');return;}
  const [[count]]=await db.execute("SELECT COUNT(*) n FROM digitale_casa_prospects WHERE DATE(discovered_at-INTERVAL 3 HOUR)=DATE(UTC_TIMESTAMP()-INTERVAL 3 HOUR)");
  if(Number(count.n)>=100){console.log('CDD_META_DIARIA_ATINGIDA');return;}
  const [[week]]=await db.execute("SELECT COUNT(*) n FROM digitale_casa_prospects WHERE DATE(discovered_at-INTERVAL 3 HOUR)>=DATE(UTC_TIMESTAMP()-INTERVAL 3 HOUR)-INTERVAL WEEKDAY(UTC_TIMESTAMP()-INTERVAL 3 HOUR) DAY");
  if(Number(week.n)>=500){console.log('CDD_META_SEMANAL_ATINGIDA');return;}
  const [[limit]]=await db.execute("SELECT COUNT(*) n FROM digitale_casa_usage WHERE id=1 AND DATE(requests_date)=DATE(UTC_TIMESTAMP()-INTERVAL 3 HOUR) AND requests>=1");
  if(Number(limit.n)>0){console.log('CDD_TESTE_JA_EXECUTADO_HOJE');return;}
  const page=Number(usage.last_page||0)+1;
  const body={codigo_atividade_principal:['1412601','1411801','1411802','1413401','1413402','1420700'],uf:['sp'],situacao_cadastral:['ATIVA'],incluir_atividade_secundaria:false,mais_filtros:{com_email:true,com_telefone:true,excluir_email_contab:true},pagina:page,limite:30};
  // Registrar a tentativa ANTES da chamada para bloquear repeticao em caso de crash.
  await db.execute("UPDATE digitale_casa_usage SET requests=requests+1,requests_date=DATE(UTC_TIMESTAMP()-INTERVAL 3 HOUR),last_page=?,last_run_at=UTC_TIMESTAMP(6),last_status='CONSULTANDO' WHERE id=1",[page]);
  const data=await req('https://api.casadosdados.com.br/v5/cnpj/pesquisa?tipo_resultado=completo','POST',body);
  const rows=Array.isArray(data.cnpjs)?data.cnpjs:[];
  let valid=0,added=0,duplicate=0,miss=0;
  for(const r of rows){
   const cnpj=digit(r.cnpj);
   const uf=str(r.endereco?.uf||r.uf||'').toUpperCase();
   const cnae=cnaeOf(r);
   const situation=str(r.situacao_cadastral?.situacao_cadastral||r.situacao_cadastral||'').toUpperCase();
   const em=email(r),ph=phone(r),company=str(r.razao_social||r.nome_fantasia);
   if(!cnpjValid(cnpj)||uf!=='SP'||!cnaeMatches(cnae)||!situation.includes('ATIV')||!ph||!em||!company){miss++;continue;}
   valid++;
   const [result]=await db.execute("INSERT IGNORE INTO digitale_casa_prospects(cnpj,company,phone,email,cnae,uf,status) VALUES(?,?,?,?,?,'SP','A_VALIDAR')",[cnpj,company.slice(0,255),ph,em,cnae]);
   if(result.affectedRows)added++;else duplicate++;
  }
  await db.execute("UPDATE digitale_casa_usage SET last_status=?,last_run_at=UTC_TIMESTAMP(6),last_found=?,last_imported=?,last_duplicates=? WHERE id=1",[added>0?'CONCLUIDO':'SEM_CONTATOS_APROVEITAVEIS',rows.length,added,duplicate]);
  console.log('CDD_PESQUISA_FEITA page='+page+' retornados='+rows.length+' qualificados='+valid+' importados='+added+' duplicados='+duplicate+' nao_qualificados='+miss);
  if(rows.length&&valid===0){const first=rows[0]||{};console.log('CDD_ATENCAO_SEM_CONTATOS_COMPLETOS campos_de_empresa='+Object.keys(first).slice(0,35).join(',')+' campos_contato='+Object.keys(first.contato||{}).join(','));}
 }catch(error){
  await db.execute("UPDATE digitale_casa_usage SET last_status=?,last_run_at=UTC_TIMESTAMP(6) WHERE id=1",[str(error.message).slice(0,100)]).catch(()=>{});
  console.log('CDD_CONECTOR_ERRO '+str(error.message).slice(0,100));
  process.exitCode=2;
 }
}
main().finally(()=>db.end?.().catch?.(()=>{})).catch(e=>{console.error('CDD_INIT_ERROR '+String(e.code||e.name));process.exitCode=1});
