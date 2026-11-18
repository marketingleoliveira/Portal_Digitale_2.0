import assert from 'node:assert/strict';import crypto from 'node:crypto';import express from 'express';
import router,{ensureCommercialJourneySchema} from './src/routes/commercial-journey.js';
import {db} from './src/database.js';
import {COURSE,canAccess,examReady,advancePlayback,gradeAssessment} from './src/routes/commercial-rules.js';
let passed=0;const check=(label,fn)=>{fn();passed++;console.log('OK '+label);};
const sequence=Array.from({length:10},(_,i)=>({id:String(i+1),completed:i===0?1:0}));
check('próxima aula depende da atividade anterior',()=>{assert.equal(canAccess(sequence,'2'),true);assert.equal(canAccess(sequence,'3'),false);assert.equal(examReady(sequence),false);});
check('não aceita salto do início para o fim',()=>assert.throws(()=>advancePlayback({duration:120,position:0,watched:0,lastMs:0,startedMs:0},120,true,4000)));
check('interrupção longa invalida reprodução',()=>assert.throws(()=>advancePlayback({duration:120,position:0,watched:0,lastMs:0,startedMs:0},1,false,26000)));
check('reprodução integral contínua é aceita',()=>{let p={duration:120,position:0,watched:0,lastMs:0,startedMs:0},complete=false;for(let i=4;i<=120;i+=4){const n=advancePlayback(p,i,i===120,i*1000);p=n.payload;complete=n.complete;}assert.equal(complete,true);});
const bank=Array.from({length:20},(_,i)=>({id:'q'+i,options:[{id:'a'+i,is_correct:1},{id:'b'+i,is_correct:0}]}));
check('16 de 20 aprova; 15 de 20 reprova',()=>{const a=Object.fromEntries(bank.map((q,i)=>[q.id,(i<16?'a':'b')+i]));assert.equal(gradeAssessment(bank,a).passed,true);a.q15='b15';assert.equal(gradeAssessment(bank,a).passed,false);});
check('não aceita prova incompleta ou alternativa estrangeira',()=>{assert.throws(()=>gradeAssessment(bank,{}));assert.throws(()=>gradeAssessment(bank,Object.fromEntries(bank.map(q=>[q.id,'invalid']))));});
const user=crypto.randomUUID();let server;
try{
 await ensureCommercialJourneySchema();
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:user,role:req.headers['x-test-role']||'dev'};next();});app.use(router);
 server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base='http://127.0.0.1:'+server.address().port;
 async function call(path,body,expected=200,headers={}){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});const text=await r.text();assert.equal(r.status,expected,path+' '+text);return text&&r.headers.get('content-type')?.includes('json')?JSON.parse(text).data:null;}
 const state=await call('/state');const lessons=state.lessons;assert.equal(lessons.length,10);const first=lessons[0],second=lessons[1];
 await call('/state',undefined,403,{'x-test-role':'seller'});passed++;console.log('OK função não autorizada bloqueada');
 await call('/lessons/'+second.id+'/video/start',{},403);await call('/lessons/'+first.id+'/activity/start',{fullscreen:true},403);await call('/exam/start',{fullscreen:true},403);passed++;console.log('OK bloqueios de aula, atividade e prova antes dos requisitos');
 await call('/lessons/'+first.id+'/activity',{},409);passed++;console.log('OK endpoint antigo não permite responder diretamente');
 const video=await call('/lessons/'+first.id+'/video/start',{});await call('/sessions/'+video.id+'/pulse',{position:120,ended:true},409);await call('/sessions/'+video.id+'/interrupt',{});passed++;console.log('OK API rejeita conclusão de vídeo por salto');
 await db.execute('INSERT INTO training_commercial_video_progress_v3(user_id,lesson_id) VALUES (?,?)',[user,first.id]);
 await call('/lessons/'+first.id+'/activity/start',{fullscreen:false},400);
 let attempt=await call('/lessons/'+first.id+'/activity/start',{fullscreen:true});assert.equal(attempt.total,2);assert.ok(attempt.question.options.every(o=>!('is_correct' in o)));
 const [snapshot]=await db.execute('SELECT payload_json FROM training_commercial_sessions_v3 WHERE id=?',[attempt.id]);const payload=JSON.parse(snapshot[0].payload_json);
 await call('/sessions/'+attempt.id+'/answer',{question_id:payload.questions[1].id,option_id:payload.questions[1].options[0].id},400);passed++;console.log('OK questões não podem ser puladas e gabarito não é exposto');
 for(const q of payload.questions)attempt=await call('/sessions/'+attempt.id+'/answer',{question_id:q.id,option_id:q.options.find(o=>Number(o.is_correct)===1).id});
 assert.equal(attempt.passed,true);assert.equal(attempt.score,100);assert.equal(attempt.feedback.length,2);const after=await call('/state');assert.equal(after.lessons[0].completed,1);assert.equal(after.lessons[1].unlocked,true);passed++;console.log('OK atividade aprovada libera somente a próxima aula');
 let interrupted=await call('/lessons/'+first.id+'/activity/start',{fullscreen:true});await call('/sessions/'+interrupted.id+'/interrupt',{});await call('/sessions/'+interrupted.id+'/answer',{question_id:interrupted.question.id,option_id:interrupted.question.options[0].id},409);passed++;console.log('OK tentativa interrompida não recebe novas respostas');
 for(const l of lessons.slice(1))await db.execute('INSERT INTO training_lesson_progress_v2(user_id,lesson_id) VALUES (?,?)',[user,l.id]);
 const final=await call('/exam/start',{fullscreen:true});assert.equal(final.total,20);const [snap]=await db.execute('SELECT payload_json FROM training_commercial_sessions_v3 WHERE id=?',[final.id]);const finalPayload=JSON.parse(snap[0].payload_json);
 let outcome;for(let i=0;i<20;i++){const q=finalPayload.questions[i],o=q.options.find(o=>i<16?Number(o.is_correct)===1:Number(o.is_correct)!==1);outcome=await call('/sessions/'+final.id+'/answer',{question_id:q.id,option_id:o.id});}
 assert.equal(outcome.score,80);assert.equal(outcome.passed,true);assert.equal((await call('/state')).exam.passed,true);passed++;console.log('OK prova de 20 questões aprova 16 acertos e registra resultado');
 console.log(JSON.stringify({passed,scope:'regras e integração HTTP local',real_user_progress_changed:false}));
}finally{
 if(server)await new Promise(resolve=>server.close(resolve));
 await db.execute('DELETE FROM training_commercial_sessions_v3 WHERE user_id=? AND course_id=?',[user,COURSE]);
 await db.execute('DELETE FROM training_commercial_video_progress_v3 WHERE user_id=?',[user]);
 await db.execute('DELETE FROM training_lesson_progress_v2 WHERE user_id=?',[user]);
 await db.end();
}
