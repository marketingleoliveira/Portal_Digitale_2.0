import { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2, ChevronUp, ChevronDown } from 'lucide-react';

type Assessment = {
  id: string;
  title: string;
  type: string;
  passing_score: number;
  question_count: number;
  lesson_id: string | null;
};

type Question = {
  id: string;
  question_text: string;
  explanation?: string | null;
  options: {
    id: string;
    option_text: string;
    is_correct: number;
  }[];
};

const API = '/api/training-assessments-v2';

export default function TrainingAssessmentBuilder({
  courseId,
  token,
  lessons
}: {
  courseId: string;
  token: string;
  lessons: {id:string;title:string;sort_order:number}[];
}) {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [editingAssessment,setEditingAssessment]=useState<string|null>(null);
  const [editingQuestion,setEditingQuestion]=useState<string|null>(null);
  const [explanation,setExplanation]=useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState('activity');
  const [lessonId,setLessonId]=useState('');
  const [score, setScore] = useState(70);
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const request = useCallback(async (
    path: string,
    method = 'GET',
    body?: unknown
  ) => {
    const response = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result.error?.message ||
        `Erro HTTP ${response.status}`
      );
    }

    return result.data;
  }, [token]);

  const loadAssessments = useCallback(async () => {
    try {
      const data = await request(
        `/courses/${encodeURIComponent(courseId)}/assessments`
      );
      setAssessments(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar');
    }
  }, [courseId, request]);

  useEffect(() => {
    setSelected(null);
    setQuestions([]);
    setAssessments([]);
    setError('');
    setSuccess('');
    void loadAssessments();
  }, [loadAssessments]);

  const loadQuestions = async (id: string) => {
    setSelected(id);
    setError('');
    try {
      const data = await request(
        `/assessments/${encodeURIComponent(id)}/questions`
      );
      setQuestions(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar');
    }
  };

  const startAssessmentEdit=(a:Assessment)=>{setEditingAssessment(a.id);setTitle(a.title);setType(a.type);setLessonId(a.lesson_id||'');setScore(Number(a.passing_score));setNewOpen(true);};
  const resetAssessment=()=>{setEditingAssessment(null);setTitle('');setType('activity');setLessonId('');setScore(70);};
  const resetQuestion=()=>{setEditingQuestion(null);setQuestionText('');setOptions(['','','','']);setCorrect(0);setExplanation('');};
  const startQuestionEdit=(q:Question)=>{setEditingQuestion(q.id);setQuestionText(q.question_text);setOptions(q.options.map(o=>o.option_text));setCorrect(Math.max(0,q.options.findIndex(o=>Number(o.is_correct)===1)));setExplanation(q.explanation||'');};
  const changeQuestions=async(path:string,method:string,body?:unknown)=>{
   if(!selected||busy)return;setBusy(true);setError('');setSuccess('');
   try{await request(path,method,body);resetQuestion();await loadQuestions(selected);await loadAssessments();setSuccess('Alteração salva.');}
   catch(e){setError(e instanceof Error?e.message:'Erro ao salvar');}finally{setBusy(false);}
  };
  const move=(index:number,delta:number)=>{const ids=questions.map(q=>q.id);const next=index+delta;if(next<0||next>=ids.length)return;[ids[index],ids[next]]=[ids[next],ids[index]];void changeQuestions('/assessments/'+selected+'/question-order','PUT',{ids});};
  const createAssessment = async () => {
    if (!title.trim()) {
      setError('Informe o nome da atividade ou prova.');
      return;
    }

    if(!editingAssessment&&type==='activity'&&!lessons.some(l=>l.id===lessonId)){setError('Selecione a aula vinculada à atividade.');return;}
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const created = await request(
        editingAssessment?`/assessments/${editingAssessment}`:`/courses/${encodeURIComponent(courseId)}/assessments`,
        editingAssessment?'PATCH':'POST',
        {
          title: title.trim(),
          type,
          passing_score: score,
          lesson_id: type==='activity'?lessonId:null
        }
      );

      setTitle('');
      setType('activity');
      setLessonId('');
      setScore(70);
      setNewOpen(false);
      await loadAssessments();
      await loadQuestions(editingAssessment||created.id);
      setSuccess(editingAssessment?'Avaliação atualizada.':'Avaliação criada com sucesso.');
      setEditingAssessment(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setBusy(false);
    }
  };

  const createQuestion = async () => {
    const valid = options.map(item => item.trim());

    if (
      !questionText.trim() ||
      valid.some(item => !item)
    ) {
      setError('Preencha a pergunta e todas as alternativas.');
      return;
    }

    if (!selected) return;

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      await request(
        `/assessments/${encodeURIComponent(selected)}/questions`+(editingQuestion?'/'+editingQuestion:''),
        editingQuestion?'PATCH':'POST',
        {
          question_text: questionText.trim(),
          options: valid,
          correct_index: correct, explanation
        }
      );

      resetQuestion();

      await loadQuestions(selected);
      await loadAssessments();
      setSuccess(editingQuestion?'Pergunta atualizada.':'Pergunta adicionada com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setBusy(false);
    }
  };

  const active = assessments.find(item => item.id === selected);

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#1F3147]">
            Atividades e provas
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Configure avaliações para este treinamento.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {resetAssessment();setNewOpen(value=>!value);}}
          className="rounded-lg bg-[#1F3147] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#172638]"
        >
          + Nova atividade / prova
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div role="status" className="rounded-lg bg-slate-100 p-3 text-sm text-[#1F3147]">
          {success}
        </div>
      )}

      {newOpen && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-semibold">{editingAssessment?'Editar avaliação':'Nova avaliação'}</h3>

          <label className="block text-sm">
            Nome
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={255}
              placeholder="Ex.: Avaliação sobre tecidos"
              className="mt-1 w-full rounded-lg border bg-white p-2.5"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Tipo
              <select
                disabled={!!editingAssessment}
                value={type}
                onChange={e => {setType(e.target.value);setLessonId('');}}
                className="mt-1 w-full rounded-lg border bg-white p-2.5"
              >
                <option value="activity">Atividade</option>
                <option value="exam">Prova</option>
              </select>
            </label>

            <label className="block text-sm">
              Nota mínima (%)
              <input
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={e => setScore(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border bg-white p-2.5"
              />
            </label>
          </div>

          {type==='activity'?<label className="block text-sm">Aula vinculada *
            <select disabled={!!editingAssessment} required value={lessonId} onChange={e=>setLessonId(e.target.value)} className="mt-1 w-full rounded-lg border bg-white p-2.5">
              <option value="">Selecione a aula</option>
              {lessons.map(l=><option key={l.id} value={l.id} disabled={assessments.some(a=>a.type==='activity'&&a.lesson_id===l.id)}>{l.sort_order}. {l.title}{assessments.some(a=>a.type==='activity'&&a.lesson_id===l.id)?' — já possui atividade':''}</option>)}
            </select>
            <span className="block mt-1 text-xs text-slate-500">A atividade será liberada após a aula selecionada.</span>
          </label>:<p className="text-sm text-slate-500">Prova final: após as aulas e atividades do treinamento.</p>}
          <button
            type="button"
            disabled={busy||(!editingAssessment&&type==='activity'&&!lessonId)}
            onClick={() => void createAssessment()}
            className="rounded-lg bg-[#1F3147] px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Salvar avaliação
          </button>
          <button type="button" className="ml-2 rounded-lg border px-4 py-2 text-sm" onClick={()=>{setNewOpen(false);resetAssessment();}}>Cancelar</button>
        </div>
      )}

      {assessments.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
          Nenhuma atividade ou prova cadastrada neste treinamento.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {assessments.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => {resetQuestion();void loadQuestions(item.id);}}
              className={`rounded-xl border p-4 text-left transition-colors ${
                selected === item.id
                  ? 'border-[#1F3147] bg-slate-50'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className="text-xs font-medium text-slate-500">
                {item.type === 'exam' ? 'PROVA' : 'ATIVIDADE'}
              </span>
              <h3 className="mt-1 font-semibold text-[#1F3147]">
                {item.title}
              </h3>
              <p className="mt-2 text-xs text-slate-500">
                {item.type==='activity'&&<span className="block mb-1">{lessons.find(l=>l.id===item.lesson_id)?.title||'Sem aula vinculada'}</span>}
                {item.question_count} pergunta(s) · Aprovação {item.passing_score}%
              </p>
            </button>
          ))}
        </div>
      )}

      {active && (
        <div className="space-y-4 border-t border-slate-200 pt-5">
          <div>
            <h3 className="font-semibold text-[#1F3147]">
              Perguntas — {active.title}
              <button type="button" className="ml-3 inline-flex items-center gap-1 rounded border px-2 py-1 text-xs" onClick={()=>startAssessmentEdit(active)}><Pencil className="h-3 w-3"/>Editar avaliação</button>
            </h3>
            <p className="text-sm text-slate-500">
              Escolha uma única alternativa correta por pergunta.
            </p>
          </div>

          {questions.map((question, index) => (
            <div key={question.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><p className="font-medium flex-1">{index+1}. {question.question_text}</p><div className="flex gap-1">
                <button type="button" title="Subir pergunta" aria-label="Subir pergunta" disabled={busy||index===0} onClick={()=>move(index,-1)} className="rounded border p-2 disabled:opacity-30"><ChevronUp className="h-4 w-4"/></button>
                <button type="button" title="Descer pergunta" aria-label="Descer pergunta" disabled={busy||index===questions.length-1} onClick={()=>move(index,1)} className="rounded border p-2 disabled:opacity-30"><ChevronDown className="h-4 w-4"/></button>
                <button type="button" title="Editar pergunta" aria-label="Editar pergunta" disabled={busy} onClick={()=>{startQuestionEdit(question);document.getElementById('training-question-editor')?.scrollIntoView({behavior:'smooth',block:'center'});}} className="rounded border p-2"><Pencil className="h-4 w-4"/></button>
                <button type="button" title="Excluir pergunta" aria-label="Excluir pergunta" disabled={busy||questions.length<=1} onClick={()=>{if(window.confirm('Excluir esta pergunta das próximas avaliações? Os resultados anteriores serão preservados.'))void changeQuestions('/assessments/'+selected+'/questions/'+question.id,'DELETE');}} className="rounded border p-2 text-red-600 disabled:opacity-30"><Trash2 className="h-4 w-4"/></button>
              </div></div>
              <div className="mt-3 space-y-1 text-sm">
                {question.options.map(option => (
                  <p
                    key={option.id}
                    className={option.is_correct
                      ? 'font-medium text-emerald-700'
                      : 'text-slate-600'}
                  >
                    {option.is_correct ? '✓ ' : '○ '}
                    {option.option_text}
                  </p>
                ))}
              </div>
            </div>
          ))}

          <div id="training-question-editor" className="space-y-3 rounded-xl bg-slate-50 p-4">
            <h4 className="font-semibold">{editingQuestion?'Editar pergunta':'Adicionar pergunta'}</h4>

            <textarea
              rows={3}
              value={questionText}
              onChange={e => setQuestionText(e.target.value)}
              placeholder="Digite o enunciado da pergunta..."
              className="w-full rounded-lg border bg-white p-3 text-sm"
            />

            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-3">
                <input
                  type="radio"
                  name="training-correct-option"
                  checked={correct === index}
                  onChange={() => setCorrect(index)}
                  aria-label={`Alternativa ${index + 1} correta`}
                />

                <input
                  value={option}
                  onChange={e => {
                    const next = [...options];
                    next[index] = e.target.value;
                    setOptions(next);
                  }}
                  placeholder={`Alternativa ${index + 1}`}
                  className="min-w-0 flex-1 rounded-lg border bg-white p-2.5 text-sm"
                />
              </div>
            ))}

            <label className="block text-sm">Explicação da resposta (opcional)<textarea value={explanation} onChange={e=>setExplanation(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border bg-white p-2"/></label>
            <p className="text-xs text-slate-500">
              Marque o círculo da alternativa correta.
            </p>

            <div className="flex flex-wrap gap-2">
              {options.length < 6 && (
                <button
                  type="button"
                  onClick={() => setOptions(previous => [...previous, ''])}
                  className="rounded-lg border px-3 py-2 text-sm"
                >
                  + Alternativa
                </button>
              )}

              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => {
                    setOptions(previous => previous.slice(0, -1));
                    setCorrect(previous =>
                      Math.min(previous, options.length - 2)
                    );
                  }}
                  className="rounded-lg border px-3 py-2 text-sm"
                >
                  Remover última
                </button>
              )}
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => void createQuestion()}
              className="rounded-lg bg-[#1F3147] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {editingQuestion?'Salvar alterações':'Salvar pergunta'}
            </button>
            {editingQuestion&&<button type="button" className="ml-2 rounded-lg border px-4 py-2 text-sm" onClick={resetQuestion}>Cancelar edição</button>}
          </div>
        </div>
      )}
    </section>
  );
}
