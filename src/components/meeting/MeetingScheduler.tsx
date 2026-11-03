import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CalendarClock,
  Clock,
  Copy,
  ExternalLink,
  Link2,
  Lock,
  RefreshCw,
  Trash2,
  Video,
} from "lucide-react";

import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


type ScheduledMeeting = {
  id: string;
  title: string;
  meeting_code: string;

  scheduled_start:
    | string
    | null;

  scheduled_end:
    | string
    | null;

  started_at?:
    | string
    | null;

  ended_at?:
    | string
    | null;

  is_active?:
    | boolean
    | number
    | null;

  password?:
    | string
    | null;

  created_at?: string;
};


function pad(
  value: number
) {
  return String(value)
    .padStart(2, "0");
}


function localInputValue(
  date: Date
) {

  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
}


function nextSuggestedTime() {

  const date =
    new Date(
      Date.now()
      +
      60 * 60 * 1000
    );

  const minutes =
    date.getMinutes();

  const rounded =
    Math.ceil(minutes / 15)
    * 15;

  date.setMinutes(
    rounded,
    0,
    0
  );

  return localInputValue(
    date
  );
}


function minimumScheduleTime() {

  return localInputValue(
    new Date(
      Date.now()
      +
      2 * 60 * 1000
    )
  );
}


function generateMeetingCode() {

  const chars =
    "abcdefghijklmnopqrstuvwxyz";

  const group =
    (size: number) => {

      let value = "";

      for (
        let index = 0;
        index < size;
        index++
      ) {

        value +=
          chars.charAt(
            Math.floor(
              Math.random()
              *
              chars.length
            )
          );
      }

      return value;
    };


  return [
    group(3),
    group(4),
    group(3),
  ].join("-");
}


function formatMeetingDate(
  value:
    | string
    | null
) {

  if (!value) {
    return "Sem horário";
  }

  const date =
    new Date(value);

  return date
    .toLocaleString(
      "pt-BR",
      {
        day:
          "2-digit",

        month:
          "2-digit",

        year:
          "numeric",

        hour:
          "2-digit",

        minute:
          "2-digit",
      }
    );
}


function meetingStatus(
  meeting: ScheduledMeeting
) {

  if (!meeting.scheduled_start) {

    return {
      label:
        "Sem horário",

      className:
        "bg-slate-100 text-slate-700",
    };
  }


  const now =
    Date.now();

  const start =
    new Date(
      meeting.scheduled_start
    ).getTime();

  const end =
    meeting.scheduled_end
      ?
      new Date(
        meeting.scheduled_end
      ).getTime()
      :
      start
      +
      60 * 60 * 1000;


  if (
    now >= start
    &&
    now <= end
  ) {

    return {
      label:
        "No horário",

      className:
        "bg-green-100 text-green-700",
    };
  }


  if (now < start) {

    return {
      label:
        "Agendada",

      className:
        "bg-blue-100 text-blue-700",
    };
  }


  return {
    label:
      "Horário encerrado",

    className:
      "bg-slate-100 text-slate-600",
  };
}


export default function MeetingScheduler() {

  const { user } =
    useAuth();


  const [
    dialogOpen,
    setDialogOpen
  ] =
    useState(false);


  const [
    loading,
    setLoading
  ] =
    useState(false);


  const [
    loadingMeetings,
    setLoadingMeetings
  ] =
    useState(true);


  const [
    cancellingId,
    setCancellingId
  ] =
    useState<string | null>(
      null
    );


  const [
    meetings,
    setMeetings
  ] =
    useState<
      ScheduledMeeting[]
    >([]);


  const [
    form,
    setForm
  ] =
    useState({
      title:
        "",

      scheduledAt:
        nextSuggestedTime(),

      duration:
        "60",

      password:
        "",
    });


  const loadScheduledMeetings =
    useCallback(
      async () => {

        if (!user?.id) {

          setMeetings([]);
          setLoadingMeetings(false);

          return;
        }


        try {

          const {
            data,
            error
          } =
            await supabase
              .from("meetings")
              .select("*")
              .eq(
                "host_user_id",
                user.id
              )
              .is(
                "ended_at",
                null
              )
              .order(
                "created_at",
                {
                  ascending:
                    false,
                }
              )
              .limit(100);


          if (error) {
            throw error;
          }


          const now =
            Date.now();


          const scheduled =
            (
              data
              ||
              []
            )
            .filter(
              (
                meeting:
                  ScheduledMeeting
              ) => {

                if (
                  !meeting
                    .scheduled_start
                ) {

                  return false;
                }


                if (
                  meeting.is_active
                  === false
                  ||
                  meeting.is_active
                  === 0
                ) {

                  return false;
                }


                const reference =
                  meeting
                    .scheduled_end
                  ||
                  meeting
                    .scheduled_start;


                const time =
                  new Date(
                    reference
                  ).getTime();


                /*
                 * Mantém reuniões que
                 * ainda acontecerão e
                 * também as recentes.
                 */
                return (
                  Number.isFinite(
                    time
                  )
                  &&
                  time
                  >=
                  now
                  -
                  2
                  *
                  60
                  *
                  60
                  *
                  1000
                );
              }
            )
            .sort(
              (
                a:
                  ScheduledMeeting,
                b:
                  ScheduledMeeting
              ) => {

                return (
                  new Date(
                    a.scheduled_start!
                  ).getTime()
                  -
                  new Date(
                    b.scheduled_start!
                  ).getTime()
                );
              }
            );


          setMeetings(
            scheduled
          );


        } catch (error) {

          console.error(
            "Erro ao carregar reuniões agendadas:",
            error
          );


        } finally {

          setLoadingMeetings(
            false
          );
        }
      },
      [
        user?.id
      ]
    );


  useEffect(
    () => {

      void loadScheduledMeetings();


      const timer =
        window.setInterval(
          () => {

            void loadScheduledMeetings();

          },
          30000
        );


      return () => {

        window.clearInterval(
          timer
        );
      };

    },
    [
      loadScheduledMeetings
    ]
  );


  const upcomingCount =
    useMemo(
      () => {

        const now =
          Date.now();

        return meetings
          .filter(
            meeting =>
              meeting
                .scheduled_start
              &&
              new Date(
                meeting
                  .scheduled_start
              ).getTime()
              >
              now
          )
          .length;

      },
      [
        meetings
      ]
    );


  const createScheduledMeeting =
    async () => {

      if (!user?.id) {

        toast.error(
          "Sessão inválida."
        );

        return;
      }


      const title =
        form.title.trim();


      if (!title) {

        toast.error(
          "Informe o nome da reunião."
        );

        return;
      }


      if (!form.scheduledAt) {

        toast.error(
          "Informe a data e o horário."
        );

        return;
      }


      const start =
        new Date(
          form.scheduledAt
        );


      if (
        !Number.isFinite(
          start.getTime()
        )
      ) {

        toast.error(
          "Data ou horário inválido."
        );

        return;
      }


      if (
        start.getTime()
        <=
        Date.now()
        +
        60 * 1000
      ) {

        toast.error(
          "Escolha um horário futuro."
        );

        return;
      }


      const duration =
        Number(
          form.duration
        );


      if (
        !Number.isFinite(
          duration
        )
        ||
        duration < 15
      ) {

        toast.error(
          "Duração inválida."
        );

        return;
      }


      const end =
        new Date(
          start.getTime()
          +
          duration
          *
          60
          *
          1000
        );


      setLoading(
        true
      );


      try {

        const meetingCode =
          generateMeetingCode();


        const {
          data,
          error
        } =
          await supabase
            .from(
              "meetings"
            )
            .insert({
              title,

              meeting_code:
                meetingCode,

              host_user_id:
                user.id,

              is_active:
                true,

              scheduled_start:
                start
                  .toISOString(),

              scheduled_end:
                end
                  .toISOString(),

              started_at:
                null,

              ended_at:
                null,

              password:
                form.password
                  .trim()
                ||
                null,
            })
            .select()
            .single();


        if (error) {
          throw error;
        }


        setDialogOpen(
          false
        );


        setForm({
          title:
            "",

          scheduledAt:
            nextSuggestedTime(),

          duration:
            "60",

          password:
            "",
        });


        await loadScheduledMeetings();


        const guestLink =
          `${window.location.origin}/entrar/${
            data.meeting_code
          }`;


        try {

          await navigator
            .clipboard
            .writeText(
              guestLink
            );

          toast.success(
            "Chamada agendada! O link do convite foi copiado."
          );

        } catch {

          toast.success(
            "Chamada agendada com sucesso!"
          );
        }


      } catch (error) {

        console.error(
          "Erro ao agendar chamada:",
          error
        );


        toast.error(
          "Não foi possível agendar a chamada."
        );


      } finally {

        setLoading(
          false
        );
      }
    };


  const copyGuestLink =
    async (
      meeting:
        ScheduledMeeting
    ) => {

      const link =
        `${window.location.origin}/entrar/${
          meeting.meeting_code
        }`;


      try {

        await navigator
          .clipboard
          .writeText(
            link
          );

        toast.success(
          "Link do convite copiado!"
        );

      } catch {

        toast.error(
          "Não foi possível copiar o link."
        );
      }
    };


  const copyInternalLink =
    async (
      meeting:
        ScheduledMeeting
    ) => {

      const link =
        `${window.location.origin}/reuniao/${
          meeting.meeting_code
        }`;


      try {

        await navigator
          .clipboard
          .writeText(
            link
          );

        toast.success(
          "Link interno copiado!"
        );

      } catch {

        toast.error(
          "Não foi possível copiar o link."
        );
      }
    };


  const cancelMeeting =
    async (
      meeting:
        ScheduledMeeting
    ) => {

      const confirmed =
        window.confirm(
          `Cancelar a chamada agendada "${meeting.title}"?`
        );


      if (!confirmed) {
        return;
      }


      setCancellingId(
        meeting.id
      );


      try {

        const {
          error
        } =
          await supabase
            .from(
              "meetings"
            )
            .update({
              is_active:
                false,

              ended_at:
                new Date()
                  .toISOString(),
            })
            .eq(
              "id",
              meeting.id
            );


        if (error) {
          throw error;
        }


        toast.success(
          "Chamada agendada cancelada."
        );


        await loadScheduledMeetings();


      } catch (error) {

        console.error(
          "Erro ao cancelar reunião:",
          error
        );


        toast.error(
          "Não foi possível cancelar a chamada."
        );


      } finally {

        setCancellingId(
          null
        );
      }
    };


  return (
    <>
      <Card className="border-0 shadow-lg overflow-hidden">

        <CardHeader className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">

            <div>

              <CardTitle className="flex items-center gap-2 text-xl">

                <CalendarClock className="h-5 w-5 text-primary" />

                Chamadas agendadas

              </CardTitle>

              <CardDescription className="mt-2">

                Crie uma chamada agora para uma data futura e compartilhe o link com antecedência.

              </CardDescription>

            </div>


            <div className="flex items-center gap-2">

              <Badge
                variant="secondary"
                className="whitespace-nowrap"
              >
                {upcomingCount}
                {" "}
                próxima
                {upcomingCount === 1 ? "" : "s"}
              </Badge>


              <Button
                type="button"
                onClick={() =>
                  setDialogOpen(
                    true
                  )
                }
                className="gap-2"
              >

                <CalendarClock className="h-4 w-4" />

                Agendar chamada futura

              </Button>

            </div>

          </div>

        </CardHeader>


        <CardContent className="pt-5">

          {loadingMeetings ? (

            <div className="py-8 flex justify-center">

              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />

            </div>

          ) : meetings.length === 0 ? (

            <div className="py-8 text-center text-muted-foreground">

              <CalendarClock className="h-10 w-10 mx-auto mb-3 opacity-30" />

              <p className="font-medium">
                Nenhuma chamada futura agendada
              </p>

              <p className="text-sm mt-1">
                Use o botão acima para programar uma reunião.
              </p>

            </div>

          ) : (

            <div className="space-y-3">

              {meetings.map(
                meeting => {

                  const status =
                    meetingStatus(
                      meeting
                    );


                  return (
                    <div
                      key={meeting.id}
                      className="border rounded-xl p-4 flex flex-col xl:flex-row xl:items-center gap-4"
                    >

                      <div className="flex-1 min-w-0">

                        <div className="flex flex-wrap items-center gap-2">

                          <h3 className="font-semibold truncate">
                            {meeting.title}
                          </h3>


                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${status.className}`}
                          >
                            {status.label}
                          </span>


                          {meeting.password && (

                            <Lock className="h-3.5 w-3.5 text-muted-foreground" />

                          )}

                        </div>


                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">

                          <span className="flex items-center gap-1">

                            <CalendarClock className="h-4 w-4" />

                            {formatMeetingDate(
                              meeting.scheduled_start
                            )}

                          </span>


                          {meeting.scheduled_end && (

                            <span className="flex items-center gap-1">

                              <Clock className="h-4 w-4" />

                              até
                              {" "}
                              {new Date(
                                meeting.scheduled_end
                              ).toLocaleTimeString(
                                "pt-BR",
                                {
                                  hour:
                                    "2-digit",

                                  minute:
                                    "2-digit",
                                }
                              )}

                            </span>

                          )}


                          <span className="font-mono text-xs">

                            {meeting.meeting_code}

                          </span>

                        </div>

                      </div>


                      <div className="flex flex-wrap items-center gap-2">

                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          onClick={() =>
                            void copyGuestLink(
                              meeting
                            )
                          }
                        >

                          <Link2 className="h-4 w-4" />

                          Convite

                        </Button>


                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          title="Copiar link interno"
                          onClick={() =>
                            void copyInternalLink(
                              meeting
                            )
                          }
                        >

                          <Copy className="h-4 w-4" />

                        </Button>


                        <Button
                          type="button"
                          size="sm"
                          className="gap-2"
                          onClick={() =>
                            window.open(
                              `/reuniao/${
                                meeting.meeting_code
                              }`,
                              "_blank"
                            )
                          }
                        >

                          <Video className="h-4 w-4" />

                          Entrar

                          <ExternalLink className="h-3.5 w-3.5" />

                        </Button>


                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          title="Cancelar chamada"
                          disabled={
                            cancellingId
                            ===
                            meeting.id
                          }
                          onClick={() =>
                            void cancelMeeting(
                              meeting
                            )
                          }
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >

                          {cancellingId
                            ===
                            meeting.id
                            ?
                            (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            )
                            :
                            (
                              <Trash2 className="h-4 w-4" />
                            )}

                        </Button>

                      </div>

                    </div>
                  );
                }
              )}

            </div>

          )}

        </CardContent>

      </Card>


      <Dialog
        open={dialogOpen}
        onOpenChange={
          setDialogOpen
        }
      >

        <DialogContent className="sm:max-w-lg">

          <DialogHeader>

            <DialogTitle className="flex items-center gap-2">

              <CalendarClock className="h-5 w-5 text-primary" />

              Agendar chamada por vídeo

            </DialogTitle>


            <DialogDescription>

              A sala e o link serão criados agora, mas a chamada ficará registrada para a data escolhida.

            </DialogDescription>

          </DialogHeader>


          <div className="space-y-5 py-2">

            <div className="space-y-2">

              <Label htmlFor="scheduled-meeting-title">

                Nome da chamada *

              </Label>


              <Input
                id="scheduled-meeting-title"
                value={form.title}
                onChange={
                  event =>
                    setForm(
                      current => ({
                        ...current,
                        title:
                          event.target.value,
                      })
                    )
                }
                placeholder="Ex: Reunião comercial"
                autoFocus
              />

            </div>


            <div className="space-y-2">

              <Label htmlFor="scheduled-meeting-date">

                Data e horário *

              </Label>


              <Input
                id="scheduled-meeting-date"
                type="datetime-local"
                value={form.scheduledAt}
                min={minimumScheduleTime()}
                onChange={
                  event =>
                    setForm(
                      current => ({
                        ...current,
                        scheduledAt:
                          event.target.value,
                      })
                    )
                }
              />


              <p className="text-xs text-muted-foreground">

                O horário será considerado conforme o fuso do dispositivo utilizado para criar o agendamento.

              </p>

            </div>


            <div className="space-y-2">

              <Label htmlFor="scheduled-meeting-duration">

                Duração prevista

              </Label>


              <select
                id="scheduled-meeting-duration"
                value={form.duration}
                onChange={
                  event =>
                    setForm(
                      current => ({
                        ...current,
                        duration:
                          event.target.value,
                      })
                    )
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >

                <option value="15">
                  15 minutos
                </option>

                <option value="30">
                  30 minutos
                </option>

                <option value="45">
                  45 minutos
                </option>

                <option value="60">
                  1 hora
                </option>

                <option value="90">
                  1h30
                </option>

                <option value="120">
                  2 horas
                </option>

                <option value="180">
                  3 horas
                </option>

              </select>

            </div>


            <div className="space-y-2">

              <Label htmlFor="scheduled-meeting-password">

                Senha da chamada
                {" "}
                <span className="text-muted-foreground font-normal">
                  (opcional)
                </span>

              </Label>


              <Input
                id="scheduled-meeting-password"
                type="text"
                value={form.password}
                onChange={
                  event =>
                    setForm(
                      current => ({
                        ...current,
                        password:
                          event.target.value,
                      })
                    )
                }
                placeholder="Deixe vazio para não exigir senha"
              />

            </div>


            <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">

              O link para convidados será criado imediatamente e continuará sendo o mesmo até a realização da chamada.

            </div>

          </div>


          <div className="flex justify-end gap-2">

            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() =>
                setDialogOpen(
                  false
                )
              }
            >

              Cancelar

            </Button>


            <Button
              type="button"
              disabled={loading}
              onClick={() =>
                void createScheduledMeeting()
              }
              className="gap-2"
            >

              {loading
                ?
                (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                )
                :
                (
                  <CalendarClock className="h-4 w-4" />
                )}

              {loading
                ?
                "Agendando..."
                :
                "Agendar chamada"}

            </Button>

          </div>

        </DialogContent>

      </Dialog>
    </>
  );
}
