import fs from 'node:fs';
import path from 'node:path';
import {db} from './src/database.js';
const CID='a7c54ef2-b9a3-4a28-9d11-261116000001';
const input=JSON.parse(fs.readFileSync('./academia-digitale-content.json','utf8'));
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backupDir=path.join('/var/backups/portal-digitale','academia-'+stamp);
fs.mkdirSync(backupDir,{recursive:true,mode:0o700});
const [courses]=await db.execute('SELECT * FROM training_courses_v2 WHERE id=?',[CID]);
const [lessons]=await db.execute('SELECT * FROM training_lessons_v2 WHERE course_id=? ORDER BY sort_order',[CID]);
const [assessments]=await db.execute('SELECT a.* FROM training_assessments_v2 a JOIN training_lessons_v2 l ON l.id=a.lesson_id WHERE l.course_id=?',[CID]);
const [questions]=await db.execute('SELECT q.* FROM training_questions_v2 q JOIN training_assessments_v2 a ON a.id=q.assessment_id JOIN training_lessons_v2 l ON l.id=a.lesson_id WHERE l.course_id=? ORDER BY l.sort_order,q.sort_order',[CID]);
const [options]=await db.execute('SELECT o.* FROM training_question_options_v2 o JOIN training_questions_v2 q ON q.id=o.question_id JOIN training_assessments_v2 a ON a.id=q.assessment_id JOIN training_lessons_v2 l ON l.id=a.lesson_id WHERE l.course_id=? ORDER BY o.sort_order',[CID]);
fs.writeFileSync(path.join(backupDir,'course-before.json'),JSON.stringify({courses,lessons,assessments,questions,options},null,2),{mode:0o600});
for(const f of ['src/routes/training-v2.js','../src/pages/training/DigitaleCommercialCourse.tsx'])fs.copyFileSync(f,path.join(backupDir,path.basename(f)));
if(lessons.length!==10||questions.length!==20||options.length!==60)throw Error('Estrutura atual inesperada; nenhuma questão alterada.');
const [columns]=await db.execute("SHOW COLUMNS FROM training_questions_v2 LIKE 'explanation'");
if(!columns.length)await db.query('ALTER TABLE training_questions_v2 ADD COLUMN explanation TEXT NULL');
const connection=await db.getConnection();
try{
 await connection.beginTransaction();
 for(const item of input.lessons){
  const lesson=lessons.find(l=>l.sort_order===item.n);if(!lesson)throw Error('Aula ausente');
  const a=assessments.filter(a=>a.lesson_id===lesson.id&&a.type==='activity');if(a.length!==1)throw Error('Atividade ambígua');
  const qs=questions.filter(q=>q.assessment_id===a[0].id).sort((a,b)=>a.sort_order-b.sort_order);if(qs.length!==2)throw Error('Quantidade de questões inesperada');
  await connection.execute('UPDATE training_lessons_v2 SET title=? WHERE id=?',[item.title,lesson.id]);
  await connection.execute('UPDATE training_assessments_v2 SET title=?,passing_score=80 WHERE id=?',['Atividade '+String(item.n).padStart(2,'0')+' — '+item.title,a[0].id]);
  for(let i=0;i<2;i++){
   const question=item.questions[i];const old=qs[i];
   await connection.execute('UPDATE training_questions_v2 SET question_text=?,explanation=? WHERE id=?',[question.question,question.feedback,old.id]);
   const opts=options.filter(o=>o.question_id===old.id).sort((a,b)=>a.sort_order-b.sort_order);if(opts.length!==3)throw Error('Alternativas inesperadas');
   for(let k=0;k<3;k++)await connection.execute('UPDATE training_question_options_v2 SET option_text=?,is_correct=? WHERE id=?',[question.options[k],k===question.answer?1:0,opts[k].id]);
  }
 }
 await connection.commit();
 console.log(JSON.stringify({updated_lessons:10,activities:10,questions:20,options:60,explanations:20,backup:backupDir}));
}catch(e){await connection.rollback();throw e;}finally{connection.release();await db.end();}
