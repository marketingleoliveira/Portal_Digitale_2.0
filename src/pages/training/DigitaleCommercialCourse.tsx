import {useCallback,useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Card,CardContent} from '@/components/ui/card';
import {ArrowLeft,CheckCircle2,LockKeyhole,PlayCircle,ClipboardCheck,Award,Maximize} from 'lucide-react';
import TrainingFocusedVideo from './TrainingFocusedVideo';
type Lesson={id:string;title:string;sort_order:number;completed:number;video_completed:boolean;unlocked:boolean;activity_score?:number|string|null};
type Policy={require_fullscreen:boolean;detect_tab_change:boolean;detect_navigation:boolean;prevent_copy:boolean;shuffle_questions:boolean;shuffle_options:boolean;detect_fast_answers:boolean;prevent_multiple_sessions:boolean;seconds_per_question:number};
type Journey={settings:Policy;lessons:Lesson[];exam:{available:boolean;total:number;passing:number;passed:boolean;score:number|null}};
type Attempt={settings:Policy;remaining_ms:number|null;id:string;kind:'activity'|'exam';title:string;index:number;total:number;question:{id:string;text:string;options:{id:string;text:string}[]}};
type Result={completed:true;kind:'activity'|'exam';score:number;correct:number;total:number;passing?:number;passed:boolean;feedback:{question:string;correct:boolean;correct_answer:string;explanation:string}[]};
const BASE='/api/training-v2/commercial-course';
export default function DigitaleCommercialCourse({token,onBack,canDevSkip=false}:{token:string;onBack:()=>void;canDevSkip?:boolean}){
 const [journey,setJourney]=useState<Journey|null>(null),[active,setActive]=useState(''),[phase,setPhase]=useState<'video'|'activity'>('video');
 const [videoUrl,setVideoUrl]=useState(''),[videoLoading,setVideoLoading]=useState(false);
 const [attempt,setAttempt]=useState<Attempt|null>(null),[selected,setSelected]=useState(''),[result,setResult]=useState<Result|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const policyRef=useRef<Policy|null>(null),[remaining,setRemaining]=useState<number|null>(null);
 const root=useRef<HTMLDivElement>(null),attemptRef=useRef(''),mounted=useRef(true),finishing=useRef(false),busyRef=useRef(false);
 const api=useCallback(async(path:string,body?:unknown)=>{
  const r=await fetch('/api/training-v2'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error?.message||'Não foi possível carregar o treinamento.');return j.data;
 },[token]);
 const call=useCallback((path:string,body?:unknown)=>api('/commercial-course'+path,body),[api]);
 const refresh=useCallback(async()=>{const j:Journey=await call('/state');if(mounted.current)setJourney(j);return j;},[call]);
 const exitScreen=()=>{if(document.fullscreenElement===root.current)void document.exitFullscreen().catch(()=>{});};
 const stop=useCallback((reason:string,update=true)=>{
  const id=attemptRef.current;attemptRef.current='';finishing.current=false;
  if(id)void fetch(BASE+'/sessions/'+id+'/interrupt',{method:'POST',keepalive:true,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({reason})}).catch(()=>{});
  if(update&&mounted.current){setAttempt(null);setSelected('');setBusy(false);busyRef.current=false;setError('A tentativa foi interrompida. Inicie novamente.');}
  if(document.fullscreenElement===root.current)void document.exitFullscreen().catch(()=>{});
 },[token]);
 useEffect(()=>{
  mounted.current=true;let live=true;
  refresh().then(j=>{if(!live)return;const next=j.lessons.find(l=>!l.completed);setActive(next?.id||'exam');setPhase(next?.video_completed?'activity':'video');}).catch(e=>{if(live)setError(e.message)});
  return()=>{live=false;mounted.current=false;stop('SAIDA_DA_AULA',false);};
 },[refresh,stop]);
 useEffect(()=>{
  if(!active||active==='exam'||phase!=='video'){setVideoUrl('');return;}
  let live=true;setVideoLoading(true);setVideoUrl('');
  api('/lessons/'+active+'/materials').then(async(items:{id:string;original_name:string;mime_type:string}[])=>{
   const m=items.find(i=>i.mime_type?.startsWith('video/')&&/^Aula\d{2}_Digitale/.test(i.original_name));if(!m)throw Error('O vídeo desta aula está indisponível.');
   const p=await api('/materials/'+m.id+'/preview-ticket');if(live)setVideoUrl(p.url);
  }).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setVideoLoading(false)});return()=>{live=false;};
 },[active,phase,api]);
 useEffect(()=>{
  // Best-effort capture deterrent: obscure synchronously before interrupting.
  const conceal=()=>{
   const target=root.current;if(!target)return;
   target.style.setProperty('background','#000','important');
   target.style.setProperty('color','#000','important');
   const content=target.querySelector<HTMLElement>('[data-protected-assessment]');
   if(content)content.style.visibility='hidden';
   const shield=document.createElement('div');
   shield.setAttribute('aria-hidden','true');
   shield.style.cssText='position:fixed;inset:0;background:#000;z-index:2147483647;pointer-events:none';
   document.body.appendChild(shield);
   if(document.fullscreenElement===target)target.appendChild(shield);
   window.setTimeout(()=>{shield.remove();target.style.removeProperty('background');target.style.removeProperty('color');},1200);
  };
  const violation=(reason:string)=>{if(attemptRef.current){conceal();stop(reason);}};
  const visibility=()=>{if(document.hidden&&policyRef.current?.detect_tab_change)violation('TROCA_DE_ABA');};
  const fullscreen=()=>{if(policyRef.current?.require_fullscreen&&document.fullscreenElement!==root.current)violation('SAIDA_TELA_CHEIA');};
  const blur=()=>{if(policyRef.current?.detect_tab_change)violation('PERDA_DE_FOCO');};
  const leave=()=>{if(policyRef.current?.detect_navigation)violation('SAIDA_DA_PAGINA');};
  const key=(e:KeyboardEvent)=>{
   if(!attemptRef.current||!policyRef.current?.prevent_copy)return;
   const k=e.key.toLowerCase();
   const capture=k==='printscreen'||e.code==='PrintScreen'||(e.metaKey&&e.shiftKey&&['s','3','4','5'].includes(k))||((e.ctrlKey||e.metaKey)&&k==='p');
   if(capture){e.preventDefault();e.stopImmediatePropagation();violation('TENTATIVA_DE_CAPTURA');return;}
   if((e.ctrlKey||e.metaKey)&&['c','v','x','s'].includes(k))e.preventDefault();
  };
  const printing=()=>{if(policyRef.current?.prevent_copy)violation('TENTATIVA_DE_IMPRESSAO');};
  const prevent=(e:Event)=>{if(attemptRef.current&&policyRef.current?.prevent_copy)e.preventDefault();};
  document.addEventListener('visibilitychange',visibility);document.addEventListener('fullscreenchange',fullscreen);
  document.addEventListener('keydown',key,true);document.addEventListener('keyup',key,true);window.addEventListener('beforeprint',printing);for(const event of ['copy','cut','paste','contextmenu'])document.addEventListener(event,prevent,true);
  window.addEventListener('blur',blur);window.addEventListener('pagehide',leave);window.addEventListener('beforeunload',leave);window.addEventListener('popstate',leave);
  const timer=window.setInterval(()=>{const id=attemptRef.current;if(!id)return;void call('/sessions/'+id+'/pulse',{}).catch(()=>{if(attemptRef.current===id&&!finishing.current)stop('CONEXAO_INTERROMPIDA');});},5000);
  return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('fullscreenchange',fullscreen);document.removeEventListener('keydown',key,true);document.removeEventListener('keyup',key,true);window.removeEventListener('beforeprint',printing);for(const event of ['copy','cut','paste','contextmenu'])document.removeEventListener(event,prevent,true);window.removeEventListener('blur',blur);window.removeEventListener('pagehide',leave);window.removeEventListener('beforeunload',leave);window.removeEventListener('popstate',leave);};
 },[call,stop]);
 const lesson=journey?.lessons.find(l=>l.id===active),isExam=active==='exam',done=journey?.lessons.filter(l=>l.completed).length||0;
 const choose=(l:Lesson)=>{if(!l.unlocked)return;setActive(l.id);setPhase(l.completed?'video':l.video_completed?'activity':'video');setResult(null);setError('');};
 const start=async()=>{
  if(busyRef.current||(!isExam&&lesson?.completed))return;busyRef.current=true;setBusy(true);setError('');setResult(null);
  try{
   const policy=journey?.settings;if(!policy)throw Error('Configurações indisponíveis. Atualize a página.');
   if(policy.require_fullscreen){if(!root.current?.requestFullscreen)throw Error('Este navegador não oferece a tela cheia necessária.');await root.current.requestFullscreen();if(document.fullscreenElement!==root.current)throw Error('Permita a tela cheia para iniciar.');}
   const data:Attempt=await call(isExam?'/exam/start':'/lessons/'+active+'/activity/start',{fullscreen:document.fullscreenElement===root.current});
   policyRef.current=data.settings;
   if((data.settings.require_fullscreen&&document.fullscreenElement!==root.current)||(data.settings.detect_tab_change&&document.hidden)){attemptRef.current=data.id;stop('SAIDA_AO_INICIAR');return;}
   attemptRef.current=data.id;setAttempt(data);setSelected('');finishing.current=false;
  }catch(e:any){setError(e.message);exitScreen();}finally{if(mounted.current){setBusy(false);busyRef.current=false;}}
 };
 const answer=async()=>{
  if(!attempt||!selected||busyRef.current)return;
  busyRef.current=true;finishing.current=true;setBusy(true);setError('');const id=attempt.id;
  try{
   if((attempt.settings.require_fullscreen&&document.fullscreenElement!==root.current)||(attempt.settings.detect_tab_change&&document.hidden)){finishing.current=false;stop('SAIDA_TELA_CHEIA');return;}
   const data:Attempt|Result=await call('/sessions/'+id+'/answer',{question_id:attempt.question.id,option_id:selected});
   if(attemptRef.current!==id)return;
   if('completed' in data){attemptRef.current='';setAttempt(null);setSelected('');setResult(data);exitScreen();await refresh();}
   else{setAttempt(data);setSelected('');}
  }catch(e:any){if(attemptRef.current===id){finishing.current=false;stop('ERRO_NA_TENTATIVA');setError(e.message);}}
  finally{finishing.current=false;if(mounted.current){setBusy(false);busyRef.current=false;}}
 };
 useEffect(()=>{
  if(!attempt||attempt.remaining_ms==null){setRemaining(null);return;}
  const deadline=Date.now()+attempt.remaining_ms;
  const tick=()=>{const left=Math.max(0,deadline-Date.now());setRemaining(Math.ceil(left/1000));if(left===0&&attemptRef.current===attempt.id&&!finishing.current)stop('TEMPO_ESGOTADO');};
  tick();const timer=window.setInterval(tick,250);return()=>window.clearInterval(timer);
 },[attempt,stop]);
 const videoDone=async()=>{await refresh();if(mounted.current){setPhase('activity');setError('');}};
 const continueCourse=()=>{setResult(null);setError('');if(isExam)return;const next=journey?.lessons.find(l=>l.sort_order===(lesson?.sort_order||0)+1);if(next){setActive(next.id);setPhase(next.video_completed?'activity':'video');}else setActive('exam');};
 const title=lesson?.title||'Prova final — Método Comercial Digitale';
 return <div ref={root} className={attempt?'bg-white text-[#20364C] min-h-screen overflow-y-auto p-5 md:p-12 '+(attempt.settings.prevent_copy?'select-none':''):'space-y-5'}>
  {attempt?<div data-protected-assessment className="max-w-3xl mx-auto space-y-6">
   {attempt.settings.prevent_copy&&<style>{'@media print { body:has([data-protected-assessment]) * { visibility:hidden !important; } }'}</style>}
   <div className="flex justify-between gap-4 items-start"><div><p className="uppercase tracking-widest text-xs text-slate-500">Academia Digitale · {attempt.kind==='exam'?'Prova final':'Atividade protegida'}</p><h1 className="text-xl md:text-2xl mt-3">{attempt.title}</h1></div><span className="text-sm shrink-0">{attempt.index+1} / {attempt.total}{remaining!==null?' · '+remaining+'s':''}</span></div>
   <div className="h-1 bg-slate-100 rounded"><div className="h-full bg-[#DE8437] rounded transition-all" style={{width:100*(attempt.index+1)/attempt.total+'%'}}/></div>
   <fieldset className="space-y-3"><legend className="text-lg md:text-xl leading-relaxed mb-5">{attempt.question.text}</legend>{attempt.question.options.map(o=><label key={o.id} className={'flex items-start gap-3 p-4 rounded-xl border cursor-pointer '+(selected===o.id?'border-[#DE8437] bg-orange-50':'border-slate-200 hover:bg-slate-50')}><input type="radio" name={attempt.question.id} checked={selected===o.id} onChange={()=>setSelected(o.id)} disabled={busy} className="mt-1 accent-[#DE8437]"/><span>{o.text}</span></label>)}</fieldset>
   <Button className="bg-[#DE8437] hover:bg-[#C7732E] text-white" disabled={!selected||busy} onClick={()=>void answer()}>{busy?'Salvando…':attempt.index+1===attempt.total?'Finalizar avaliação':'Confirmar e continuar'}</Button>
   <p className="text-xs text-slate-500">{attempt.settings.require_fullscreen?'Mantenha a tela cheia. ':''}{attempt.settings.detect_tab_change?'Mantenha esta aba ativa. ':''}{attempt.settings.prevent_copy?'Cópia, colagem e captura detectada são restringidas. ':''}A avaliação segue as regras deste treinamento.</p>
  </div>:<>
   <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2"/>Voltar aos treinamentos</Button>
   <div><p className="text-xs tracking-widest text-slate-500 uppercase">Academia Digitale · Jornada comercial</p><h1 className="text-2xl font-semibold mt-2">Método Comercial Digitale</h1><p className="text-sm text-slate-500 mt-2">10 aulas · vídeo e atividade em etapas · prova final{journey?' de '+journey.exam.total+' questões':''}</p></div>
   {error&&<p role="alert" className="text-sm text-red-800 bg-red-50 p-4 rounded-lg">{error}</p>}
   {!journey?<p>Carregando jornada…</p>:<>
    <Card><CardContent className="p-5"><div className="flex justify-between text-sm"><span>{done} de 10 aulas concluídas</span><span>{journey.exam.passed?'Prova final aprovada':isExam?'Prova final':`Etapa ${((lesson?.sort_order||1)-1)*2+(phase==='video'?1:2)} de 21`}</span></div><div className="h-2 bg-slate-100 rounded mt-3"><div className="h-full bg-[#DE8437] rounded transition-all" style={{width:(done*2+(journey.exam.passed?1:0))/21*100+'%'}}/></div></CardContent></Card>
    <div className="grid xl:grid-cols-[minmax(0,1fr)_290px] gap-5">
     <div className="space-y-5"><Card><CardContent className="p-6 md:p-8 space-y-5">
      <div className="text-xs uppercase tracking-widest text-slate-500">{isExam?'Última etapa':`Aula ${String(lesson?.sort_order).padStart(2,'0')} · ${phase==='video'?'1. Vídeo':'2. Atividade'}`}</div><h2 className="text-xl font-semibold text-[#20364C]">{title}</h2>
      {result?<div className="space-y-4"><div role="status" className={'p-5 rounded-xl '+(result.passed?'bg-emerald-50 text-emerald-900':'bg-amber-50 text-amber-900')}><h3 className="font-semibold text-lg">{result.passed?(isExam?'Treinamento concluído — prova aprovada!':'Atividade aprovada!'):(isExam?'Revise o conteúdo e tente novamente.':'Atividade concluída — abaixo da média')}</h3><p className="mt-2">{result.correct} de {result.total} acertos · {result.score.toFixed(0)}% · mínimo: {result.passing??80}%</p></div>
       <details className="text-sm"><summary className="cursor-pointer font-medium">Ver correção e explicações</summary><div className="space-y-4 mt-4">{result.feedback.map((f,i)=><div key={i} className="border rounded-lg p-4"><p className="font-medium">{i+1}. {f.question}</p><p className="mt-2">{f.correct?'Correta.':'Resposta correta: '+f.correct_answer}</p><p className="text-slate-600 mt-2">{f.explanation}</p></div>)}</div></details>
       {!isExam?<Button className="bg-[#20364C] text-white" onClick={continueCourse}>{lesson?.sort_order===10?'Ir para a prova final':'Continuar para a próxima aula'}</Button>:!result.passed?<Button className="bg-[#DE8437] text-white" onClick={()=>setResult(null)}>Preparar nova tentativa</Button>:null}
      </div>:isExam?<div className="space-y-4"><Award className="h-10 w-10 text-[#DE8437]"/><p>A prova reúne {journey.exam.total} questões sobre as dez aulas. Você precisa de pelo menos {Math.ceil(journey.exam.total*journey.exam.passing/100)} acertos ({journey.exam.passing}%) para concluir o treinamento.</p>{journey.exam.passed&&<p className="text-emerald-700">Você já foi aprovado com {journey.exam.score?.toFixed(0)}%.</p>}<p className="text-sm text-slate-500">A prova é realizada uma questão por vez. {journey.settings.require_fullscreen?'Tela cheia obrigatória. ':''}{journey.settings.detect_tab_change?'Trocar de aba interrompe a tentativa.':''}</p><Button className="bg-[#DE8437] text-white" disabled={!journey.exam.available||busy} onClick={()=>void start()}><Maximize className="h-4 w-4 mr-2"/>{busy?'Preparando…':'Iniciar prova final'}</Button>{!journey.exam.available&&<p className="text-sm text-slate-500">Conclua as dez aulas e atividades para liberar esta etapa.</p>}</div>
      :phase==='video'?<div className="space-y-4">{videoLoading?<p>Preparando vídeo…</p>:videoUrl?<TrainingFocusedVideo key={active} src={videoUrl} label={'Videoaula: '+title} token={token} lessonId={active} canSeek={canDevSkip} onCompleted={()=>void videoDone()} onError={()=>setError('O vídeo não carregou. Reabra a aula para renovar o acesso.')}/>:<p>Vídeo indisponível.</p>}{lesson?.video_completed&&<Button variant="outline" onClick={()=>setPhase('activity')}>{lesson.completed?'Consultar atividade concluída':'Continuar para a atividade já liberada'}</Button>}</div>
      :lesson?.completed?<div className="space-y-4"><CheckCircle2 className="h-10 w-10 text-emerald-600"/><p>Atividade já entregue. Não é possível refazê-la.</p>{lesson.activity_score!=null&&<p>Nota registrada: {Number(lesson.activity_score).toFixed(0)}%</p>}<Button className="bg-[#20364C] text-white" onClick={continueCourse}>Continuar jornada</Button><Button variant="ghost" onClick={()=>setPhase('video')}>Rever vídeo</Button></div>:<div className="space-y-4"><ClipboardCheck className="h-10 w-10 text-[#DE8437]"/><p>Vídeo concluído. Agora responda às questões desta aula{journey.settings.require_fullscreen?' em tela cheia':''}.</p><p className="text-sm text-slate-500">A atividade só pode ser entregue uma vez, independentemente da nota. {journey.settings.detect_tab_change?'Trocar de aba interrompe a tentativa. ':''}{journey.settings.require_fullscreen?'Sair da tela cheia interrompe a tentativa.':''}</p><Button className="bg-[#DE8437] text-white" disabled={busy||!lesson?.video_completed} onClick={()=>void start()}><Maximize className="h-4 w-4 mr-2"/>{busy?'Preparando…':journey.settings.require_fullscreen?'Iniciar atividade em tela cheia':'Iniciar atividade'}</Button><Button variant="ghost" onClick={()=>setPhase('video')}>Rever vídeo</Button></div>}
     </CardContent></Card></div>
     <Card className="h-fit"><CardContent className="p-4 space-y-2"><h3 className="font-semibold mb-3">Sua jornada</h3>{journey.lessons.map(l=><button key={l.id} disabled={!l.unlocked||busy} onClick={()=>choose(l)} className={'w-full p-3 rounded-lg border text-left text-sm flex gap-2 items-center disabled:opacity-45 '+(active===l.id?'border-[#DE8437] bg-orange-50':'border-slate-200')}>{l.completed?<CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0"/>:!l.unlocked?<LockKeyhole className="h-4 w-4 shrink-0"/>:<PlayCircle className="h-4 w-4 shrink-0"/>}<span>{l.sort_order}. {l.title}</span></button>)}<button disabled={!journey.exam.available||busy} onClick={()=>{setActive('exam');setResult(null);setError('');}} className={'w-full p-3 rounded-lg border text-left text-sm flex gap-2 items-center disabled:opacity-45 '+(isExam?'border-[#DE8437] bg-orange-50':'border-slate-200')}><Award className="h-4 w-4 shrink-0"/>Prova final · {journey.exam.total} questões</button></CardContent></Card>
    </div>
   </>}
  </>}
 </div>;
}
