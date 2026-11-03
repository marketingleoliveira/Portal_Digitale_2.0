import {
  useEffect,
  useState
} from "react";

import {
  useNavigate,
  useParams
} from "react-router-dom";

import {
  ArrowRight,
  Loader2,
  Lock,
  User,
  Video
} from "lucide-react";

import {
  Button
} from "@/components/ui/button";

import {
  Input
} from "@/components/ui/input";

import {
  Label
} from "@/components/ui/label";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";

import Logo
  from "@/components/Logo";

export default function GuestJoin() {

  const {
    code
  } = useParams<{
    code: string
  }>();

  const navigate =
    useNavigate();

  const [
    name,
    setName
  ] = useState("");

  const [
    password,
    setPassword
  ] = useState("");

  const [
    title,
    setTitle
  ] = useState("");

  const [
    needsPassword,
    setNeedsPassword
  ] = useState(false);

  const [
    checking,
    setChecking
  ] = useState(true);

  const [
    joining,
    setJoining
  ] = useState(false);

  const [
    error,
    setError
  ] = useState("");


  useEffect(() => {

    const load =
      async () => {

        if (!code) {
          setError(
            "Código inválido"
          );

          setChecking(false);

          return;
        }

        try {

          const response =
            await fetch(
              `/api/meetings/public/${encodeURIComponent(
                code
              )}`
            );

          const result =
            await response.json();

          if (!response.ok) {
            throw new Error(
              result?.error?.message
              ||
              "Reunião não encontrada"
            );
          }

          if (!result.is_active) {
            throw new Error(
              "Esta reunião já foi encerrada"
            );
          }

          setTitle(
            result.title
          );

          setNeedsPassword(
            !!result.has_password
          );

        } catch (err: any) {

          setError(
            err?.message
            ||
            "Erro ao carregar reunião"
          );

        } finally {

          setChecking(false);
        }
      };

    load();

  }, [code]);


  const join =
    async () => {

      if (
        !code ||
        !name.trim()
      ) {
        return;
      }

      setJoining(true);
      setError("");

      try {

        const response =
          await fetch(
            `/api/meetings/public/${encodeURIComponent(
              code
            )}/join`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify({
                  name:
                    name.trim(),

                  password
                })
            }
          );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result?.error?.message
            ||
            "Não foi possível entrar"
          );
        }

        sessionStorage.setItem(
          `digitale_meeting_${code}`,

          JSON.stringify({
            name:
              name.trim(),

            meetingId:
              result.meetingId,

            meetingCode:
              result.meetingCode,

            title:
              result.title,

            token:
              result.token,

            serverUrl:
              result.serverUrl
          })
        );

        navigate(
          `/convidado/${code}`
        );

      } catch (err: any) {

        setError(
          err?.message
          ||
          "Erro ao entrar na reunião"
        );

      } finally {

        setJoining(false);
      }
    };


  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">

        <Loader2 className="w-8 h-8 animate-spin text-primary" />

      </div>
    );
  }


  if (
    error &&
    !title
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">

        <Card className="w-full max-w-md">

          <CardHeader className="text-center">

            <Logo
              size="lg"
              className="mx-auto mb-4"
            />

            <CardTitle>
              Digitale Meet
            </CardTitle>

            <CardDescription className="text-destructive">
              {error}
            </CardDescription>

          </CardHeader>

        </Card>
      </div>
    );
  }


  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">

      <Card className="w-full max-w-md">

        <CardHeader className="text-center">

          <div className="mx-auto mb-3 w-fit p-3 rounded-full bg-primary/10">

            <Video className="w-8 h-8 text-primary" />

          </div>

          <CardTitle>
            Digitale Meet
          </CardTitle>

          <CardDescription>
            {title}
          </CardDescription>

        </CardHeader>

        <CardContent className="space-y-4">

          <div className="space-y-2">

            <Label className="flex items-center gap-2">

              <User className="w-4 h-4" />

              Seu nome

            </Label>

            <Input
              autoFocus
              value={name}

              onChange={
                e =>
                  setName(
                    e.target.value
                  )
              }
            />

          </div>

          {needsPassword && (
            <div className="space-y-2">

              <Label className="flex items-center gap-2">

                <Lock className="w-4 h-4" />

                Senha da reunião

              </Label>

              <Input
                type="password"
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
                    join()
                }
              />

            </div>
          )}

          {error && (
            <p className="text-sm text-destructive text-center">
              {error}
            </p>
          )}

          <Button
            className="w-full"
            disabled={
              joining
              ||
              !name.trim()
            }

            onClick={
              join
            }
          >

            {joining
              ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              )
              : (
                <ArrowRight className="w-4 h-4 mr-2" />
              )}

            Entrar na reunião

          </Button>

          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
            <p className="text-xs font-medium text-red-700">
              Esta reunião é gravada automaticamente.
            </p>
            <p className="text-[11px] text-red-600 mt-1">
              Ao entrar na reunião, você estará participando de uma chamada gravada pela Digitale.
            </p>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Nenhuma conta externa é necessária.
          </p>

        </CardContent>
      </Card>
    </div>
  );
}
