import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CalendarClock, CheckCircle2, Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { DealHealthDot } from "./DealHealthDot";
import {
  ACTIVITY_TYPE_LABELS,
  computeDealHealth,
  formatBRL,
  useActivities,
  useCrmSettings,
  useDeals,
  useStages,
  type CrmDeal,
} from "@/hooks/useAgendor";

interface AgendorOverviewProps {
  pipelineId: string | null;
  /** null = escopo global (Gerência); id = carteira de um responsável. */
  ownerId: string | null;
  onSelectDeal?: (deal: CrmDeal) => void;
  title?: string;
}

/** Painel de controle comercial: indicadores, funil, próximas tarefas e negócios em risco. */
export function AgendorOverview({ pipelineId, ownerId, onSelectDeal, title }: AgendorOverviewProps) {
  const { data: deals = [], isLoading } = useDeals(pipelineId, ownerId);
  const { data: activities = [] } = useActivities({ ownerId });
  const { data: stages = [] } = useStages(pipelineId);
  const { data: settings } = useCrmSettings();

  const metrics = useMemo(() => {
    const open = deals.filter((d) => d.status === "aberto");
    const won = deals.filter((d) => d.status === "ganho");
    const lost = deals.filter((d) => d.status === "perdido");
    const sum = (list: CrmDeal[]) => list.reduce((acc, d) => acc + Number(d.value ?? 0), 0);
    const closed = won.length + lost.length;
    const todayISO = new Date().toISOString().slice(0, 10);
    const tasks = activities.filter((a) => a.activity_type !== "historico" && !a.completed_at);

    return {
      open,
      openValue: sum(open),
      won,
      wonValue: sum(won),
      lost,
      lostValue: sum(lost),
      conversion: closed > 0 ? Math.round((won.length / closed) * 100) : 0,
      ticket: won.length > 0 ? sum(won) / won.length : 0,
      today: tasks.filter((a) => a.due_at?.slice(0, 10) === todayISO).length,
      overdue: tasks.filter((a) => a.due_at && new Date(a.due_at) < new Date()).length,
      pending: tasks.length,
    };
  }, [deals, activities]);

  const health = useMemo(
    () =>
      metrics.open.map((deal) => ({
        deal,
        ...computeDealHealth(deal, activities, settings?.health_rules),
      })),
    [metrics.open, activities, settings]
  );

  const attention = health
    .filter((h) => h.health !== "saudavel")
    .sort((a, b) => b.daysIdle - a.daysIdle)
    .slice(0, 8);

  const nextTasks = activities
    .filter((a) => a.activity_type !== "historico" && !a.completed_at && a.due_at)
    .slice(0, 8);

  const cards = [
    { label: "Negócios em andamento", value: String(metrics.open.length), hint: formatBRL(metrics.openValue), icon: Coins },
    { label: "Ganhos no período", value: String(metrics.won.length), hint: formatBRL(metrics.wonValue), icon: CheckCircle2 },
    { label: "Perdidos", value: String(metrics.lost.length), hint: formatBRL(metrics.lostValue), icon: AlertTriangle },
    { label: "Taxa de conversão", value: `${metrics.conversion}%`, hint: `Ticket médio ${formatBRL(metrics.ticket)}`, icon: CalendarClock },
    { label: "Tarefas para hoje", value: String(metrics.today), hint: `${metrics.pending} pendente(s)`, icon: CalendarClock },
    { label: "Tarefas atrasadas", value: String(metrics.overdue), hint: metrics.overdue > 0 ? "Requer ação imediata" : "Tudo em dia", icon: AlertTriangle },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={`skeleton-${i}`} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  const maxStageValue = Math.max(
    1,
    ...stages.map((s) => metrics.open.filter((d) => d.stage_id === s.id).reduce((acc, d) => acc + Number(d.value ?? 0), 0))
  );

  return (
    <div className="space-y-6">
      {title && <h2 className="text-lg font-semibold">{title}</h2>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(({ label, value, hint, icon: Icon }) => (
          <Card key={label} className="p-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground truncate">{label}</p>
              <p className="text-2xl font-bold mt-1">{value}</p>
              <p className="text-xs text-muted-foreground truncate">{hint}</p>
            </div>
            <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-semibold">Resumo do funil</h3>
          {stages.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma etapa configurada.</p>}
          {stages.map((stage) => {
            const list = metrics.open.filter((d) => d.stage_id === stage.id);
            const total = list.reduce((acc, d) => acc + Number(d.value ?? 0), 0);
            return (
              <div key={stage.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate">{stage.name}</span>
                  <span className="text-muted-foreground">
                    {list.length} • {formatBRL(total)}
                  </span>
                </div>
                <Progress value={(total / maxStageValue) * 100} className="h-1.5" />
              </div>
            );
          })}
        </Card>

        <Card className="p-4 space-y-2">
          <h3 className="text-sm font-semibold">Próximas tarefas</h3>
          {nextTasks.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma tarefa agendada. Defina o próximo passo dos seus negócios.</p>
          )}
          {nextTasks.map((task) => {
            const overdue = task.due_at && new Date(task.due_at) < new Date();
            const deal = deals.find((d) => d.id === task.deal_id);
            return (
              <div key={task.id} className="flex items-start justify-between gap-2 py-1.5 border-b last:border-b-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{task.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {ACTIVITY_TYPE_LABELS[task.activity_type]}
                    {deal ? ` • ${deal.title}` : ""}
                  </p>
                </div>
                <span className={cn("text-xs shrink-0", overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                  {task.due_at ? new Date(task.due_at).toLocaleDateString("pt-BR") : "—"}
                </span>
              </div>
            );
          })}
        </Card>
      </div>

      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Negócios que precisam de atenção</h3>
          <Badge variant="outline" className="text-[10px]">
            {health.filter((h) => h.health === "critico").length} crítico(s)
          </Badge>
        </div>
        {attention.length === 0 && (
          <p className="text-sm text-muted-foreground">Todos os negócios abertos possuem próximo passo definido.</p>
        )}
        {attention.map(({ deal, health: h, daysIdle, nextTask }) => (
          <button
            key={deal.id}
            type="button"
            onClick={() => onSelectDeal?.(deal)}
            className="w-full text-left flex items-center gap-3 py-2 border-b last:border-b-0 hover:bg-accent/50 rounded px-1 transition-colors"
          >
            <DealHealthDot health={h} daysIdle={daysIdle} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{deal.title}</p>
              <p className="text-xs text-muted-foreground truncate">
                {deal.organization?.name ?? "Sem empresa"} •{" "}
                {nextTask ? `Próximo: ${nextTask.title}` : "Sem próxima tarefa"}
              </p>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {daysIdle <= 0 ? "hoje" : `${daysIdle}d parado`}
            </span>
          </button>
        ))}
      </Card>
    </div>
  );
}
