export const STATES = {AC:'Acre',AL:'Alagoas',AP:'Amapá',AM:'Amazonas',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MT:'Mato Grosso',MS:'Mato Grosso do Sul',MG:'Minas Gerais',PA:'Pará',PB:'Paraíba',PR:'Paraná',PE:'Pernambuco',PI:'Piauí',RJ:'Rio de Janeiro',RN:'Rio Grande do Norte',RS:'Rio Grande do Sul',RO:'Rondônia',RR:'Roraima',SC:'Santa Catarina',SP:'São Paulo',SE:'Sergipe',TO:'Tocantins'};
export const DEFAULT_SETTINGS = Object.freeze({enabled:true,inactivity_months:3,hourly_target:16,daily_target:160,states:['SP'],segments:['moda fitness','moda praia','moda esportiva','moda íntima','vestuário','lingerie','uniformes']});
export function validateSettings(input) {
  const months=input?.inactivity_months===undefined?3:input.inactivity_months;
  if(!Number.isInteger(months)||months<1||months>60)throw Error('O prazo de inatividade deve ser de 1 a 60 meses.');
  if(typeof input?.enabled!=='boolean')throw Error('Informe se a prospecção está ativa.');
  if(!Number.isInteger(input.hourly_target)||input.hourly_target<1||input.hourly_target>100)throw Error('A quantidade por hora deve ser de 1 a 100.');
  if(!Number.isInteger(input.daily_target)||input.daily_target<1||input.daily_target>1000||input.daily_target<input.hourly_target)throw Error('A quantidade diária deve ser de 1 a 1.000 e não pode ser menor que a quantidade por hora.');
  if(!Array.isArray(input.states)||!input.states.length||input.states.length>27||input.states.some(uf=>!Object.hasOwn(STATES,uf)))throw Error('Selecione pelo menos um estado válido.');
  if(!Array.isArray(input.segments)||!input.segments.length||input.segments.length>20||input.segments.some(s=>typeof s!=='string'||s.trim().length<2||s.trim().length>80||/[\r\n\x00-\x1f]/.test(s)))throw Error('Informe de 1 a 20 segmentos, com 2 a 80 caracteres cada.');
  return {enabled:input.enabled,inactivity_months:months,hourly_target:input.hourly_target,daily_target:input.daily_target,states:[...new Set(input.states)].sort(),segments:[...new Set(input.segments.map(s=>s.trim()))]};
}
export async function getSettings(connection) {
  const [rows]=await connection.execute('SELECT settings FROM digitale_ai_settings WHERE id=1');
  if(!rows.length)return {...DEFAULT_SETTINGS};
  return validateSettings(typeof rows[0].settings==='string'?JSON.parse(rows[0].settings):rows[0].settings);
}
export function matchesRegion(registry,settings=DEFAULT_SETTINGS) {
  return settings.states.includes(String(registry?.uf||'').trim().toUpperCase());
}
