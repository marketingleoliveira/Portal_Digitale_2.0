// Execute no diretório backend do Portal, depois de transferir a pasta videos.
// Mantém o armazenamento privado e as permissões já existentes do treinamento.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {db} from './src/database.js';
import {config} from './src/config.js';
const CID='a7c54ef2-b9a3-4a28-9d11-261116000001';
const source=path.resolve(process.argv[2]||'/var/lib/portal-digitale/academia-import/videos');
const storage=path.join(config.uploadDir,'training-private');
fs.mkdirSync(storage,{recursive:true,mode:0o700});
const backup='/var/backups/portal-digitale/academia-videos-'+new Date().toISOString().replace(/[:.]/g,'-');
fs.mkdirSync(backup,{recursive:true,mode:0o700});
const [lessons]=await db.execute('SELECT id,title,sort_order FROM training_lessons_v2 WHERE course_id=? ORDER BY sort_order',[CID]);
if(lessons.length!==10||lessons.some((l,i)=>l.sort_order!==i+1))throw Error('Estrutura de aulas inesperada');
const [before]=await db.execute('SELECT m.* FROM training_materials_v2 m JOIN training_lessons_v2 l ON l.id=m.lesson_id WHERE l.course_id=?',[CID]);
fs.writeFileSync(path.join(backup,'materials-before.json'),JSON.stringify(before,null,2),{mode:0o600});
const plan=lessons.map(l=>{
 const name='Aula'+String(l.sort_order).padStart(2,'0')+'_Digitale.mp4';
 const file=path.join(source,name);if(!fs.existsSync(file))throw Error('Arquivo ausente: '+name);
 const stat=fs.statSync(file);if(!stat.isFile()||stat.size<100000)throw Error('Arquivo inválido: '+name);
 const bytes=Buffer.alloc(12);const fd=fs.openSync(file,'r');fs.readSync(fd,bytes,0,12,0);fs.closeSync(fd);if(bytes.toString('ascii',4,8)!=='ftyp')throw Error('Formato inválido: '+name);
 const existing=before.filter(m=>m.lesson_id===l.id&&m.original_name===name);if(existing.length>1)throw Error('Materiais duplicados: '+name);
 return {lesson:l,file,name,size:stat.size,existing:existing[0],stored:crypto.randomUUID()+'.mp4'};
});
const c=await db.getConnection();
try{
 await c.beginTransaction();
 for(const item of plan){
  if(item.existing){const old=path.join(storage,path.basename(item.existing.stored_name));if(fs.existsSync(old))fs.copyFileSync(old,path.join(backup,path.basename(old)));}
  const destination=path.join(storage,item.stored);fs.copyFileSync(item.file,destination);fs.chmodSync(destination,0o600);
  if(item.existing)await c.execute('UPDATE training_materials_v2 SET stored_name=?,mime_type=?,file_size=? WHERE id=?',[item.stored,'video/mp4',item.size,item.existing.id]);
  else await c.execute('INSERT INTO training_materials_v2(id,lesson_id,original_name,stored_name,mime_type,file_size) VALUES (?,?,?,?,?,?)',[crypto.randomUUID(),item.lesson.id,item.name,item.stored,'video/mp4',item.size]);
 }
 await c.commit();console.log(JSON.stringify({course:CID,videos:plan.length,private_storage:true,backup}));
}catch(e){await c.rollback();throw e;}finally{c.release();await db.end();}
