import {
  useEffect,
  useState
} from "react";

import {
  useNavigate
} from "react-router-dom";

import DashboardLayout
  from "@/components/layouts/DashboardLayout";
import MeetingScheduler from "@/components/meeting/MeetingScheduler";

import {
  Button
} from "@/components/ui/button";

import {
  Input
} from "@/components/ui/input";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

import {
  Label
} from "@/components/ui/label";

import {
  Video,
  Keyboard,
  History,
  Lock,
  Eye,
  EyeOff,
  Trash2,
  UserPlus,
  Loader2
} from "lucide-react";

import {
  toast
} from "sonner";

import {
  useAuth
} from "@/contexts/AuthContext";

import {
  isDevLevel
} from "@/types/auth";

interface Meeting {
  id: string;
  title: string;
  meeting_code: string;
  host_user_id: string;
  is_active: number | boolean;
  created_at: string;
  has_password: boolean;
  host_profile?: {
    full_name: string;
    avatar_url: string | null;
  } | null;
}

export default function Meetings() {
  const {
    user,
    session
  } = useAuth();

  const navigate =
    useNavigate();

  const [meetings, setMeetings] =
    useState<Meeting[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [
    createDialogOpen,
    setCreateDialogOpen
  ] = useState(false);

  const [
    creating,
    setCreating
  ] = useState(false);

  const [
    endingAll,
    setEndingAll
  ] = useState(false);

  const [
    endingId,
    setEndingId
  ] = useState<string | null>(
    null
  );

  const [
    joinCode,
    setJoinCode
  ] = useState("");

  const [
    showPassword,
    setShowPassword
  ] = useState(false);

  const [
    newMeeting,
    setNewMeeting
  ] = useState({
    title: "",
    password: ""
  });

  const isDev =
    isDevLevel(
      user?.role
    );

  const token =
    (session as any)
      ?.access_token ||
    (session as any)
      ?.accessToken;

  const authFetch =
    async (
      url: string,
      options: RequestInit = {}
    ) => {
      if (!token) {
        throw new Error(
          "Sessão inválida"
        );
      }

      return fetch(
        url,
        {
          ...options,

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`,

            ...(options.headers || {})
          }
        }
      );
    };

  const loadMeetings =
    async () => {
      if (!token) {
        return;
      }

      try {
        const response =
          await authFetch(
            "/api/meetings/list"
          );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result?.error?.message ||
            "Erro ao carregar reuniões"
          );
        }

        setMeetings(
          result.data || []
        );

      } catch (error) {
        console.error(
          error
        );

        toast.error(
          "Erro ao carregar reuniões"
        );

      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    if (token) {
      loadMeetings();
    }
  }, [token]);

  const createMeeting =
    async () => {
      if (
        !newMeeting.title.trim()
      ) {
        toast.error(
          "Informe o nome da reunião"
        );

        return;
      }

      setCreating(true);

      try {
        const response =
          await authFetch(
            "/api/meetings/create",
            {
              method: "POST",

              body:
                JSON.stringify({
                  title:
                    newMeeting.title
                      .trim(),

                  password:
                    newMeeting.password
                      .trim()
                })
            }
          );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result?.error?.message ||
            "Erro ao criar reunião"
          );
        }

        toast.success(
          "Reunião criada!"
        );

        setCreateDialogOpen(
          false
        );

        setNewMeeting({
          title: "",
          password: ""
        });

        await loadMeetings();

        window.open(
          `/reuniao/${result.meeting_code}`,
          "_blank",
          "noopener,noreferrer"
        );

      } catch (error: any) {
        toast.error(
          error?.message ||
          "Erro ao criar reunião"
        );

      } finally {
        setCreating(false);
      }
    };

  const joinMeeting = () => {
    const code =
      joinCode
        .trim()
        .toLowerCase();

    if (!code) {
      toast.error(
        "Informe o código da reunião"
      );

      return;
    }

    navigate(
      `/reuniao/${code}`
    );
  };

  const copyGuestLink =
    async (
      code: string
    ) => {
      const link =
        `${window.location.origin}/entrar/${code}`;

      await navigator.clipboard
        .writeText(link);

      toast.success(
        "Link para convidados copiado!"
      );
    };

  const endMeeting =
    async (
      meeting: Meeting
    ) => {
      setEndingId(
        meeting.id
      );

      try {
        const response =
          await authFetch(
            `/api/meetings/${meeting.id}/end`,
            {
              method: "POST"
            }
          );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result?.error?.message ||
            "Erro ao encerrar"
          );
        }

        toast.success(
          "Reunião encerrada"
        );

        await loadMeetings();

      } catch (error: any) {
        toast.error(
          error?.message ||
          "Erro ao encerrar reunião"
        );

      } finally {
        setEndingId(null);
      }
    };

  const endAll =
    async () => {
      setEndingAll(true);

      try {
        const response =
          await authFetch(
            "/api/meetings/end-all",
            {
              method: "POST"
            }
          );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result?.error?.message ||
            "Erro ao encerrar reuniões"
          );
        }

        toast.success(
          `${result.count || 0} reunião(ões) encerrada(s)`
        );

        await loadMeetings();

      } catch (error: any) {
        toast.error(
          error?.message ||
          "Erro ao encerrar reuniões"
        );

      } finally {
        setEndingAll(false);
      }
    };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <MeetingScheduler />

        <div className="grid md:grid-cols-2 gap-6">

          <Card className="border-0 shadow-lg bg-gradient-to-br from-primary/5 to-primary/10">
            <CardHeader>
              <CardTitle className="text-2xl flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <Video className="w-6 h-6 text-primary" />
                </div>

                Videoconferência
              </CardTitle>

              <CardDescription>
                Crie ou participe de reuniões por vídeo
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">

              <Button
                size="lg"
                className="gap-2 bg-[#F59E0B] hover:bg-[#D97706] text-white hover:text-white border-transparent"
                onClick={() =>
                  setCreateDialogOpen(
                    true
                  )
                }
              >
                <Video className="w-5 h-5" />
                Nova reunião
              </Button>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />

                  <Input
                    className="pl-10"
                    placeholder="Informe o código da reunião"
                    value={joinCode}
                    onChange={
                      e =>
                        setJoinCode(
                          e.target.value
                        )
                    }
                    onKeyDown={
                      e =>
                        e.key ===
                          "Enter" &&
                        joinMeeting()
                    }
                  />
                </div>

                <Button
                  variant="secondary"
                  onClick={
                    joinMeeting
                  }
                >
                  Participar
                </Button>
              </div>

            </CardContent>
          </Card>


          <Card className="border-0 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">

              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Reuniões ativas
              </CardTitle>

              {isDev &&
               meetings.length >
                 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={endAll}
                  disabled={
                    endingAll
                  }
                >
                  {endingAll
                    ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )
                    : (
                      <>
                        <Trash2 className="w-4 h-4 mr-1" />
                        Encerrar tudo
                      </>
                    )}
                </Button>
              )}
            </CardHeader>

            <CardContent>
              {loading ? (
                <div className="py-10 flex justify-center">
                  <Loader2 className="w-7 h-7 animate-spin text-primary" />
                </div>

              ) : meetings.length ===
                  0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Video className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  Nenhuma reunião ativa
                </div>

              ) : (
                <div className="space-y-3 max-h-[360px] overflow-auto">

                  {meetings.map(
                    meeting => (
                      <div
                        key={
                          meeting.id
                        }
                        className="flex items-center gap-2 rounded-lg border p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">
                              {meeting.title}
                            </p>

                            {meeting.has_password && (
                              <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                            )}
                          </div>

                          <p className="text-xs text-muted-foreground">
                            {meeting.meeting_code}
                            {" • "}
                            {new Date(
                              meeting.created_at
                            ).toLocaleDateString(
                              "pt-BR"
                            )}
                          </p>

                          {meeting
                            .host_profile
                            ?.full_name && (
                            <p className="text-xs text-muted-foreground truncate">
                              Anfitrião:{" "}
                              {
                                meeting
                                  .host_profile
                                  .full_name
                              }
                            </p>
                          )}
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          title="Copiar link de convidado"
                          onClick={() =>
                            copyGuestLink(
                              meeting
                                .meeting_code
                            )
                          }
                        >
                          <UserPlus className="w-4 h-4" />
                        </Button>

                        {isDev && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            disabled={
                              endingId ===
                              meeting.id
                            }
                            onClick={() =>
                              endMeeting(
                                meeting
                              )
                            }
                          >
                            {endingId ===
                            meeting.id
                              ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              )
                              : (
                                <Trash2 className="w-4 h-4" />
                              )}
                          </Button>
                        )}

                        <Button
                          size="sm"
                          onClick={() =>
                            navigate(
                              `/reuniao/${meeting.meeting_code}`
                            )
                          }
                        >
                          Entrar
                        </Button>
                      </div>
                    )
                  )}

                </div>
              )}
            </CardContent>
          </Card>
        </div>


        <div className="grid sm:grid-cols-3 gap-4">

          <Card className="p-5">
            <h3 className="font-semibold">
              Vídeo e áudio
            </h3>

            <p className="text-sm text-muted-foreground mt-2">
              Reuniões com câmera e microfone diretamente no navegador.
            </p>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold">
              Compartilhamento
            </h3>

            <p className="text-sm text-muted-foreground mt-2">
              Compartilhe a tela com os demais participantes.
            </p>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold">
              Convidados
            </h3>

            <p className="text-sm text-muted-foreground mt-2">
              Envie um link para pessoas externas entrarem pelo navegador.
            </p>
          </Card>

        </div>
      </div>


      <Dialog
        open={createDialogOpen}
        onOpenChange={
          setCreateDialogOpen
        }
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Nova reunião
            </DialogTitle>

            <DialogDescription>
              Crie uma nova sala de videoconferência.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">

            <div className="space-y-2">
              <Label>
                Nome da reunião
              </Label>

              <Input
                autoFocus
                value={
                  newMeeting.title
                }
                onChange={
                  e =>
                    setNewMeeting({
                      ...newMeeting,
                      title:
                        e.target.value
                    })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>
                Senha opcional
              </Label>

              <div className="relative">
                <Input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  className="pr-10"
                  value={
                    newMeeting.password
                  }
                  onChange={
                    e =>
                      setNewMeeting({
                        ...newMeeting,
                        password:
                          e.target.value
                      })
                  }
                />

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0"
                  onClick={() =>
                    setShowPassword(
                      !showPassword
                    )
                  }
                >
                  {showPassword
                    ? (
                      <EyeOff className="w-4 h-4" />
                    )
                    : (
                      <Eye className="w-4 h-4" />
                    )}
                </Button>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={
                createMeeting
              }
              disabled={
                creating
              }
            >
              {creating && (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              )}

              Criar reunião
            </Button>
          </div>

        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
