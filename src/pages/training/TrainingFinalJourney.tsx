import { createPortal } from 'react-dom';
import { useEffect,useState,useRef } from 'react';
import { jsPDF } from 'jspdf';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Award,ClipboardCheck,RefreshCw,FileDown } from 'lucide-react';
import logo from '@/assets/logo-digitale-full.png';

const API='/api/training-final-journey';

type Certificate={
  id:string;
  recipient_name:string;
  recipient_email:string;
  course_title:string;
  score:number;
  issued_at:string;
};

type Status={
  prerequisites:{
    ready:boolean;
    steps:{
      title:string;
      video:boolean;
      activity:boolean;
    }[];
  };
  available:number;
  total:number;
  passing:number;
  minutes:number;
  certificate:Certificate|null;
  active:boolean;
  locked:{reason:string}|null;
  settings:{
    require_fullscreen:boolean;
    detect_tab_change:boolean;
    detect_navigation:boolean;
    prevent_copy:boolean;
    seconds_per_question:number;
  };
};

type Exam={
  id:string;
  index:number;
  total:number;
  remaining:number;
  question:{
    text:string;
    options:{id:string;text:string}[];
  };
};

async function certificatePDF(c:Certificate){
  const pdf=new jsPDF({
    orientation:'landscape',unit:'mm',format:'a4'
  });

  const image=await new Promise<{
    data:string;
    ratio:number;
  }>((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const canvas=document.createElement('canvas');
      canvas.width=img.naturalWidth;
      canvas.height=img.naturalHeight;
      const ctx=canvas.getContext('2d');
      if(!ctx) return reject(Error('Erro na imagem'));
      ctx.drawImage(img,0,0);
      resolve({
        data:canvas.toDataURL('image/png'),
        ratio:img.naturalWidth/img.naturalHeight
      });
    };
    img.onerror=()=>reject(Error('Logotipo indisponível'));
    img.src=logo;
  });

  pdf.setDrawColor(31,49,71);
  pdf.setLineWidth(1.1);
  pdf.rect(11,11,275,188);
  pdf.setLineWidth(0.3);
  pdf.rect(15,15,267,180);

  const width=66;
  const height=Math.min(27,width/image.ratio);

  pdf.addImage(
    image.data,'PNG',
    (297-width)/2,24,width,height
  );

  pdf.setTextColor(31,49,71);
  pdf.setFont('helvetica','bold');
  pdf.setFontSize(23);
  pdf.text(
    'CERTIFICADO DE CONCLUSÃO',
    148.5,73,{align:'center'}
  );

  pdf.setFont('helvetica','normal');
  pdf.setFontSize(12);
  pdf.text('Certificamos que',148.5,91,{align:'center'});

  pdf.setFont('helvetica','bold');
  pdf.setFontSize(18);
  pdf.text(
    pdf.splitTextToSize(c.recipient_name,220),
    148.5,105,{align:'center'}
  );

  pdf.setFont('helvetica','normal');
  pdf.setFontSize(11);
  pdf.text(
    'concluiu com aprovação o treinamento',
    148.5,120,{align:'center'}
  );

  pdf.setFont('helvetica','bold');
  pdf.setFontSize(17);
  pdf.text(
    pdf.splitTextToSize(c.course_title,220),
    148.5,134,{align:'center'}
  );

  const date=new Date(c.issued_at);

  pdf.setFont('helvetica','normal');
  pdf.setFontSize(10);
  pdf.text(
    `Nota final: ${c.score}% | Emissão: ${date.toLocaleDateString('pt-BR')}`,
    148.5,153,{align:'center'}
  );

  pdf.setFontSize(9);
  pdf.text(
    `Login: ${c.recipient_email}`,
    148.5,165,{align:'center'}
  );

  pdf.setFontSize(8);
  pdf.text(
    `Código de registro: ${c.id}`,
    148.5,180,{align:'center'}
  );

  pdf.save(`Certificado-Digitale-${c.id}.pdf`);
}

export default function TrainingFinalJourney(){
  const {session}=useAuth();
  const token=(session as any)?.access_token ||
    (session as any)?.accessToken || '';

  const [info,setInfo]=useState<Status|null>(null);
  const activeRef=useRef(false);
  const sessionRef=useRef('');
  const violationRef=useRef(false);
  const [questionRemaining,setQuestionRemaining]=useState(60);
  const [exam,setExam]=useState<Exam|null>(null);
  const [option,setOption]=useState('');
  const [busy,setBusy]=useState(false);
  const [remaining,setRemaining]=useState(0);
  const [result,setResult]=useState<{
    passed:boolean;
    score:number;
  }|null>(null);

  async function call(path:string,method='GET',body?:unknown){
    const res=await fetch(API+path,{
      method,
      headers:{
        Authorization:`Bearer ${token}`,
        ...(body!==undefined
          ?{'Content-Type':'application/json'}
          :{})
      },
      ...(body!==undefined
        ?{body:JSON.stringify(body)}
        :{})
    });

    const json=await res.json().catch(()=>({}));

    if(!res.ok){
      throw Error(
        json.error?.message || `HTTP ${res.status}`
      );
    }

    return json.data;
  }

  async function load(){
    if(!token) return;
    try{
      const data=await call('/status');
      setInfo(data);
    }catch(e:any){
      toast.error(e.message);
    }
  }

  useEffect(()=>{
    void load();
  },[token]);

  useEffect(()=>{
    if(!exam) return;

    const deadline=Date.now()+exam.remaining*1000;

    const update=()=>{
      setRemaining(Math.max(
        0,Math.ceil((deadline-Date.now())/1000)
      ));
    };

    update();
    const timer=setInterval(update,500);
    return ()=>clearInterval(timer);
  },[exam]);


  async function start(){
    if(busy) return;

    setBusy(true);

    try{
      // Solicita tela cheia diretamente no clique.
      // Deve acontecer antes de qualquer chamada à API.
      if(!document.fullscreenElement){
        if(!document.documentElement.requestFullscreen){
          throw new Error(
            'Este navegador não permite tela cheia.'
          );
        }

        await document.documentElement.requestFullscreen();
      }

      if(!document.fullscreenElement){
        throw new Error(
          'Autorize a tela cheia para iniciar a prova.'
        );
      }

      // Somente agora cria a prova no servidor.
      const data=await call('/start','POST',{});

      sessionRef.current=data.id;
      violationRef.current=false;
      activeRef.current=true;

      setExam(data);
      setQuestionRemaining(
        info?.settings?.seconds_per_question||60
      );
      setResult(null);
      setOption('');

    }catch(e:any){
      activeRef.current=false;

      toast.error(
        e.message||'Não foi possível iniciar a prova.'
      );

      await load();

      if(document.fullscreenElement){
        await document.exitFullscreen().catch(()=>{});
      }
    }finally{
      setBusy(false);
    }
  }

  async function resume(){
    setBusy(true);
    try{
      const data=await call('/current');
      sessionRef.current=data.id;
      activeRef.current=true;
      violationRef.current=false;
      if(info?.settings?.require_fullscreen &&
         !document.fullscreenElement){
        throw Error('A prova exige tela cheia.');
      }
      setExam(data);
      setQuestionRemaining(
        info?.settings?.seconds_per_question||60
      );
      setOption('');
    }catch(e:any){
      toast.error(e.message);
      await load();
    }finally{
      setBusy(false);
    }
  }

  async function answer(){
    if(!exam || !option) return;
    setBusy(true);

    try{
      const data=await call('/answer','POST',{
        id:exam.id,
        index:exam.index,
        option
      });

      if(data.finished){
        activeRef.current=false;
        sessionRef.current='';
        setExam(null);
        setResult({
          passed:data.passed,
          score:data.score
        });
        await load();
      }else{
        setExam(data);
        setQuestionRemaining(
          info?.settings?.seconds_per_question||60
        );
        setOption('');
      }
    }catch(e:any){
      toast.error(e.message);
      await load();
    }finally{
      setBusy(false);
    }
  }

  useEffect(()=>{
    if(!exam || !token) return;

    let running=true;

    const heartbeat=async()=>{
      if(!running || !activeRef.current) return;

      try{
        await call('/heartbeat','POST',{
          id:sessionRef.current
        });
      }catch(e:any){
        if(!running) return;

        activeRef.current=false;
        setExam(null);
        toast.error(e.message);
        await load();
      }
    };

    void heartbeat();

    const timer=setInterval(()=>{
      void heartbeat();
    },10000);

    return ()=>{
      running=false;
      clearInterval(timer);
    };
  },[exam?.id,token]);

  useEffect(()=>{
    if(!exam) return;

    const deadline=Date.now()+
      (info?.settings?.seconds_per_question||60)*1000;

    const timer=setInterval(()=>{
      const left=Math.max(
        0,Math.ceil((deadline-Date.now())/1000)
      );
      setQuestionRemaining(left);
    },300);

    return ()=>clearInterval(timer);
  },[exam?.id,exam?.index]);

  useEffect(()=>{
    if(!token) return;

    const policy=info?.settings;

    const violation=(reason:string)=>{
      if(!activeRef.current || violationRef.current) return;

      violationRef.current=true;
      activeRef.current=false;

      void fetch(API+'/violation',{
        method:'POST',
        keepalive:true,
        headers:{
          Authorization:`Bearer ${token}`,
          'Content-Type':'application/json'
        },
        body:JSON.stringify({
          id:sessionRef.current,reason
        })
      }).finally(()=>{
        setExam(null);
        void load();
      });
    };

    const onFullscreen=()=>{
      if(
        policy?.require_fullscreen &&
        !document.fullscreenElement
      ){
        violation('SAIDA_TELA_CHEIA');
      }
    };

    const onVisibility=()=>{
      if(
        policy?.detect_tab_change &&
        document.visibilityState==='hidden'
      ){
        violation('TROCA_DE_ABA');
      }
    };

    const onPageHide=()=>{
      if(policy?.detect_navigation){
        violation('NAVEGACAO');
      }
    };

    const onKey=(event:KeyboardEvent)=>{
      if(!activeRef.current || !policy?.prevent_copy) return;
      if(!(event.ctrlKey||event.metaKey)) return;

      if(['c','v','p','s'].includes(
        event.key.toLowerCase()
      )){
        event.preventDefault();
      }
    };

    const onContext=(event:MouseEvent)=>{
      if(activeRef.current && policy?.prevent_copy){
        event.preventDefault();
      }
    };

    document.addEventListener('fullscreenchange',onFullscreen);
    document.addEventListener('visibilitychange',onVisibility);
    document.addEventListener('keydown',onKey,true);
    document.addEventListener('contextmenu',onContext,true);
    window.addEventListener('pagehide',onPageHide);

    return ()=>{
      document.removeEventListener('fullscreenchange',onFullscreen);
      document.removeEventListener('visibilitychange',onVisibility);
      document.removeEventListener('keydown',onKey,true);
      document.removeEventListener('contextmenu',onContext,true);
      window.removeEventListener('pagehide',onPageHide);
    };
  },[token,info?.settings]);


  // DIGITALE_EXCLUSIVE_FINAL_EXAM_V1
  // Durante a prova, a interface fica isolada
  // dos menus, vídeos e demais conteúdos do Portal.

  if (exam) {
    return createPortal(
      <div
        id="digitale-final-exam-exclusive"
        className="fixed inset-0 z-[99999] overflow-y-auto bg-[#F5F7FA] text-[#1F3147]"
      >
        <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-5 py-8 md:py-12">
          <header className="mb-8 border-b border-slate-200 pb-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Digitale Têxtil
                </p>

                <h1 className="mt-2 text-2xl font-bold">
                  Prova Final
                </h1>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-right">
                <p className="text-xs text-slate-500">
                  Tempo restante
                </p>

                <p className="text-2xl font-bold tabular-nums">
                  {Math.floor(remaining / 60)}:
                  {String(remaining % 60).padStart(2, '0')}
                </p>
              </div>
            </div>
          </header>

          <section className="flex-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-9">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#1F3147]">
                Questão {exam.index + 1} de {exam.total}
              </p>

              <p className="text-sm font-medium text-slate-600">
                Tempo da questão: {questionRemaining}s
              </p>
            </div>

            <div className="mb-9 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#1F3147] transition-all"
                style={{
                  width: `${((exam.index + 1) / exam.total) * 100}%`
                }}
              />
            </div>

            <h2 className="mb-8 text-xl font-semibold leading-relaxed md:text-2xl">
              {exam.question.text}
            </h2>

            <div className="space-y-3">
              {exam.question.options.map((item, index) => (
                <label
                  key={item.id}
                  className={`flex cursor-pointer items-center gap-4 rounded-xl border p-5 transition-colors ${
                    option === item.id
                      ? 'border-[#1F3147] bg-[#EDF2F7]'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="digitaleFinalExclusiveAnswer"
                    checked={option === item.id}
                    onChange={() => setOption(item.id)}
                    className="h-4 w-4 accent-[#1F3147]"
                  />

                  <span className="flex-1 text-sm md:text-base">
                    {item.text}
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-10 flex justify-end border-t border-slate-100 pt-6">
              <Button
                type="button"
                disabled={
                  busy ||
                  !option ||
                  remaining === 0 ||
                  questionRemaining === 0
                }
                onClick={() => void answer()}
                className="min-w-44 bg-[#1F3147] px-7 py-6 text-white hover:bg-[#172638]"
              >
                {busy
                  ? 'Registrando...'
                  : exam.index + 1 === exam.total
                    ? 'Finalizar prova'
                    : 'Confirmar e avançar'}
              </Button>
            </div>
          </section>

          <p className="mt-5 text-center text-xs text-slate-500">
            Avaliação supervisionada • As respostas são registradas no servidor
          </p>
        </main>
      </div>,
      document.body
    );
  }

  return (
    <section className="rounded-xl border bg-white p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-[#1F3147]"/>
          <h2 className="font-bold text-[#1F3147]">
            Prova Final e Certificado
          </h2>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={()=>void load()}
        >
          <RefreshCw className="mr-2 h-4 w-4"/>
          Atualizar
        </Button>
      </div>

      {!info ? (
        <p className="text-sm text-slate-500">
          Carregando prova final...
        </p>
      ) : info.certificate ? (
        <div className="space-y-3">
          <p className="font-semibold text-emerald-700">
            <Award className="mr-2 inline h-5 w-5"/>
            Curso concluído e certificado emitido!
          </p>

          <p className="text-sm">
            Nota final: {info.certificate.score}%
          </p>

          <Button onClick={async()=>{
            try{
              await certificatePDF(info.certificate!);
            }catch(e:any){
              toast.error(e.message);
            }
          }}>
            <FileDown className="mr-2 h-4 w-4"/>
            Baixar Certificado PDF
          </Button>
        </div>
      ) : info.locked ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="font-semibold text-red-700">
            Avaliação bloqueada
          </p>
          <p className="mt-2 text-sm text-red-700">
            Motivo: {info.locked.reason}
          </p>
          <p className="mt-2 text-sm">
            Solicite a liberação ao desenvolvedor.
          </p>
        </div>
      ) : exam ? (
        <div className="space-y-4">
          <div className="flex justify-between gap-3">
            <strong>
              Questão {exam.index+1} de {exam.total}
            </strong>
            <strong>
              Tempo total: {Math.floor(remaining/60)}:
              {String(remaining%60).padStart(2,'0')}
            </strong>
          </div>

          <p className="text-sm text-amber-700">
            Tempo desta questão: {questionRemaining}s
          </p>
          <p className="font-medium">
            {exam.question.text}
          </p>

          <div className="space-y-2">
            {exam.question.options.map(x=>(
              <label
                key={x.id}
                className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer"
              >
                <input
                  type="radio"
                  name="finalAnswer"
                  checked={option===x.id}
                  onChange={()=>setOption(x.id)}
                />
                {x.text}
              </label>
            ))}
          </div>

          <Button
            disabled={
              busy || !option ||
              remaining===0 || questionRemaining===0
            }
            onClick={()=>void answer()}
          >
            {exam.index+1===exam.total
              ?'Finalizar prova'
              :'Confirmar e avançar'}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            {info.total} questões • {info.minutes} minutos •
            Aprovação com {info.passing}%
          </p>

          <p className="text-sm text-slate-500">
            Banco de questões: {info.available} disponíveis.
          </p>

          {!info.prerequisites.ready && (
            <div className="rounded-lg bg-amber-50 p-3">
              <p className="font-medium text-amber-800">
                Pré-requisitos pendentes
              </p>

              {info.prerequisites.steps.map((s,i)=>(
                <p key={i} className="text-sm text-amber-800">
                  {s.title}: vídeo {s.video?'✓':'pendente'},
                  atividade {s.activity?'✓':'pendente'}
                </p>
              ))}
            </div>
          )}

          {result && (
            <p className={
              result.passed
                ?'text-emerald-700 font-semibold'
                :'text-amber-700 font-semibold'
            }>
              {result.passed?'Aprovado':'Não aprovado'} —
              Nota {result.score}%
            </p>
          )}

          {info.active ? (
            <Button disabled={busy} onClick={()=>void resume()}>
              Continuar Prova Final
            </Button>
          ) : (
            <Button
              disabled={
                busy ||
                !info.prerequisites.ready ||
                info.available<info.total
              }
              onClick={()=>void start()}
            >
              Iniciar Prova Final
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
