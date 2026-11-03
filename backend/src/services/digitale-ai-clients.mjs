import {getSettings} from './digitale-ai-settings.mjs';
import {normCnpj,validCnpj} from './prospecting-verification.mjs';
// Configured calendar months, clamped to the last day of the destination month.
export function inactivityCutoff(now=new Date(),months=3) {
  if(!Number.isInteger(months)||months<1||months>60)throw Error('invalid_inactivity_months');
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get=k=>Number(parts.find(p=>p.type===k).value);
  const target=new Date(Date.UTC(get('year'),get('month')-1-months,1));
  const day=Math.min(get('day'),new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate());
  target.setUTCDate(day);return target.toISOString().slice(0,10);
}
export function parseOrderDate(value,now=new Date()) {
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const raw=String(value).trim();let iso=raw;
  const br=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);if(br)iso=`${br[3]}-${br[2]}-${br[1]}`;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))throw Error('Data inválida: use DD/MM/AAAA ou AAAA-MM-DD.');
  const date=new Date(iso+'T12:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==iso)throw Error('Data do último pedido inválida.');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  if(iso>today)throw Error('O último pedido não pode estar no futuro.');return iso;
}
export function clientStatus(date,now=new Date(),months=3) {return !date?'unknown':date<inactivityCutoff(now,months)?'inactive':'active';}
export function parseAverageTicket(value) {
  if(value===null||value===undefined||String(value).trim()==='')return null;
  if(typeof value==='number'){if(!Number.isFinite(value)||value<0||value>9999999999999.99)throw Error('Ticket médio fora do limite.');return Math.round((value+Number.EPSILON)*100)/100;}
  let text=String(value).trim().replace(/^R\$\s*/i,'').replace(/\s/g,'');
  if(typeof value==='string'&&text.includes(','))text=text.replace(/\./g,'').replace(',','.');
  if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw Error('Ticket médio inválido: informe um valor monetário positivo ou zero.');
  const number=Number(text);if(!Number.isFinite(number)||number>9999999999999.99)throw Error('Ticket médio fora do limite.');return number;
}
export function validateClientRows(rows,now=new Date()) {
  if(!Array.isArray(rows)||!rows.length||rows.length>10000)throw Error('Importe de 1 a 10.000 linhas por arquivo.');
  const errors=[],byCnpj=new Map();let repeated=0;
  rows.forEach((row,index)=>{
    try {
      const cnpj=normCnpj(row?.cnpj);if(!validCnpj(cnpj))throw Error('CNPJ inválido.');
      const name=String(row?.name||'').trim();if(!name||name.length>200)throw Error('Informe o nome do cliente (até 200 caracteres).');
      const date=parseOrderDate(row.last_order_date,now),average_ticket=parseAverageTicket(row.average_ticket),old=byCnpj.get(cnpj);
      if(old){repeated++;if(date&&(!old.last_order_date||date>old.last_order_date))byCnpj.set(cnpj,{cnpj,name,last_order_date:date,average_ticket});}
      else byCnpj.set(cnpj,{cnpj,name,last_order_date:date,average_ticket});
    }catch(e){errors.push({index,row:Number.isInteger(row?.source_row)&&row.source_row>=2&&row.source_row<=10050?row.source_row:index+2,message:e.message});}
  });
  return {rows:[...byCnpj.values()],errors,repeated,total:rows.length};
}
export async function refreshClientStatuses(connection,now=new Date()) {
  const {inactivity_months}=await getSettings(connection);
  await connection.execute("UPDATE digitale_ai_clients SET status=CASE WHEN last_order_date IS NULL THEN 'unknown' WHEN last_order_date<? THEN 'inactive' ELSE 'active' END,updated_at=UTC_TIMESTAMP(6) WHERE status<>CASE WHEN last_order_date IS NULL THEN 'unknown' WHEN last_order_date<? THEN 'inactive' ELSE 'active' END",[inactivityCutoff(now,inactivity_months),inactivityCutoff(now,inactivity_months)]);
}
