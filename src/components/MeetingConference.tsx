import { useEffect, useState } from "react";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  VideoConference,
  useLocalParticipant
} from "@livekit/components-react";

import {
  BackgroundProcessor,
  supportsBackgroundProcessors
} from "@livekit/track-processors";

import type { LocalVideoTrack } from "livekit-client";

import {
  Video,
  Aperture,
  Loader2
} from "lucide-react";

import "@livekit/components-styles";

interface Props {
  token: string;
  serverUrl: string;
  title: string;
  onLeave: () => void;
}

type BlurMode = "off" | "soft" | "strong";

function CameraBlurControls() {
  const { cameraTrack, isCameraEnabled } =
    useLocalParticipant();

  const [mode, setMode] =
    useState<BlurMode>("off");

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const track = cameraTrack?.track as
    LocalVideoTrack | undefined;

  const supported =
    typeof window !== "undefined" &&
    supportsBackgroundProcessors();

  useEffect(() => {
    if (!track || !supported) return;

    let cancelled = false;

    async function applyEffect() {
      if (!track) return;

      setBusy(true);
      setMessage("");

      try {
        if (mode === "off") {
          await track.stopProcessor();
        } else {
          const processor = BackgroundProcessor({
            mode: "background-blur",
            blurRadius: mode === "strong" ? 18 : 8
          });

          await track.setProcessor(processor);
        }
      } catch (error) {
        console.error(
          "Digitale Meet: falha no desfoque",
          error
        );

        if (!cancelled) {
          setMessage(
            "Não foi possível aplicar o desfoque."
          );
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    void applyEffect();

    return () => {
      cancelled = true;
    };
  }, [track, mode, supported]);

  if (!supported) {
    return (
      <span className="text-xs text-amber-300">
        Desfoque indisponível neste navegador
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Aperture
        size={16}
        className="text-blue-400"
      />

      <label
        htmlFor="digitale-camera-blur"
        className="text-xs text-white/80"
      >
        Fundo
      </label>

      <select
        id="digitale-camera-blur"
        value={mode}
        disabled={busy || !track || !isCameraEnabled}
        onChange={(event) =>
          setMode(event.target.value as BlurMode)
        }
        className="h-8 rounded-md border border-white/20 bg-[#26334c] px-2 text-xs text-white outline-none focus:border-blue-400 disabled:opacity-50"
        aria-label="Efeito de fundo da câmera"
      >
        <option value="off">Sem desfoque</option>
        <option value="soft">Desfoque suave</option>
        <option value="strong">Desfoque forte</option>
      </select>

      {busy && (
        <Loader2
          size={15}
          className="animate-spin text-blue-400"
        />
      )}

      {message && (
        <span
          role="alert"
          className="text-xs text-red-300"
        >
          {message}
        </span>
      )}
    </div>
  );
}

export default function MeetingConference({
  token,
  serverUrl,
  title,
  onLeave
}: Props) {
  const [error, setError] = useState("");

  return (
    <div
      className="relative h-full w-full bg-[#0b1220]"
      data-lk-theme="default"
    >
      {error && (
        <div className="absolute z-50 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg shadow-lg text-sm">
          {error}
        </div>
      )}

      <div className="rounded-full bg-red-600 text-white text-xs font-medium px-3 py-1.5 shadow-lg pointer-events-none fixed z-[70] bottom-4 right-4">
        <span className="inline-block w-2 h-2 rounded-full bg-white mr-2 animate-pulse" />
        Gravação automática
      </div>

      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect={true}
        audio={false}
        video={true}
        options={{
          adaptiveStream: true,
          dynacast: true
        }}
        onConnected={() => setError("")}
        onDisconnected={onLeave}
        onError={(err) => {
          console.error("DIGITALE WEBRTC:", err);
          setError(
            err?.message ||
            "Erro na videoconferência"
          );
        }}
        className="h-full w-full"
        data-lk-theme="default"
      >
        <div className="h-full flex flex-col">
          <div className="min-h-12 shrink-0 flex flex-wrap items-center gap-3 px-4 py-2 border-b border-white/10 bg-[#111827] text-white">
            <Video className="w-4 h-4 text-blue-400" />

            <span className="text-sm font-medium truncate">
              {title}
            </span>

            <div className="ml-auto flex items-center gap-4">
              <CameraBlurControls />

              <span className="text-[11px] text-white/50">
                Digitale Meet
              </span>
            </div>
          </div>

          <div className="flex-1 min-h-0">
            <VideoConference />
          </div>

          <RoomAudioRenderer />

          <StartAudio
            label="Ativar áudio da reunião"
          />
        </div>
      </LiveKitRoom>
    </div>
  );
}
