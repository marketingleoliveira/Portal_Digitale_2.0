import { useState, type DragEvent } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, CalendarDays, GripVertical, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { DealHealthDot } from "./DealHealthDot";
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
  emerald: "border-t-emerald-500/70",
  rose: "border-t-destructive/70",
};

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

  const handleDrop = (event: DragEvent, stage: CrmStage) => {
    event.preventDefault();
    setDropTarget(null);
    const dealId = draggedId ?? event.dataTransfer.getData("text/plain");
    setDraggedId(null);
    if (!dealId) return;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage_id === stage.id) return;
    const status = stage.is_won ? "ganho" : stage.is_lost ? "perdido" : "aberto";
    moveDeal.mutate({ id: dealId, stage_id: stage.id, status });
  };

  if (stages.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Nenhuma etapa configurada para este funil.
      </Card>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {stages.map((stage) => {
        const stageDeals = deals.filter((d) => d.stage_id === stage.id);
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
            <header className="mb-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold truncate">{stage.name}</h3>
                <span className="text-xs font-medium text-muted-foreground">{stageDeals.length}</span>
              </div>
              <p className="text-xs text-muted-foreground">{formatBRL(total)}</p>
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
                      {deal.status === "aberto" && (
                        <DealHealthDot health={health} daysIdle={daysIdle} className="mt-1" />
                      )}
                    </div>
                    <p className="text-sm font-semibold">{formatBRL(Number(deal.value ?? 0))}</p>
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
                    {deal.expected_close_date && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <CalendarDays className="w-3 h-3 shrink-0" />
                        {new Date(`${deal.expected_close_date}T12:00:00`).toLocaleDateString("pt-BR")}
                      </p>
                    )}
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
