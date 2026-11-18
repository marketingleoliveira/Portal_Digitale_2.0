export const COURSE='a7c54ef2-b9a3-4a28-9d11-261116000001';
export const PASS=80;
export const MAX_QUESTIONS=20;
export const SESSION_GAP_MS=25000;
export const VIDEO_SECONDS=[123.14,120.129,120.248,120.157,120.23,120.226,120.239,120.147,120.174,120.229];
export function canAccess(lessons,lessonId){const i=lessons.findIndex(l=>l.id===lessonId);return i>=0&&lessons.slice(0,i).every(l=>Boolean(Number(l.completed)));}
export function examReady(lessons){return lessons.length===10&&lessons.every(l=>Boolean(Number(l.completed)));}
export function advancePlayback(payload,position,ended,now){
 const delta=(now-payload.lastMs)/1000;
 if(!Number.isFinite(position)||position<0||position>payload.duration+1)throw Error('INVALID_POSITION');
 if(delta<0||delta>SESSION_GAP_MS/1000)throw Error('INTERRUPTED');
 const moved=position-payload.position;
 if(moved<-.6||moved>delta*1.3+1.5)throw Error('SEEK_NOT_ALLOWED');
 const watched=Math.min(payload.duration,payload.watched+Math.min(Math.max(0,moved),delta+.75));
 const next={...payload,position,watched,lastMs:now};
 const complete=ended===true&&position>=payload.duration-.8&&watched>=payload.duration-2&&(now-payload.startedMs)/1000>=payload.duration-2;
 return {payload:next,complete};
}
export function gradeAssessment(questions,answers,passing=PASS){
 if(!questions.length||questions.length>MAX_QUESTIONS)throw Error('INVALID_QUESTION_COUNT');
 if(questions.some(q=>!q.options.some(o=>o.id===answers[q.id])))throw Error('INCOMPLETE_ANSWERS');
 const correct=questions.filter(q=>q.options.some(o=>o.id===answers[q.id]&&Number(o.is_correct)===1)).length;
 const score=100*correct/questions.length;
 return {correct,total:questions.length,score,passed:score>=passing};
}
