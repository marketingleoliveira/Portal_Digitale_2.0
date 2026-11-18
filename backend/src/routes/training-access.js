import {db} from '../database.js';
export const DEFAULT_ACCESS=Object.freeze({mode:'roles',roles:['vendedor','dev','diretoria','gerente'],users:[]});
const LEGACY_ACCESS=Object.freeze({mode:'dev',roles:[],users:[]});
export const ROLE_GROUPS=Object.freeze({comercial:['vendedor','sdr'],vendedor:['vendedor'],sdr:['sdr'],diretoria:['diretoria'],gerente:['gerente'],admin:['admin'],criacao:['criacao'],marketing:['marketing'],financeiro:['financeiro'],gestao:['admin','gerente','diretoria'],qualidade:['qualidade'],dev:['dev']});
export function parseAccess(raw){
 try{const p=typeof raw==='string'?JSON.parse(raw):raw;if(p&&['dev','all','roles','users'].includes(p.mode)&&Array.isArray(p.roles)&&Array.isArray(p.users))return p;}catch{}
 return LEGACY_ACCESS;
}
export function canAccessCourse(user,course){
 if(!user?.id||!course||course.status!=='published')return false;
 if(user.role==='dev')return true;
 const p=parseAccess(course.access_policy_json);
 return p.mode==='all'||(p.mode==='roles'&&p.roles.some(g=>ROLE_GROUPS[g]?.includes(user.role)))||(p.mode==='users'&&p.users.includes(user.id));
}
export async function requireCourseAccess(user,id,connection=db){
 const [rows]=await connection.execute('SELECT id,status,access_policy_json FROM training_courses_v2 WHERE id=?',[id]);
 return canAccessCourse(user,rows[0]);
}
const invalid=message=>Object.assign(Error(message),{status:400});
export async function normalizeAccess(input,base=DEFAULT_ACCESS){
 if(input===undefined)return parseAccess(base);
 if(!input||!['dev','all','roles','users'].includes(input.mode))throw invalid('Selecione a disponibilidade do treinamento.');
 const roles=input.mode==='roles'&&Array.isArray(input.roles)?[...new Set(input.roles)]:[];
 const users=input.mode==='users'&&Array.isArray(input.users)?[...new Set(input.users)]:[];
 if(input.mode==='roles'&&(!roles.length||roles.some(r=>!Object.hasOwn(ROLE_GROUPS,r))))throw invalid('Selecione cargos autorizados.');
 if(input.mode==='users'){
  if(!users.length||users.length>1000||users.some(id=>typeof id!=='string'||!(/^[a-f0-9-]{36}$/i.test(id))))throw invalid('Selecione usuários autorizados.');
  const [rows]=await db.query('SELECT u.id FROM system_users u JOIN profiles p ON p.id=u.id WHERE u.disabled=0 AND p.is_active=1 AND u.id IN (?)',[users]);
  if(rows.length!==users.length)throw invalid('Há usuários indisponíveis. Atualize a seleção.');
 }
 return {mode:input.mode,roles,users};
}
