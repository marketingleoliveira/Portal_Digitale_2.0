export const normalizeHeader=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export const isClientNameHeader=(s:string)=>['nome','cliente','nomecliente','nomedocliente','razaosocial','nomefantasia','empresa'].includes(s);
export const isLastPurchaseHeader=(s:string)=>s.includes('ultimopedido')||s.includes('ultimacompra');
function decodeText(buffer:ArrayBuffer){
  try{return new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{return new TextDecoder('windows-1252').decode(buffer);}
}
export async function readClientSpreadsheet(buffer:ArrayBuffer){
  const bytes=new Uint8Array(buffer),prefix=new TextDecoder().decode(bytes.slice(0,8192));
  const tables:{name:string;rows:unknown[][]}[]=[];
  let source='excel';
  if(/<(?:!doctype\s+html|html|table)\b/i.test(prefix)){
    source='html';
    const doc=new DOMParser().parseFromString(decodeText(buffer),'text/html');
    Array.from(doc.querySelectorAll('table')).forEach((table,index)=>{
      const rows=Array.from(table.querySelectorAll('tr')).filter(row=>row.closest('table')===table).map(row=>Array.from(row.children).filter(cell=>['TD','TH'].includes(cell.tagName)).map(cell=>(cell.textContent||'').replace(/\s+/g,' ').trim())).filter(row=>row.some(Boolean));
      if(rows.length)tables.push({name:`Tabela ${index+1}`,rows});
    });
  }else{
    const XLSX=await import('xlsx');
    const binary=bytes[0]===0x50&&bytes[1]===0x4b||bytes[0]===0xd0&&bytes[1]===0xcf;
    const workbook=binary?XLSX.read(buffer,{type:'array',cellDates:false,raw:true}):XLSX.read(decodeText(buffer),{type:'string',cellDates:false,raw:true});
    for(const name of workbook.SheetNames)tables.push({name,rows:XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name],{header:1,defval:'',blankrows:false,raw:true})});
  }
  const candidates=tables.flatMap(table=>table.rows.slice(0,20).map((row,index)=>{
    const normalized=row.map(value=>normalizeHeader(String(value||'')));
    return normalized.some(s=>s.includes('cnpj'))&&normalized.some(isClientNameHeader)?{...table,rows:table.rows.slice(index),headerLine:index+1}:null;
  }).filter(Boolean));
  const selected=candidates.sort((a,b)=>b.rows.length-a.rows.length)[0]||tables.find(t=>t.rows.length>1);
  if(!selected||selected.rows.length<2)throw Error('Não foi encontrada uma tabela de clientes com cabeçalho e dados.');
  if(selected.rows.length>10001)throw Error('Importe até 10.000 clientes por arquivo.');
  return {headers:selected.rows[0].map((v,i)=>String(v||`Coluna ${i+1}`)),rows:selected.rows.slice(1),source,table:selected.name};
}
