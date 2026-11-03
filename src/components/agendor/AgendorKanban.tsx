import {CustomerBadge} from "./CustomerBadge";
import {
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, CalendarClock, FileDigit, GripVertical, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { DealHealthDot } from "./DealHealthDot";
import { LeadContactAlert } from "./LeadContactAlert";
import { AgendorMeetingDialog } from "./AgendorMeetingDialog";
import {
  computeDealHealth,
  formatBRL,
  useCrmSettings,
  useMoveDeal,
  useSellers,
  type CrmActivity,
  type CrmDeal,
  type CrmStage,
} from "@/hooks/useAgendor";

interface AgendorKanbanProps {
  deals: CrmDeal[];
  stages: CrmStage[];
  onSelectDeal: (deal: CrmDeal) => void;
  /** Atividades usadas para calcular a saúde de cada negócio. */
  activities?: CrmActivity[];
  /** Exibe o responsável no cartão (visão de Gerência). */
  showOwner?: boolean;
}

const STAGE_ACCENT: Record<string, string> = {
  slate: "border-t-muted-foreground/40",
  sky: "border-t-primary/60",
  amber: "border-t-amber-500/70",
  orange: "border-t-orange-500/70",
  violet: "border-t-violet-500/70",
  emerald: "border-t-emerald-500/70",
  rose: "border-t-destructive/70",
};


// AGENDOR_MEETING_STAGE_GUARD_V1
function isMeetingScheduledStage(
  name: string | null | undefined
) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    === "reuniao agendada";
}


function isNegotiationStage(
  name: string | null | undefined
) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    === "negociacao";
}

export function AgendorKanban({
  deals,
  stages,
  onSelectDeal,
  activities = [],
  showOwner,
}: AgendorKanbanProps) {
  const moveDeal = useMoveDeal();
  const { data: settings } = useCrmSettings();
  const { data: sellers = [] } = useSellers();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // AGENDOR_DIRECT_MEETING_STATE_V1
  const [
    meetingDeal,
    setMeetingDeal,
  ] = useState<CrmDeal | null>(null);

  const boardRef =
    useRef<HTMLDivElement | null>(null);

  const [
    isPanning,
    setIsPanning,
  ] = useState(false);

  const panStart =
    useRef({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
    });


  const handlePanStart = (
    event: MouseEvent<HTMLDivElement>
  ) => {
    if (
      event.button !== 0
      || draggedId
    ) {
      return;
    }

    const target =
      event.target;

    if (
      target instanceof Element
      && target.closest(
        [
          '[data-kanban-card="true"]',
          "button",
          "a",
          "input",
          "textarea",
          "select",
          '[role="button"]',
        ].join(",")
      )
    ) {
      return;
    }

    const board =
      boardRef.current;

    if (!board) {
      return;
    }

    panStart.current = {
      x: event.clientX,
      y: event.clientY,
      left: board.scrollLeft,
      top: board.scrollTop,
    };

    setIsPanning(true);

    event.preventDefault();
  };


  const handlePanMove = (
    event: MouseEvent<HTMLDivElement>
  ) => {
    if (!isPanning) {
      return;
    }

    const board =
      boardRef.current;

    if (!board) {
      return;
    }

    if (
      (event.buttons & 1) !== 1
    ) {
      setIsPanning(false);
      return;
    }

    const dx =
      event.clientX
      - panStart.current.x;

    const dy =
      event.clientY
      - panStart.current.y;

    board.scrollLeft =
      panStart.current.left
      - dx;

    board.scrollTop =
      panStart.current.top
      - dy;

    event.preventDefault();
  };


  const stopPanning = () => {
    setIsPanning(false);
  };


  const handleBoardDragOver = (
    event: DragEvent<HTMLDivElement>
  ) => {
    if (!draggedId) {
      return;
    }

    const board =
      boardRef.current;

    if (!board) {
      return;
    }

    event.preventDefault();

    const rect =
      board.getBoundingClientRect();

    const edge = 75;
    const speed = 24;


    if (
      event.clientX
      < rect.left + edge
    ) {
      board.scrollLeft -= speed;
    } else if (
      event.clientX
      > rect.right - edge
    ) {
      board.scrollLeft += speed;
    }


    if (
      event.clientY
      < rect.top + edge
    ) {
      board.scrollTop -= speed;
    } else if (
      event.clientY
      > rect.bottom - edge
    ) {
      board.scrollTop += speed;
    }
  };

  const handleDrop = (event: DragEvent, stage: CrmStage) => {
    event.preventDefault();
    setDropTarget(null);
    const dealId = draggedId ?? event.dataTransfer.getData("text/plain");
    setDraggedId(null);
    if (!dealId) return;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage_id === stage.id) return;

    /*
     * AGENDOR_MEETING_DROP_GUARD_V1
     *
     * Reuniões Agendadas | Visitas não pode ser criada apenas
     * alterando crm_deals.stage_id.
     *
     * O usuário deve obrigatoriamente usar o fluxo
     * de Pré-agendar reunião, que cria:
     * - crm_meeting_schedules
     * - lead de Atendimento
     * - Calendário CRM
     * - notificação ao vendedor
     */
    if (
      isMeetingScheduledStage(
        stage.name
      )
    ) {
      // AGENDOR_DIRECT_MEETING_DROP_V1
      setMeetingDeal(deal);

      toast.info(
        "Preencha vendedor, data e horário para concluir o agendamento."
      );

      return;
    }

    const status =
      stage.is_won
        ? "ganho"
        : stage.is_lost
          ? "perdido"
          : "aberto";

    moveDeal.mutate({
      id: dealId,
      stage_id: stage.id,
      status,
    });
  };

  if (stages.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Nenhuma etapa configurada para este funil.
      </Card>
    );
  }

  return (
    <div
      ref={boardRef}
      onMouseDown={handlePanStart}
      onMouseMove={handlePanMove}
      onMouseUp={stopPanning}
      onMouseLeave={stopPanning}
      onDragOver={handleBoardDragOver}
      aria-label="Quadro de negócios. Arraste o fundo para navegar."
      className={cn(
        "flex h-[calc(100dvh-240px)] min-h-[420px] gap-4 overflow-auto overscroll-contain pb-4 pr-2",
        isPanning
          ? "cursor-grabbing select-none"
          : "cursor-grab"
      )}
    >
      {/* AGENDOR_DIRECT_MEETING_DIALOG_V1 */}
      {meetingDeal && (
        <AgendorMeetingDialog
          deal={meetingDeal}
          open={true}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setMeetingDeal(null);
            }
          }}
        />
      )}

      {stages
        .filter((stage) =>
          [
            "Prospecção",
            "Contato Feito",
            "Fim de Cadência",
            "Reuniões Agendadas | Visitas",
            "Reuniões Feitas",
            "Perdidos",
          ].includes(stage.name)
        )
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((stage) => {
        // AGENDOR_WON_VISIBILITY_V1
        // Exibe ganhos em Reunioes Feitas mesmo se uma
        // integracao externa ainda tiver o stage_id antigo.
        const stageDeals = deals.filter((d) =>
          d.status === "ganho"
            ? stage.name === "Reuniões Feitas"
            : d.stage_id === stage.id
        );
        const total = stageDeals.reduce((sum, d) => sum + Number(d.value ?? 0), 0);
        return (
          <div
            key={stage.id}
            onDragOver={(e) => {
              e.preventDefault();
              setDropTarget(stage.id);
            }}
            onDragLeave={() => setDropTarget((prev) => (prev === stage.id ? null : prev))}
            onDrop={(e) => handleDrop(e, stage)}
            className={cn(
              "w-[280px] shrink-0 rounded-lg bg-muted/40 border border-t-4 p-3 transition-colors",
              STAGE_ACCENT[stage.color] ?? STAGE_ACCENT.slate,
              dropTarget === stage.id && "bg-accent"
            )}
          >
            <header
              className="
                sticky
                top-0
                z-20
                -mx-3
                -mt-3
                mb-3
                border-b
                bg-muted/95
                px-3
                pb-3
                pt-3
                backdrop-blur
                supports-[backdrop-filter]:bg-muted/85
              "
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold truncate">{stage.name}</h3>
                <span className="text-xs font-medium text-muted-foreground">{stageDeals.length}</span>
              </div>
              
            </header>

            <div className="space-y-2">
              {stageDeals.map((deal) => {
                const { health, nextTask, daysIdle } = computeDealHealth(
                  deal,
                  activities,
                  settings?.health_rules
                );
                const owner = sellers.find((s) => s.id === deal.owner_user_id);
                return (
                  <Card
                    key={deal.id}
                    data-kanban-card="true"
                    draggable
                    onDragStart={(e) => {
                      setDraggedId(deal.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", deal.id);
                    }}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDropTarget(null);
                    }}
                    onClick={() => onSelectDeal(deal)}
                    className={cn(
                      "p-3 cursor-pointer hover:border-primary/50 transition-colors space-y-2",
                      draggedId === deal.id && "opacity-50"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      <p className="text-sm font-medium leading-tight flex-1">{deal.title}</p>

                      {deal.customer && <button type="button" aria-label="Cliente já cadastrado" onClick={e=>{e.stopPropagation();onSelectDeal(deal);}}><CustomerBadge status={deal.customer.status} /></button>}
                      {/* SITE_ORIGIN_BADGE */}
                      {String(deal.source || "").toUpperCase() === "SITE" && (
                        <Badge
                          aria-label="Origem do lead: SITE"
                          className="
                            pointer-events-none
                            select-none
                            shrink-0
                            rounded-md
                            border-0
                            bg-green-600
                            animate-pulse
                            px-2
                            py-0.5
                            text-[10px]
                            font-bold
                            tracking-wide
                            text-white
                            shadow-sm
                            hover:bg-green-600
                          "
                        >
                          SITE
                        </Badge>
                      )}

                      {/* IA_ORIGIN_BADGE */}
                      {[
                        "IA",
                        "IA PROSPECÇÃO"
                      ].includes(
                        String(
                          deal.source || ""
                        ).toUpperCase()
                      ) && (
                        <Badge
                          aria-label="Origem do lead: IA"
                          className="
                            pointer-events-none
                            select-none
                            shrink-0
                            rounded-md
                            border-0
                            bg-violet-600
                            animate-pulse
                            px-2
                            py-0.5
                            text-[10px]
                            font-bold
                            tracking-wide
                            text-white
                            shadow-sm
                            hover:bg-violet-600
                          "
                        >
                          IA
                        </Badge>
                      )}

                      {deal.status === "aberto" && (
                        <DealHealthDot health={health} daysIdle={daysIdle} className="mt-1" />
                      )}
                    </div>

                    <LeadContactAlert deal={deal} />
                    {isNegotiationStage(stage.name) && (
                      <div
                        className="
                          flex
                          items-center
                          justify-center
                          gap-1.5
                          rounded-md
                          border
                          border-amber-400/60
                          bg-amber-100
                          px-2
                          py-1.5
                          text-[10px]
                          font-bold
                          uppercase
                          tracking-wide
                          text-amber-900
                          shadow-sm
                          animate-pulse
                          dark:bg-amber-950/40
                          dark:text-amber-300
                        "
                      >
                        <CalendarClock
                          className="h-3.5 w-3.5"
                        />

                        Agendamento Pendente
                      </div>
                    )}

                    
                    {deal.organization?.name && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                        <Building2 className="w-3 h-3 shrink-0" />
                        {deal.organization.name}
                      </p>
                    )}
                    {deal.person?.name && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                        <User className="w-3 h-3 shrink-0" />
                        {deal.person.name}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                      <FileDigit className="w-3 h-3 shrink-0" />
                      CNPJ: {deal.organization?.cnpj?.trim() || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {nextTask
                        ? `Próximo passo: ${nextTask.title}`
                        : "Sem próximo passo definido"}
                    </p>
                    {showOwner && (
                      <Badge variant="outline" className="text-[10px]">
                        {owner?.full_name ?? "Sem responsável"}
                      </Badge>
                    )}
                  </Card>
                );
              })}
              {stageDeals.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Arraste negócios para cá</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
