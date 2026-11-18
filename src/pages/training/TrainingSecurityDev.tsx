import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ShieldCheck, RefreshCw, Save } from 'lucide-react';

const BASE = '/api/training-activity-player-test/security';

export const OPTIONS = [
  ['require_fullscreen', 'Exigir tela cheia'],
  ['detect_tab_change', 'Detectar troca de aba'],
  ['detect_navigation', 'Detectar navegação'],
  ['prevent_copy', 'Restringir copiar, colar e imprimir'],
  ['shuffle_questions', 'Embaralhar perguntas'],
  ['shuffle_options', 'Embaralhar alternativas'],
  ['detect_fast_answers', 'Monitorar respostas rápidas'],
  ['prevent_multiple_sessions', 'Impedir sessões simultâneas']
] as const;

type Settings = Record<string, boolean | number>;

type EventRecord = {
  id: string;
  user_name: string | null;
  email: string | null;
  lesson_title: string | null;
  event_type: string;
  details: string | null;
  created_at: string;
  course_title?: string;
  category: 'managerial' | 'security';
  score?: number | string | null;
};

export default function TrainingSecurityDev() {
  const { session, realRole } = useAuth();

  const token =
    (session as any)?.access_token ||
    (session as any)?.token || '';

  const [settings, setSettings] = useState<Settings>({});
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [tab, setTab] = useState<'managerial' | 'security'>('managerial');
  const [person, setPerson] = useState('');
  const [course, setCourse] = useState('');
  const [kind, setKind] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const api = useCallback(async (
    path: string,
    method = 'GET',
    body?: unknown
  ) => {
    const response = await fetch(BASE + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: body === undefined
        ? undefined
        : JSON.stringify(body)
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        json.error?.message || `HTTP ${response.status}`
      );
    }

    return json.data;
  }, [token]);

  const load = useCallback(async () => {
    if (realRole !== 'dev' || !token) return;

    setLoading(true);
    setError('');

    try {
      const [config, logs] = await Promise.all([
        api('/settings'),
        api('/history')
      ]);

      setSettings(config);
      setEvents(Array.isArray(logs) ? logs : []);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar segurança.');
    } finally {
      setLoading(false);
    }
  }, [api, realRole, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const updated = await api(
        '/settings', 'PUT', settings
      );

      setSettings(updated);
      setMessage('Configurações de segurança salvas.');
      await load();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  const labels: Record<string,string> = {
    VIDEOAULA_CONCLUIDA:'Videoaula concluída', ATIVIDADE_INICIADA:'Atividade iniciada',
    ATIVIDADE_FINALIZADA:'Atividade finalizada', PROVA_FINAL_INICIADA:'Prova final iniciada',
    PROVA_FINAL_FINALIZADA:'Prova final finalizada', TREINAMENTO_CONCLUIDO:'Treinamento concluído',
    RESET_DE_PROGRESSO:'Reset de progresso', AVALIACAO_INICIADA:'Avaliação iniciada',
    AVALIACAO_CONCLUIDA:'Avaliação concluída', DESBLOQUEIO_ADMINISTRATIVO:'Desbloqueio administrativo',
    CONFIGURACOES_ALTERADAS:'Configurações alteradas', PROVA_FINAL_LIBERADA_POR_DEV:'Prova final liberada pelo DEV',
    VIDEO_INTERROMPIDO:'Vídeo interrompido'
  };
  const label = (v:string) => labels[v] || v.replace(/_/g,' ');
  const scoped = events.filter(e=>e.category===tab);
  const unique = (values:(string|null|undefined)[]) => [...new Set(values.filter((v): v is string=>!!v))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const filtered = scoped.filter(e=>{
    const date = new Date(e.created_at).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
    return (!person || person===(e.user_name||e.email)) && (!course || course===e.course_title) &&
      (!kind || kind===e.event_type) && (!from || date>=from) && (!to || date<=to);
  });
  useEffect(()=>setPage(0),[tab,person,course,kind,from,to,events]);
  if (realRole !== 'dev') return null;

  return (
    <section className="mb-6 rounded-xl border bg-white p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-[#1F3147]" />
          <div>
            <h2 className="text-lg font-bold text-[#1F3147]">
              Segurança das Avaliações
            </h2>
            <p className="text-sm text-slate-500">
              Padrões para novos treinamentos. Não alteram treinamentos existentes.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}

      {message && (
        <p className="rounded-lg bg-emerald-50 p-3 text-emerald-700">
          {message}
        </p>
      )}

      {loading ? (
        <p>Carregando configurações...</p>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {OPTIONS.map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-3 rounded-lg border p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={Boolean(settings[key])}
                  onChange={event => setSettings(previous => ({
                    ...previous,
                    [key]: event.target.checked
                  }))}
                  className="h-4 w-4"
                />
                {label}
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="text-sm font-semibold">
              Tempo por pergunta
            </label>

            <select
              value={Number(settings.seconds_per_question || 60)}
              onChange={event => setSettings(previous => ({
                ...previous,
                seconds_per_question: Number(event.target.value)
              }))}
              className="rounded-lg border px-3 py-2"
            >
              <option value={30}>30 segundos</option>
              <option value={45}>45 segundos</option>
              <option value={60}>60 segundos</option>
              <option value={90}>90 segundos</option>
            </select>

            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="flex items-center gap-2 rounded-lg bg-[#1F3147] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Salvando...' : 'Salvar configurações'}
            </button>
          </div>
        </>
      )}

      <div className="border-t pt-5 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[#1F3147]">Histórico de ocorrências</h3>
          <p className="text-xs text-slate-500">Acesso exclusivo DEV · Registros gerenciais e auditoria técnica</p>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tipo de histórico">
          {(['managerial','security'] as const).map(t=><button key={t} type="button" role="tab" aria-selected={tab===t}
            onClick={()=>{setTab(t);setPerson('');setCourse('');setKind('');}}
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${tab===t?'bg-[#1F3147] text-white':'bg-white text-slate-600'}`}>
            {t==='managerial'?'Gerencial':'Segurança'} · {events.filter(e=>e.category===t).length}
          </button>)}
        </div>
        <p className="text-xs text-slate-500">{tab==='managerial'?'Conclusões, avaliações, notas e ações administrativas.':'Registros técnicos preservados. Ocorrências não significam fraude confirmada.'}</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs text-slate-600">Usuário<select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={person} onChange={e=>setPerson(e.target.value)}><option value="">Todos</option>{unique(scoped.map(e=>e.user_name||e.email)).map(v=><option key={v}>{v}</option>)}</select></label>
          <label className="text-xs text-slate-600">Treinamento<select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={course} onChange={e=>setCourse(e.target.value)}><option value="">Todos</option>{unique(scoped.map(e=>e.course_title)).map(v=><option key={v}>{v}</option>)}</select></label>
          <label className="text-xs text-slate-600">Ocorrência<select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={kind} onChange={e=>setKind(e.target.value)}><option value="">Todas</option>{unique(scoped.map(e=>e.event_type)).map(v=><option key={v} value={v}>{label(v)}</option>)}</select></label>
          <label className="text-xs text-slate-600">De<input type="date" className="mt-1 block w-full rounded-lg border p-2 text-sm" value={from} onChange={e=>setFrom(e.target.value)}/></label>
          <label className="text-xs text-slate-600">Até<input type="date" className="mt-1 block w-full rounded-lg border p-2 text-sm" value={to} onChange={e=>setTo(e.target.value)}/></label>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500"><span>{filtered.length} registros</span><button type="button" className="underline" onClick={()=>{setPerson('');setCourse('');setKind('');setFrom('');setTo('');}}>Limpar filtros</button></div>
        {loading ? <p className="text-sm text-slate-500">Carregando histórico...</p> : filtered.length===0 ? <p className="text-sm text-slate-500">Nenhuma ocorrência encontrada.</p> :
          <div className="overflow-auto rounded-lg border">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-slate-50"><tr>{['Usuário','Treinamento / Aula','Ocorrência','Nota','Data'].map(v=><th key={v} className="p-3">{v}</th>)}</tr></thead>
              <tbody>{filtered.slice(page*25,page*25+25).map(item=><tr key={item.id} className="border-t">
                <td className="p-3">{item.user_name || item.email || 'Usuário'}</td>
                <td className="p-3">{item.course_title||'—'}<p className="text-xs text-slate-500">{item.lesson_title||''}</p></td>
                <td className="p-3"><p className="font-medium">{label(item.event_type)}</p><p className="text-xs text-slate-500">{item.details||''}</p></td>
                <td className="p-3">{item.score!=null?Number(item.score).toLocaleString('pt-BR')+'%':'—'}</td>
                <td className="p-3 whitespace-nowrap">{new Date(item.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        {filtered.length>25&&<div className="flex items-center justify-end gap-3 text-sm"><button type="button" disabled={page===0} className="rounded border px-3 py-1 disabled:opacity-40" onClick={()=>setPage(p=>p-1)}>Anterior</button><span>{page+1} / {Math.ceil(filtered.length/25)}</span><button type="button" disabled={(page+1)*25>=filtered.length} className="rounded border px-3 py-1 disabled:opacity-40" onClick={()=>setPage(p=>p+1)}>Próxima</button></div>}
      </div>
    </section>
  );
}
