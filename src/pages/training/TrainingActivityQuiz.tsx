import { useEffect, useRef, useState } from 'react';

const BASE = '/api/training-activity-player-test';

type Question = {
  id: string;
  text: string;
  options: { id: string; text: string }[];
};

type Session = {
  session_id: string;
  index: number;
  total: number;
  remaining_ms: number;
  question: Question;
};

type Result = {
  completed: boolean;
  correct: number;
  total: number;
  score: number;
  passed: boolean;
};

type Props = {
  lessonId: string;
  token: string;
  onPassed: (id: string) => void;
};

export default function TrainingActivityQuiz({
  lessonId, token, onPassed
}: Props) {
  const [status, setStatus] = useState('loading');
  const [title, setTitle] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [remaining, setRemaining] = useState(60);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState('');
  const [settings, setSettings] = useState({
    require_fullscreen: true,
    detect_tab_change: true,
    detect_navigation: true,
    prevent_copy: true,
    seconds_per_question: 60
  });
  const active = useRef(false);
  const sessionId = useRef('');
  const deadline = useRef(0);
  const sending = useRef(false);

  async function api(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(BASE + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(
        json.error?.message || `HTTP ${response.status}`
      ) as Error & { status?: number };

      error.status = response.status;
      throw error;
    }

    return json.data;
  }

  function stop() {
    active.current = false;
    sessionId.current = '';
  }

  function blocked() {
    stop();
    setStatus('blocked');
    setSession(null);
    setMessage(
      'Solicite a um ADM do sistema a liberação do treinamento.'
    );

    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
  }

  function report(reason: string) {
    if (!active.current || !sessionId.current) return;

    const id = sessionId.current;
    const payload = JSON.stringify({ reason });

    // keepalive permite tentar registrar a saída da página.
    // Se não chegar ao servidor, a sessão ativa será
    // detectada como interrompida no próximo acesso.
    fetch(`${BASE}/sessions/${id}/violation`, {
      method: 'POST',
      keepalive: true,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: payload
    }).catch(() => {});

    blocked();
  }

  useEffect(() => {
    let mounted = true;

    api(`/lessons/${lessonId}/status`)
      .then(data => {
        if (!mounted) return;

        setTitle(data.title);
        if (data.settings) {
          setSettings(previous => ({
            ...previous, ...data.settings
          }));
        }
        setStatus(data.already_passed ? 'passed' : 'ready');
      })
      .catch(error => {
        if (!mounted) return;

        if (error.status === 423) {
          blocked();
        } else {
          setStatus('error');
          setMessage(error.message);
        }
      });

    return () => { mounted = false; };
  }, [lessonId, token]);

  useEffect(() => {
    function fullscreenChanged() {
      if (
        active.current &&
        settings.require_fullscreen &&
        !document.fullscreenElement
      ) {
        report('SAIDA_TELA_CHEIA');
      }
    }

    function visibilityChanged() {
      if (
        active.current &&
        settings.detect_tab_change &&
        document.visibilityState === 'hidden'
      ) {
        report('TROCA_DE_ABA');
      }
    }

    function beforeUnload() {
      if (active.current) report('GUIA_FECHADA');
    }

    function navigation() {
      if (active.current && settings.detect_navigation) {
        report('NAVEGACAO');
      }
    }

    function securityKey(event: KeyboardEvent) {
      if (!active.current || !settings.prevent_copy) return;

      if (!(event.ctrlKey || event.metaKey)) return;

      const key = event.key.toLowerCase();

      if (['c', 'v', 'p', 's'].includes(key)) {
        event.preventDefault();

        const type = key === 'v'
          ? 'COLAGEM_BLOQUEADA'
          : key === 'p'
          ? 'IMPRESSAO_BLOQUEADA'
          : 'COPIA_BLOQUEADA';

        void api('/security/event', 'POST', {
          session_id: sessionId.current,
          type
        }).catch(() => {});
      }
    }

    function contextMenu(event: MouseEvent) {
      if (!active.current || !settings.prevent_copy) return;
      event.preventDefault();

      void api('/security/event', 'POST', {
        session_id: sessionId.current,
        type: 'MENU_CONTEXTO_BLOQUEADO'
      }).catch(() => {});
    }

    document.addEventListener('keydown', securityKey, true);
    document.addEventListener('contextmenu', contextMenu, true);
    window.addEventListener('popstate', navigation);

    document.addEventListener(
      'fullscreenchange', fullscreenChanged
    );
    document.addEventListener(
      'visibilitychange', visibilityChanged
    );
    window.addEventListener('pagehide', beforeUnload);

    return () => {
      document.removeEventListener(
        'keydown', securityKey, true
      );
      document.removeEventListener(
        'contextmenu', contextMenu, true
      );
      window.removeEventListener('popstate', navigation);
      document.removeEventListener(
        'fullscreenchange', fullscreenChanged
      );
      document.removeEventListener(
        'visibilitychange', visibilityChanged
      );
      window.removeEventListener('pagehide', beforeUnload);
    };
  }, [token, settings]);

  useEffect(() => {
    if (status !== 'running') return;

    const interval = window.setInterval(() => {
      const ms = Math.max(0, deadline.current - Date.now());
      setRemaining(Math.ceil(ms / 1000));

      if (ms === 0 && !sending.current) {
        void answer(null);
      }
    }, 250);

    const heartbeat = window.setInterval(async () => {
      if (!active.current || !sessionId.current) return;

      try {
        await api(`/sessions/${sessionId.current}/heartbeat`, 'POST');
      } catch (error: any) {
        if (error.status === 423) blocked();
      }
    }, 10000);

    return () => {
      window.clearInterval(interval);
      window.clearInterval(heartbeat);
    };
  }, [status, session?.index]);

  async function start() {
    setBusy(true);
    setMessage('');

    try {
      // Navegadores exigem clique real para entrar em tela cheia.
      if (settings.require_fullscreen) {
        await document.documentElement.requestFullscreen();
      }

      const data: Session & { settings?: typeof settings } = await api(
        `/lessons/${lessonId}/start`,
        'POST'
      );

      if (data.settings) {
        setSettings(previous => ({
          ...previous, ...data.settings
        }));
      }

      sessionId.current = data.session_id;
      deadline.current = Date.now() + data.remaining_ms;

      setSession(data);
      setRemaining(Math.ceil(data.remaining_ms / 1000));
      setSelected(null);
      active.current = true;
      setStatus('running');
    } catch (error: any) {
      if (error.status === 423) {
        blocked();
      } else {
        setMessage(error.message || 'Não foi possível iniciar.');

        if (document.fullscreenElement) {
          void document.exitFullscreen().catch(() => {});
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function answer(optionId: string | null) {
    if (!session || sending.current || !active.current) return;

    sending.current = true;
    setBusy(true);

    try {
      const data = await api(
        `/sessions/${session.session_id}/answer`,
        'POST',
        {
          index: session.index,
          option_id: optionId
        }
      );

      if (data.completed) {
        stop();
        setResult(data);
        setStatus('finished');

        if (document.fullscreenElement) {
          void document.exitFullscreen().catch(() => {});
        }

        if (data.passed) onPassed(lessonId);
      } else {
        deadline.current = Date.now() + data.remaining_ms;
        setRemaining(Math.ceil(data.remaining_ms / 1000));
        setSelected(null);

        setSession(previous => ({
          ...previous!,
          ...data,
          session_id: previous!.session_id
        }));
      }
    } catch (error: any) {
      if (error.status === 423) {
        blocked();
      } else {
        setMessage(error.message || 'Erro ao registrar resposta.');
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  if (status === 'blocked') {
    return (
      <div className="bg-white rounded-xl p-8 text-center space-y-4">
        <h2 className="text-2xl font-bold text-red-700">
          Tentativa de Burlar Detectada
        </h2>
        <p>
          Sua atividade foi encerrada e o treinamento foi bloqueado.
        </p>
        <p className="text-slate-600">{message}</p>
        <p className="font-semibold">
          Entre em contato com um ADM para solicitar a liberação.
        </p>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="p-8 bg-white text-center">
        Verificando sua avaliação...
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="p-8 bg-white text-red-700">
        {message}
      </div>
    );
  }

  if (status === 'passed') {
    return (
      <div className="p-8 bg-white rounded-xl text-center space-y-3">
        <h2 className="text-xl font-bold text-emerald-700">
          Atividade já aprovada
        </h2>
        <p>Seu resultado está salvo no sistema.</p>
      </div>
    );
  }

  if (status === 'ready') {
    return (
      <div className="bg-white rounded-xl p-8 space-y-5">
        <h2 className="text-2xl font-bold text-[#1F3147]">
          {title}
        </h2>
        <p>
          Você terá {settings.seconds_per_question} segundos
          para responder cada pergunta.
          {settings.require_fullscreen
            ? ' A avaliação será realizada em tela cheia.'
            : ''}
        </p>
        <p className="text-amber-800">
          Interromper a avaliação poderá bloquear o treinamento.
          O motivo ficará registrado para análise do desenvolvedor.
        </p>
        {message && (
          <p className="text-red-700">{message}</p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void start()}
          className="rounded-lg bg-[#1F3147] text-white px-6 py-3"
        >
          {busy ? 'Iniciando...' : 'Iniciar avaliação'}
        </button>
      </div>
    );
  }

  if (status === 'finished' && result) {
    return (
      <div className="bg-white rounded-xl p-8 text-center space-y-4">
        <h2 className="text-2xl font-bold">
          {result.passed ? 'Aprovado!' : 'Não aprovado'}
        </h2>
        <div className="text-4xl font-bold">{result.score}%</div>
        <p>{result.correct} de 10 respostas corretas.</p>
        {result.passed ? (
          <p className="text-emerald-700">
            Próxima aula liberada.
          </p>
        ) : (
          <button
            type="button"
            className="rounded-lg bg-[#1F3147] text-white px-5 py-3"
            onClick={() => {
              setStatus('ready');
              setResult(null);
            }}
          >
            Tentar novamente
          </button>
        )}
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-full bg-white p-5 md:p-10 space-y-6 text-[#1F3147]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase font-semibold text-emerald-700">
            Avaliação supervisionada
          </p>
          <h2 className="text-xl font-bold">{title}</h2>
        </div>
        <div className="rounded-xl border px-5 py-3 text-center">
          <p className="text-xs text-slate-500">Tempo restante</p>
          <p className={`text-3xl font-bold ${
            remaining <= 10 ? 'text-red-600' : ''
          }`}>
            00:{String(remaining).padStart(2, '0')}
          </p>
        </div>
      </div>

      <div>
        <p className="text-sm mb-2">
          Pergunta {session.index + 1} de 10
        </p>
        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500"
            style={{
              width: `${(session.index + 1) * 10}%`
            }}
          />
        </div>
      </div>

      <h3 className="text-xl font-semibold">
        {session.question.text}
      </h3>

      <div className="grid gap-3">
        {session.question.options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            disabled={busy}
            onClick={() => setSelected(option.id)}
            className={`rounded-xl border-2 p-4 text-left ${
              selected === option.id
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-slate-200'
            }`}
          >
            <strong className="mr-3">
              {String.fromCharCode(65 + index)}.
            </strong>
            {option.text}
          </button>
        ))}
      </div>

      {message && <p className="text-red-700">{message}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!selected || busy}
          onClick={() => void answer(selected)}
          className="rounded-lg bg-[#1F3147] px-6 py-3 font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'Registrando...' : 'Confirmar resposta'}
        </button>
      </div>
    </div>
  );
}
