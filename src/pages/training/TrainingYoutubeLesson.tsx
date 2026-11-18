import React, { useEffect, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type LooseLesson = {
  title?: string;
  youtube_id?: string;
  youtubeId?: string;
  video_id?: string;
  videoId?: string;
};

type TrainingYoutubeLessonProps = {
  lessonId: string;
  // DIGITALE_TEST_SKIP_MARKETING_V1
  canTestSkip?: boolean;
  onTestSkip?: () => Promise<void>;
  lesson?: LooseLesson;
  title?: string;
  lessonTitle?: string;
  youtubeId?: string;
  videoId?: string;
  onComplete?: (lessonId: string) => void;
  onCompleted?: () => void;
};

export default function TrainingYoutubeLesson(props: TrainingYoutubeLessonProps) {
  const lesson = props.lesson || {};

  const title =
    props.title ||
    props.lessonTitle ||
    lesson.title ||
    "Videoaula";

  const youtubeId =
    props.youtubeId ||
    props.videoId ||
    lesson.youtube_id ||
    lesson.youtubeId ||
    lesson.video_id ||
    lesson.videoId ||
    "";

  const onFinish = props.onComplete || props.onCompleted;

  const containerId = useMemo(
    () => `training-youtube-${Math.random().toString(36).slice(2, 10)}`,
    []
  );

  const playerRef = useRef<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxWatchedRef = useRef(0);
  const completedRef = useRef(false);

  const [apiReady, setApiReady] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [progress, setProgress] = useState(0);
// DIGITALE_VOLUME_CONTROL_V1
  const [volume, setVolume] = useState(70);

  const changeVolume = (value: number) => {
    const next = Math.max(0, Math.min(100, value));
    setVolume(next);

    try {
      const player = playerRef.current;
      if (player?.setVolume) {
        player.setVolume(next);
        if (next === 0) player.mute?.();
        else player.unMute?.();
      }
    } catch {}
  };

  const [ended, setEnded] = useState(false);
  const [testSkipBusy, setTestSkipBusy] = useState(false);

  const handleTestSkip = async () => {
    if (
      !props.canTestSkip ||
      !props.onTestSkip ||
      testSkipBusy ||
      ended
    ) return;

    setTestSkipBusy(true);

    try {
      await props.onTestSkip();
      try {
        playerRef.current?.pauseVideo?.();
      } catch {}

      completedRef.current = true;
      setEnded(true);
      setProgress(100);
      if (duration > 0) setCurrentTime(duration);
    } catch {
      // Erro comunicado pelo catálogo; não libera a etapa.
    } finally {
      setTestSkipBusy(false);
    }
  };

  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setApiReady(true);
      return
    }
    if (document.getElementById("youtube-iframe-api")) {
      const waitApi = setInterval(() => {
        if (window.YT && window.YT.Player) {
          setApiReady(true);
          clearInterval(waitApi);
        }
      }, 300);
      return () => clearInterval(waitApi);
    }

    const script = document.createElement("script");
    script.id = "youtube-iframe-api";
    script.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(script);

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (previous) previous();
      setApiReady(true);
    };
  }, []);

  useEffect(() => {
    if (!apiReady || !youtubeId || !window.YT || !window.YT.Player) return;
    if (playerRef.current) return;

    playerRef.current = new window.YT.Player(containerId, {
      videoId: youtubeId,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        rel: 0,
        playsinline: 1,
        origin: window.location.origin
      },
      events: {
        onReady: (event: any) => {
          setPlayerReady(true);
          try {
            event.target.setVolume(70);
            event.target.unMute();
          } catch {}

          try {
            const d = Number(event.target.getDuration?.() || 0);
            if (d > 0) setDuration(d);
            if (event.target.setPlaybackRate) {
              event.target.setPlaybackRate(1);
            }
          } catch {}
        },
        onStateChange: (event: any) => {
          const YT = window.YT;
          if (!YT) return;

          if (event.data === YT.PlayerState.PLAYING) {
            startPolling();
          }

          if (event.data === YT.PlayerState.PAUSED) {
            stopPolling();
          }

          if (event.data === YT.PlayerState.ENDED) {
            stopPolling();
            completedRef.current = true;
            setEnded(true);
            setProgress(100);
            try {
              const d = Number(event.target.getDuration?.() || 0);
              if (d > 0) {
                setDuration(d);
                setCurrentTime(d);
              }
            } catch {}
            if (onFinish) onFinish(props.lessonId);
          }
        }
      }
    });

    return () => {
      stopPolling();
      try {
        if (playerRef.current?.destroy) playerRef.current.destroy();
      } catch {}
      playerRef.current = null;
    };
  }, [apiReady, youtubeId, containerId]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = () => {
    if (pollRef.current) return;

    pollRef.current = setInterval(() => {
      const player = playerRef.current;
      if (!player?.getCurrentTime) return;

      try {
        const now = Number(player.getCurrentTime() || 0);
        const total = Number(player.getDuration?.() || 0);

        if (total > 0) setDuration(total);

        if (now > maxWatchedRef.current + 1.5 && !completedRef.current) {
          try {
            player.seekTo(maxWatchedRef.current, true);
          } catch {}
          return;
        }

        if (now > maxWatchedRef.current) {
          maxWatchedRef.current = now;
        }

        setCurrentTime(now);

        const pct = total > 0 ? Math.min(100, (now / total) * 100) : 0;
        setProgress(pct);

        try {
          const rate = player.getPlaybackRate?.();
          if (rate && rate !== 1 && player.setPlaybackRate) {
            player.setPlaybackRate(1);
          }
        } catch {}
      } catch {}
    }, 400);
  };

  const formatTime = (value: number) => {
    const seconds = Math.max(0, Math.floor(value || 0));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes}:${String(rest).padStart(2, "0")}`;
  };

  if (!youtubeId) {
    return (
      <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
        Nenhum vídeo configurado para esta etapa.
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[#071a34] shadow-sm">
        <div className="aspect-video w-full">
          <div id={containerId} className="h-full w-full" />
        </div>

        <div className="border-t border-white/10 bg-white px-4 py-4 md:px-5">
          <div className="mb-2 flex items-center justify-between text-xs md:text-sm">
            <span className="font-semibold text-slate-700">Progresso da etapa</span>
            <span className="font-semibold text-emerald-600">
              {Math.round(progress)}%
            </span>
          </div>

          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px] md:text-xs text-slate-500">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          
          {/* Controle personalizado de volume */}
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-3">
            <button
              type="button"
              onClick={() => changeVolume(volume === 0 ? 70 : 0)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#1F3147] hover:bg-slate-200"
              aria-label={volume === 0 ? 'Ativar som' : 'Silenciar'}
              title={volume === 0 ? 'Ativar som' : 'Silenciar'}
            >
              {volume === 0 ? '🔇' : volume < 50 ? '🔉' : '🔊'}
            </button>

            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={volume}
              onChange={event => changeVolume(Number(event.target.value))}
              aria-label="Volume do vídeo"
              className="h-2 min-w-0 flex-1 cursor-pointer accent-emerald-500"
            />

            <span className="w-10 text-right text-xs font-semibold text-slate-600">
              {volume}%
            </span>
          </div>

{props.canTestSkip && !ended && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => void handleTestSkip()}
                disabled={testSkipBusy}
                className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                {testSkipBusy
                  ? 'Liberando vídeo...'
                  : 'Pular vídeo (DEV)'}
              </button>
            </div>
          )}

          <div className="mt-3 text-xs md:text-sm">
            {!ended ? (
              <p className="text-amber-600">
                Assista até o final para liberar a próxima etapa.
              </p>
            ) : (
              <p className="font-semibold text-emerald-600">
                Etapa concluída. A próxima etapa foi liberada.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">
          Etapa 1 de 2 · Conteúdo obrigatório
        </p>
      </div>
    </div>
  );
}
