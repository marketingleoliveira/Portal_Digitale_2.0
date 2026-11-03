import {
  useEffect,
  useState
} from "react";

import {
  useNavigate,
  useParams
} from "react-router-dom";

import {
  Copy,
  Loader2,
  Lock,
  PhoneOff,
  Video
} from "lucide-react";

import {
  toast
} from "sonner";

import {
  Button
} from "@/components/ui/button";

import {
  Input
} from "@/components/ui/input";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";

import {
  useAuth
} from "@/contexts/AuthContext";

import MeetingConference
  from "@/components/MeetingConference";

interface JoinData {
  meetingId: string;
  meetingCode: string;
  title: string;
  token: string;
  serverUrl: string;
  isHost: boolean;
  moderator: boolean;
}

export default function MeetingRoom() {

  const {
    code
  } = useParams<{
    code: string
  }>();

  const navigate =
    useNavigate();

  const {
    session
  } = useAuth();

  const [
    joinData,
    setJoinData
  ] = useState<JoinData | null>(
    null
  );

  const [
    loading,
    setLoading
  ] = useState(true);

  const [
    passwordRequired,
    setPasswordRequired
  ] = useState(false);

  const [
    password,
    setPassword
  ] = useState("");

  const [
    title,
    setTitle
  ] = useState("");

  const [
    error,
    setError
  ] = useState("");

  const token =
    (session as any)
      ?.access_token
    ||
    (session as any)
      ?.accessToken;


  const join =
    async (
      passwordValue = ""
    ) => {

      if (
        !code ||
        !token
      ) {
        return;
      }

      setLoading(true);
      setError("");

      try {

        const response =
          await fetch(
            `/api/meetings/member/${encodeURIComponent(
              code
            )}/join`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",

                Authorization:
                  `Bearer ${token}`
              },

              body:
                JSON.stringify({
                  password:
                    passwordValue
                })
            }
          );

        const result =
          await response.json();

        if (
          response.status === 403
          &&
          result
            ?.password_required
        ) {

          setPasswordRequired(
            true
          );

          setTitle(
            result.title || ""
          );

          if (passwordValue) {
            setError(
              "Senha incorreta"
            );
          }

          return;
        }

        if (!response.ok) {
          throw new Error(
            result?.error?.message
            ||
            "Erro ao entrar na reunião"
          );
        }

        setPasswordRequired(
          false
        );

        setJoinData(
          result
        );

        setTitle(
          result.title
        );

      } catch (err: any) {

        setError(
          err?.message
          ||
          "Erro ao entrar na reunião"
        );

      } finally {

        setLoading(false);
      }
    };


  useEffect(() => {

    if (
      code &&
      token
    ) {
      join();
    }

  }, [
    code,
    token
  ]);


  const endMeeting =
    async () => {

      if (
        !joinData ||
        !token
      ) {
        return;
      }

      try {

        const response =
          await fetch(
            `/api/meetings/${joinData.meetingId}/end`,
            {
              method: "POST",

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
            "Erro ao encerrar"
          );
        }

        toast.success(
          "Reunião encerrada"
        );

        navigate(
          "/reunioes"
        );

      } catch (err: any) {

        toast.error(
          err?.message
          ||
          "Erro ao encerrar reunião"
        );
      }
    };


  const copyGuestLink =
    async () => {

      await navigator.clipboard
        .writeText(
          `${window.location.origin}/entrar/${code}`
        );

      toast.success(
        "Link para convidados copiado"
      );
    };


  if (
    loading &&
    !passwordRequired
    &&
    !joinData
  ) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">

        <Loader2 className="w-9 h-9 animate-spin text-primary mb-3" />

        <p>
          Preparando Digitale Meet...
        </p>

      </div>
    );
  }


  if (
    passwordRequired
    &&
    !joinData
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">

        <Card className="w-full max-w-md">

          <CardHeader>
            <CardTitle className="flex items-center gap-2">

              <Lock className="w-5 h-5" />

              Reunião protegida

            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">

            {title && (
              <p className="font-medium">
                {title}
              </p>
            )}

            <Input
              type="password"
              autoFocus
              placeholder="Senha da reunião"
              value={password}

              onChange={
                e =>
                  setPassword(
                    e.target.value
                  )
              }

              onKeyDown={
                e =>
                  e.key === "Enter"
                  &&
                  join(password)
              }
            />

            {error && (
              <p className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              className="w-full"

              onClick={() =>
                join(password)
              }
            >
              Entrar
            </Button>

          </CardContent>
        </Card>
      </div>
    );
  }


  if (
    error &&
    !joinData
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">

        <Card className="w-full max-w-md">

          <CardContent className="pt-6 text-center space-y-4">

            <Video className="w-12 h-12 mx-auto text-muted-foreground" />

            <p className="text-destructive">
              {error}
            </p>

            <Button
              onClick={() =>
                navigate(
                  "/reunioes"
                )
              }
            >
              Voltar
            </Button>

          </CardContent>
        </Card>
      </div>
    );
  }


  if (!joinData) {
    return null;
  }


  return (
    <div className="h-screen flex flex-col bg-[#0b1220]">

      <header className="h-14 shrink-0 px-4 flex items-center gap-3 border-b border-white/10 bg-[#111827] text-white">

        <Video className="w-5 h-5 text-blue-400" />

        <div className="min-w-0 flex-1">

          <p className="font-semibold truncate">
            {joinData.title}
          </p>

          <p className="text-xs text-white/50">
            {joinData.meetingCode}
          </p>

        </div>

        <Button
          variant="secondary"
          size="sm"
          className="gap-2"

          onClick={
            copyGuestLink
          }
        >
          <Copy className="w-4 h-4" />
          Convidar
        </Button>

        {(
          joinData.isHost
          ||
          joinData.moderator
        ) && (
          <Button
            variant="destructive"
            size="sm"
            className="gap-2"

            onClick={
              endMeeting
            }
          >
            <PhoneOff className="w-4 h-4" />
            Encerrar
          </Button>
        )}

      </header>

      <div className="flex-1 min-h-0">

        <MeetingConference
          token={
            joinData.token
          }

          serverUrl={
            joinData.serverUrl
          }

          title={
            joinData.title
          }

          onLeave={() =>
            navigate(
              "/reunioes"
            )
          }
        />

      </div>

    </div>
  );
}
