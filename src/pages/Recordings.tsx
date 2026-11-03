import {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  format
} from "date-fns";

import {
  ptBR
} from "date-fns/locale";

import {
  Download,
  Eye,
  FileVideo,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Video
} from "lucide-react";

import DashboardLayout
  from "@/components/layouts/DashboardLayout";

import {
  Badge
} from "@/components/ui/badge";

import {
  Button
} from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";

import {
  Input
} from "@/components/ui/input";

import {
  useAuth
} from "@/contexts/AuthContext";

import {
  toast
} from "sonner";
import { useState as useDevRecordingDeleteState } from "react";
import {
  Trash2 as DevRecordingTrash,
  Loader2 as DevRecordingLoader
} from "lucide-react";


/* DEV_RECORDING_CARD_DELETE_V1 */
function DeveloperRecordingCardDelete({
  recording
}: {
  recording: any;
}) {

  const {
    realRole,
    session
  } =
    useAuth() as any;


  const [
    deleting,
    setDeleting
  ] =
    useDevRecordingDeleteState(
      false
    );


  const role =
    String(
      realRole
      || ""
    )
      .trim()
      .toLowerCase();


  const isDeveloper =
    role === "dev"
    ||
    role === "desenvolvedor";


  if (!isDeveloper) {

    return null;
  }


  const status =
    String(
      recording?.status
      || ""
    )
      .trim()
      .toLowerCase();


  const active =
    new Set([
      "starting",
      "recording",
      "running",
      "processing",
      "active",
      "in_progress"
    ])
      .has(
        status
      );


  const failed =
    new Set([
      "failed",
      "failure",
      "error",
      "aborted",
      "abort",
      "timeout",
      "timed_out",
      "cancelled",
      "canceled"
    ])
      .has(
        status
      )
    ||
    Boolean(
      String(
        recording
          ?.error_message
        || ""
      ).trim()
    );


  const remove =
    async (
      event:
        React.MouseEvent
    ) => {

      event.preventDefault();
      event.stopPropagation();


      if (
        active
        ||
        deleting
      ) {

        return;
      }


      const confirmed =
        window.confirm(
          failed
            ?
              "Excluir esta gravação que falhou?\\n\\n"
              +
              "O registro da falha e qualquer arquivo parcial serão removidos definitivamente."
            :
              "Excluir esta gravação?\\n\\n"
              +
              "O arquivo e o registro serão removidos definitivamente."
        );


      if (!confirmed) {

        return;
      }


      const token =
        session
          ?.access_token
        ||
        session
          ?.accessToken
        ||
        "";


      if (!token) {

        window.alert(
          "Sessão inválida. Entre novamente no Portal."
        );

        return;
      }


      setDeleting(
        true
      );


      try {

        const response =
          await fetch(
            `/api/recordings/developer/manage/${
              encodeURIComponent(
                String(
                  recording.id
                )
              )
            }`,
            {
              method:
                "DELETE",

              headers: {
                Authorization:
                  `Bearer ${token}`
              }
            }
          );


        const body =
          await response
            .json()
            .catch(
              () => ({})
            );


        if (!response.ok) {

          throw new Error(
            body
              ?.error
              ?.message
            ||
            "Não foi possível excluir esta gravação."
          );
        }


        /*
         * Atualiza a listagem original.
         */
        window.location.reload();


      } catch (
        error:
          any
      ) {

        window.alert(
          error
            ?.message
          ||
          "Erro ao excluir gravação."
        );


        setDeleting(
          false
        );
      }
    };


  return (
    <button
      type="button"
      onClick={remove}
      disabled={
        active
        ||
        deleting
      }
      title={
        active
          ?
            "Gravação em andamento"
          :
        failed
          ?
            "Excluir gravação que falhou"
          :
            "Excluir gravação"
      }
      aria-label={
        failed
          ?
            "Excluir gravação que falhou"
          :
            "Excluir gravação"
      }
      className="
        absolute
        right-2
        top-2
        z-30
        inline-flex
        h-9
        w-9
        items-center
        justify-center
        rounded-full
        border
        border-red-500/40
        bg-red-600
        text-white
        shadow-md
        transition
        hover:bg-red-700
        focus:outline-none
        focus:ring-2
        focus:ring-red-400
        focus:ring-offset-2
        disabled:cursor-not-allowed
        disabled:opacity-40
      "
    >

      {
        deleting
          ?
            <DevRecordingLoader
              className="
                h-4
                w-4
                animate-spin
              "
            />
          :
            <DevRecordingTrash
              className="
                h-4
                w-4
              "
            />
      }

    </button>
  );
}




interface Recording {
  id: string;
  meeting_id: string | null;
  meeting_title: string;
  meeting_date: string;
  recording_id: string;
  duration_seconds: number | null;
  created_at: string;
  status: string;
  size_bytes: number | null;
  play_url: string | null;
  download_url: string | null;
  error_message?: string | null;
}


export default function Recordings() {

  const {
    user,
    session
  } = useAuth();

  const [
    recordings,
    setRecordings
  ] = useState<Recording[]>([]);

  const [
    loading,
    setLoading
  ] = useState(true);

  const [
    search,
    setSearch
  ] = useState("");

  const token =
    (session as any)
      ?.access_token
    ||
    (session as any)
      ?.accessToken;

  const canDelete =
    [
      "dev",
      "admin"
    ].includes(
      String(
        user?.role || ""
      )
    );


  const load =
    async (
      silent = false
    ) => {

      if (!token) {
        return;
      }

      if (!silent) {
        setLoading(true);
      }

      try {

        const response =
          await fetch(
            "/api/recordings/list",
            {
              headers: {
                Authorization:
                  `Bearer ${token}`
              }
            }
          );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result?.error?.message
            ||
            "Erro ao carregar gravações"
          );
        }

        setRecordings(
          result.data || []
        );

      } catch (error: any) {

        if (!silent) {
          toast.error(
            error?.message
            ||
            "Erro ao carregar gravações"
          );
        }

      } finally {

        if (!silent) {
          setLoading(false);
        }
      }
    };


  useEffect(() => {

    if (!token) {
      return;
    }

    load();

    const timer =
      window.setInterval(
        () => {
          load(true);
        },
        10000
      );

    return () =>
      window.clearInterval(
        timer
      );

  }, [token]);


  const filtered =
    useMemo(
      () => {

        const q =
          search
            .trim()
            .toLowerCase();

        if (!q) {
          return recordings;
        }

        return recordings.filter(
          recording => {

            const title =
              String(
                recording.meeting_title
                ||
                ""
              ).toLowerCase();

            if (
              title.includes(q)
            ) {
              return true;
            }

            try {

              const date =
                new Date(
                  recording.meeting_date
                );

              const formatted =
                format(
                  date,
                  "dd/MM/yyyy HH:mm",
                  {
                    locale:
                      ptBR
                  }
                ).toLowerCase();

              return formatted.includes(
                q
              );

            } catch {

              return false;
            }
          }
        );
      },

      [
        recordings,
        search
      ]
    );


  const duration =
    (
      seconds:
        number | null
    ) => {

      if (!seconds) {
        return "—";
      }

      const hours =
        Math.floor(
          seconds / 3600
        );

      const minutes =
        Math.floor(
          (
            seconds % 3600
          ) / 60
        );

      const secs =
        seconds % 60;

      if (hours > 0) {
        return (
          `${hours}h `
          +
          `${minutes}m `
          +
          `${secs}s`
        );
      }

      return (
        `${minutes}m `
        +
        `${secs}s`
      );
    };


  const fileSize =
    (
      bytes:
        number | null
    ) => {

      if (!bytes) {
        return "—";
      }

      if (
        bytes <
        1024 * 1024
      ) {
        return (
          `${(
            bytes / 1024
          ).toFixed(0)} KB`
        );
      }

      if (
        bytes <
        1024 * 1024 * 1024
      ) {
        return (
          `${(
            bytes
            /
            1024
            /
            1024
          ).toFixed(1)} MB`
        );
      }

      return (
        `${(
          bytes
          /
          1024
          /
          1024
          /
          1024
        ).toFixed(2)} GB`
      );
    };


  const statusLabel =
    (
      status: string
    ) => {

      switch (status) {

        case "starting":
          return "Iniciando";

        case "recording":
          return "Gravando";

        case "processing":
          return "Processando";

        case "completed":
          return "Concluída";

        case "failed":
          return "Falhou";

        case "aborted":
          return "Interrompida";

        case "limit_reached":
          return "Interrompida";

        default:
          return status;
      }
    };


  const deleteRecording =
    async (
      recording:
        Recording
    ) => {

      if (
        !canDelete
        ||
        !token
      ) {
        return;
      }

      if (
        !window.confirm(
          `Excluir "${recording.meeting_title}"?`
        )
      ) {
        return;
      }

      try {

        const response =
          await fetch(
            `/api/recordings/${encodeURIComponent(
              recording.id
            )}`,
            {
              method:
                "DELETE",

              headers: {
                Authorization:
                  `Bearer ${token}`
              }
            }
          );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result?.error?.message
            ||
            "Erro ao excluir"
          );
        }

        toast.success(
          "Gravação excluída"
        );

        await load();

      } catch (error: any) {

        toast.error(
          error?.message
          ||
          "Erro ao excluir gravação"
        );
      }
    };


  return (
    <DashboardLayout>

      <div className="space-y-6">

        <div className="flex items-center justify-between flex-wrap gap-4">

          <div>

            <h1 className="text-3xl font-bold flex items-center gap-2">

              <FileVideo className="w-7 h-7 text-primary" />

              Gravações

            </h1>

            <p className="text-muted-foreground mt-1">

              Todas as reuniões do Digitale Meet são gravadas automaticamente.

            </p>

          </div>

          <Button
            variant="outline"
            disabled={loading}
            onClick={() =>
              load()
            }
          >

            {loading
              ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )
              : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}

            Atualizar

          </Button>

        </div>


        <Card>

          <CardHeader className="pb-3">

            <CardTitle className="text-sm flex items-center gap-2">

              <Search className="w-4 h-4" />

              Buscar gravação

            </CardTitle>

          </CardHeader>

          <CardContent>

            <Input
              placeholder="Buscar por reunião ou data"
              value={search}
              onChange={
                e =>
                  setSearch(
                    e.target.value
                  )
              }
            />

          </CardContent>

        </Card>


        {loading ? (

          <div className="flex justify-center py-12">

            <Loader2 className="w-8 h-8 animate-spin text-primary" />

          </div>

        ) : filtered.length === 0 ? (

          <Card>

            <CardContent className="py-14 text-center">

              <Video className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />

              <p className="font-medium">
                Nenhuma gravação encontrada
              </p>

              <p className="text-sm text-muted-foreground mt-2">
                Ao iniciar uma nova chamada, a gravação começará automaticamente.
              </p>

            </CardContent>

          </Card>

        ) : (

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

            {filtered.map(
              recording => {

                const active =
                  [
                    "starting",
                    "recording",
                    "processing"
                  ].includes(
                    recording.status
                  );

                const failed =
                  [
                    "failed",
                    "aborted",
                    "limit_reached"
                  ].includes(
                    recording.status
                  );

                return (
                  <Card
                    key={
                      recording.id
                    }
                    className="relative overflow-hidden"
                  >

        <DeveloperRecordingCardDelete
          recording={recording}
        />


                    <div className="aspect-video bg-slate-950 flex items-center justify-center relative">

                      <Video className="w-12 h-12 text-white/30" />

                      {active && (
                        <div className="absolute top-3 left-3">

                          <Badge variant="destructive" className="gap-1.5">

                            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />

                            {statusLabel(
                              recording.status
                            )}

                          </Badge>

                        </div>
                      )}

                      {!active && (
                        <div className="absolute top-3 left-3">

                          <Badge
                            variant={
                              failed
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {statusLabel(
                              recording.status
                            )}
                          </Badge>

                        </div>
                      )}

                    </div>


                    <CardContent className="p-4 space-y-4">

                      <div>

                        <h3 className="font-semibold truncate">

                          {recording.meeting_title}

                        </h3>

                        <p className="text-xs text-muted-foreground mt-1">

                          {format(
                            new Date(
                              recording.meeting_date
                            ),
                            "dd/MM/yyyy 'às' HH:mm",
                            {
                              locale:
                                ptBR
                            }
                          )}

                        </p>

                      </div>


                      <div className="flex items-center gap-4 text-xs text-muted-foreground">

                        <span>
                          ⏱ {duration(
                            recording.duration_seconds
                          )}
                        </span>

                        <span>
                          💾 {fileSize(
                            recording.size_bytes
                          )}
                        </span>

                      </div>


                      {recording.error_message && (
                        <p className="text-xs text-destructive">
                          {recording.error_message}
                        </p>
                      )}


                      {recording.status ===
                        "completed"
                        &&
                        recording.play_url && (

                        <div className="flex gap-2">

                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="flex-1"
                          >

                            <a
                              href={
                                recording.play_url
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                            >

                              <Eye className="w-4 h-4 mr-1" />

                              Assistir

                            </a>

                          </Button>


                          <Button
                            asChild
                            size="sm"
                            className="flex-1"
                          >

                            <a
                              href={
                                recording.download_url
                                ||
                                recording.play_url
                              }
                            >

                              <Download className="w-4 h-4 mr-1" />

                              Baixar

                            </a>

                          </Button>


                          {canDelete && (

                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() =>
                                deleteRecording(
                                  recording
                                )
                              }
                            >

                              <Trash2 className="w-4 h-4" />

                            </Button>

                          )}

                        </div>
                      )}


                      {active && (

                        <p className="text-xs text-muted-foreground">

                          O arquivo ficará disponível automaticamente quando a reunião terminar.

                        </p>

                      )}

                    </CardContent>

                  </Card>
                );
              }
            )}

          </div>
        )}

      </div>

    </DashboardLayout>
  );
}
