import fs from 'node:fs';import crypto from 'node:crypto';
import {db} from './src/database.js';
const COURSE='a7c54ef2-b9a3-4a28-9d11-261116000001';
const bank=JSON.parse(fs.readFileSync('./commercial-exam-bank.json','utf8'));
if(bank.length!==20||bank.some(q=>q.options.length!==3||q.answer<0||q.answer>2))throw Error('Banco da prova inválido');
const [existing]=await db.execute("SELECT id FROM training_assessments_v2 WHERE course_id=? AND type='exam' AND lesson_id IS NULL",[COURSE]);
if(existing.length)throw Error('Já existe uma prova final neste curso; revisão necessária antes de alterar.');
const backup='/var/backups/portal-digitale/commercial-stages-20261116';fs.mkdirSync(backup,{recursive:true,mode:0o700});
const [a]=await db.execute('SELECT * FROM training_assessments_v2 WHERE course_id=?',[COURSE]);fs.writeFileSync(backup+'/assessments-before.json',JSON.stringify(a,null,2),{mode:0o600});
const c=await db.getConnection();try{
 await c.beginTransaction();const assessment=crypto.randomUUID();
 await c.execute("INSERT INTO training_assessments_v2(id,course_id,lesson_id,title,type,passing_score,sort_order) VALUES (?,?,NULL,?,'exam',80,99)",[assessment,COURSE,'Prova final — Método Comercial Digitale']);
 for(let i=0;i<bank.length;i++){
  const q=bank[i],id=crypto.randomUUID();
  await c.execute('INSERT INTO training_questions_v2(id,assessment_id,question_text,explanation,sort_order) VALUES (?,?,?,?,?)',[id,assessment,q.question,q.explanation,i+1]);
  for(let j=0;j<q.options.length;j++)await c.execute('INSERT INTO training_question_options_v2(id,question_id,option_text,is_correct,sort_order) VALUES (?,?,?,?,?)',[crypto.randomUUID(),id,q.options[j],j===q.answer?1:0,j+1]);
 }
 await c.commit();console.log(JSON.stringify({assessment,questions:20,topics:10,passing_score:80}));
}catch(e){await c.rollback();throw e;}finally{c.release();await db.end();}
