import {
  useMemo,
  useState,
} from "react";

import {
  useQueryClient,
} from "@tanstack/react-query";

import {
  CalendarPlus,
  Loader2,
  UserRoundCheck,
} from "lucide-react";

import {
  toast,
} from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Button,
} from "@/components/ui/button";

import {
  Input,
} from "@/components/ui/input";

import {
  Label,
} from "@/components/ui/label";

import {
  Textarea,
} from "@/components/ui/textarea";

import {
  useAuth,
} from "@/contexts/AuthContext";

import {
  supabase,
} from "@/integrations/local/client";

import {
  useSellers,
  type CrmDeal,
} from "@/hooks/useAgendor";


interface Props {
  deal: CrmDeal;
  open: boolean;
  onOpenChange:
    (open: boolean) => void;
}


function localToday() {

  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      now.getDate()
    ).padStart(
      2,
      "0"
    );

  return (
    `${year}-${month}-${day}`
  );
}


export function AgendorMeetingDialog({
  deal,
  open,
  onOpenChange,
}: Props) {

  const queryClient =
    useQueryClient();


  const {
    session,
    realRole,
  } = useAuth();


  const {
    data: sellers = [],
    isLoading:
      loadingSellers,
  } = useSellers();


  const vendorOptions =
    useMemo(
      () =>
        sellers.filter(
          (seller) =>
            String(
              seller.role || ""
            ).toLowerCase()
            === "vendedor"
        ),
      [
        sellers,
      ]
    );


  const [
    sellerId,
    setSellerId,
  ] = useState("");


  const [
    date,
    setDate,
  ] = useState(
    localToday()
  );


  const [
    time,
    setTime,
  ] = useState(
    "09:00"
  );


  const [
    duration,
    setDuration,
  ] = useState(
    "60"
  );


  const [
    notes,
    setNotes,
  ] = useState("");


  const [
    saving,
    setSaving,
  ] = useState(false);


  const [
    error,
    setError,
  ] = useState("");


  const canSchedule =
    useMemo(
      () =>
        [
          "sdr",
          "dev",
          "gerente",
          "diretoria",
        ].includes(
          String(
            realRole || ""
          ).toLowerCase()
        ),
      [
        realRole,
      ]
    );


  const selectedSeller =
    vendorOptions.find(
      (seller) =>
        seller.id
        === sellerId
    );


  const handleSubmit =
    async () => {

      setError("");


      if (!sellerId) {

        setError(
          "Selecione o vendedor que fará o atendimento."
        );

        return;
      }


      if (
        !date
        ||
        !time
      ) {

        setError(
          "Informe a data e o horário."
        );

        return;
      }


      /*
       * AGENDOR_FRESH_SESSION_V2
       *
       * Não depende apenas da sessão mantida no React.
       * O cliente local lê a sessão atual armazenada no browser.
       */
      const {
        data: {
          session: storedSession,
        },
      } =
        await supabase.auth.getSession();


      const currentSession =
        storedSession
        || session;


      const token =
        currentSession
          ?.access_token;


      if (!token) {

        setError(
          "Sessão inválida. Atualize a página ou entre novamente."
        );

        return;
      }


      setSaving(true);


      try {

        const response =
          await fetch(
            "/api/agendor-meetings",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",

                Authorization:
                  `Bearer ${token}`,
              },

              body:
                JSON.stringify({
                  deal_id:
                    deal.id,

                  seller_id:
                    sellerId,

                  scheduled_date:
                    `${date} ${time}:00`,

                  duration_minutes:
                    Number(
                      duration || 60
                    ),

                  notes:
                    notes.trim(),
                }),
            }
          );


        const data =
          await response
            .json()
            .catch(
              () => ({})
            );


        if (!response.ok) {

          const map:
            Record<string, string> = {

              seller_required:
                "Selecione o vendedor responsável pela reunião.",

              seller_not_found:
                "O vendedor selecionado não está ativo ou não possui cargo de vendedor.",

              future_date_required:
                "Escolha uma data e horário futuros.",

              deal_not_assigned_to_user:
                "Este lead não está atribuído a você.",

              meeting_schedule_not_allowed:
                "Seu cargo não possui permissão para pré-agendar.",

              meeting_stage_not_found:
                "A etapa Reuniões Agendadas | Visitas não foi encontrada.",

              deal_not_found:
                "O negócio não foi encontrado.",
            };


          throw new Error(
            map[
              String(
                data?.error || ""
              )
            ]
            ||
            "Não foi possível pré-agendar a reunião."
          );
        }


        await Promise.all([
          queryClient
            .invalidateQueries({
              queryKey:
                ["crm-deals"],
            }),

          queryClient
            .invalidateQueries({
              queryKey:
                ["crm-meeting-schedules"],
            }),

          queryClient
            .invalidateQueries({
              queryKey:
                ["crm-stages"],
            }),
        ]);


        window.dispatchEvent(
          new CustomEvent(
            "crm-meeting-schedules-changed",
            {
              detail: data,
            }
          )
        );


        toast.success(
          `Reunião agendada para ${
            data?.seller_name
            ||
            selectedSeller
              ?.full_name
            ||
            "o vendedor"
          }.`
        );


        setSellerId("");
        setNotes("");
        setDuration("60");


        onOpenChange(
          false
        );


      } catch (err) {

        setError(
          err instanceof Error
            ? err.message
            : "Erro ao pré-agendar reunião."
        );


      } finally {

        setSaving(false);

      }
    };


  if (!canSchedule) {
    return null;
  }


  return (
    <Dialog
      open={open}
      onOpenChange={
        onOpenChange
      }
    >
      <DialogContent
        className="sm:max-w-md"
      >
        <DialogHeader>

          <DialogTitle
            className="flex items-center gap-2"
          >
            <CalendarPlus
              className="h-5 w-5"
            />

            Pré-agendar reunião
          </DialogTitle>


          <DialogDescription>
            Escolha o vendedor,
            a data e o horário.
            Ao salvar, o lead será
            movido automaticamente para
            Reuniões Agendadas | Visitas.
          </DialogDescription>

        </DialogHeader>


        <div
          className="space-y-4"
        >

          <div
            className="
              rounded-lg
              border
              bg-muted/30
              p-3
              text-sm
            "
          >
            <div
              className="font-medium"
            >
              {
                deal.organization
                  ?.name
                ||
                deal.title
              }
            </div>

            {
              deal.person
                ?.name
              && (
                <div
                  className="
                    mt-1
                    text-xs
                    text-muted-foreground
                  "
                >
                  Contato: {
                    deal.person.name
                  }
                </div>
              )
            }
          </div>


          <div
            className="space-y-1.5"
          >
            <Label
              className="flex items-center gap-2"
            >
              <UserRoundCheck
                className="h-4 w-4"
              />

              Vendedor que fará o atendimento
            </Label>

            <select
              value={sellerId}
              onChange={
                (event) =>
                  setSellerId(
                    event.target.value
                  )
              }
              disabled={
                loadingSellers
                ||
                saving
              }
              className="
                flex
                h-10
                w-full
                rounded-md
                border
                border-input
                bg-background
                px-3
                py-2
                text-sm
              "
            >
              <option value="">
                Selecione o vendedor...
              </option>

              {
                vendorOptions.map(
                  (seller) => (
                    <option
                      key={seller.id}
                      value={seller.id}
                    >
                      {
                        seller.full_name
                      }
                    </option>
                  )
                )
              }
            </select>

            <p
              className="
                text-xs
                text-muted-foreground
              "
            >
              O vendedor escolhido receberá
              uma notificação no Portal.
            </p>
          </div>


          <div
            className="
              grid
              grid-cols-2
              gap-3
            "
          >

            <div
              className="space-y-1.5"
            >
              <Label>
                Data
              </Label>

              <Input
                type="date"
                value={date}
                min={localToday()}
                onChange={
                  (event) =>
                    setDate(
                      event.target.value
                    )
                }
              />
            </div>


            <div
              className="space-y-1.5"
            >
              <Label>
                Horário
              </Label>

              <Input
                type="time"
                value={time}
                onChange={
                  (event) =>
                    setTime(
                      event.target.value
                    )
                }
              />
            </div>

          </div>


          <div
            className="space-y-1.5"
          >
            <Label>
              Duração
            </Label>

            <select
              value={duration}
              onChange={
                (event) =>
                  setDuration(
                    event.target.value
                  )
              }
              className="
                flex
                h-10
                w-full
                rounded-md
                border
                border-input
                bg-background
                px-3
                py-2
                text-sm
              "
            >
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
            </select>
          </div>


          <div
            className="space-y-1.5"
          >
            <Label>
              Observações
            </Label>

            <Textarea
              value={notes}
              onChange={
                (event) =>
                  setNotes(
                    event.target.value
                  )
              }
              placeholder="Ex.: apresentação comercial, orçamento, demanda do cliente..."
              rows={3}
            />
          </div>


          {
            error
            && (
              <div
                className="
                  rounded-md
                  border
                  border-destructive/30
                  bg-destructive/5
                  px-3
                  py-2
                  text-sm
                  text-destructive
                "
              >
                {error}
              </div>
            )
          }

        </div>


        <DialogFooter>

          <Button
            type="button"
            variant="outline"
            onClick={
              () =>
                onOpenChange(
                  false
                )
            }
          >
            Cancelar
          </Button>


          <Button
            type="button"
            onClick={
              handleSubmit
            }
            disabled={
              saving
              ||
              !sellerId
              ||
              !date
              ||
              !time
            }
            className="gap-2"
          >
            {
              saving
              ? (
                <Loader2
                  className="
                    h-4
                    w-4
                    animate-spin
                  "
                />
              )
              : (
                <CalendarPlus
                  className="h-4 w-4"
                />
              )
            }

            Pré-agendar
          </Button>

        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
