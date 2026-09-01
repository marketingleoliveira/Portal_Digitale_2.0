import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActivityFormDialog } from "./ActivityFormDialog";
import {
  ACTIVITY_TYPE_LABELS,
  useActivities,
  useDeals,
  useDeleteActivity,
  useSellers,
  useToggleActivity,
  type ActivityType,
  type CrmActivity,
} from "@/hooks/useAgendor";

interface TasksPanelProps {
  /** null = todas as tarefas (Gerência); id = tarefas de um responsável. */
  ownerId: string | null;
  pipelineId?: string | null;
  showOwnerColumn?: boolean;
}

type TaskView = "hoje" | "proximas" | "atrasadas" | "concluidas" | "todas";

const TASK_TYPES: ActivityType[] = ["ligacao", "whatsapp", "email", "reuniao", "visita", "tarefa", "nota"];

/** Rotina comercial: tarefas por Hoje / Próximas / Atrasadas / Concluídas. */
export function TasksPanel({ ownerId, pipelineId, showOwnerColumn }: TasksPanelProps) {
  const { data: activities = [], isLoading } = useActivities({ ownerId });
  const { data: deals = [] } = useDeals(pipelineId ?? null, ownerId);
  const { data: sellers = [] } = useSellers();
  const toggleActivity = useToggleActivity();
  const deleteActivity = useDeleteActivity();
  const [view, setView] = useState<TaskView>("hoje");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);

  const filtered = useMemo(() => {
    const now = new Date();
    const todayISO = now.toISOString().slice(0, 10);
    return activities
      .filter((a) => a.activity_type !== "historico")
      .filter((a) => (typeFilter === "all" ? true : a.activity_type === typeFilter))
      .filter((a) => {
        if (view === "todas") return true;
        if (view === "concluidas") return !!a.completed_at;
        if (a.completed_at) return false;
        if (view === "hoje") return a.due_at?.slice(0, 10) === todayISO;
        if (view === "atrasadas") return !!a.due_at && new Date(a.due_at) < now;
        return !a.due_at || new Date(a.due_at) >= now;
      });
  }, [activities, view, typeFilter]);

  const dealTitle = (id: string | null) => deals.find((d) => d.id === id)?.title ?? null;
  const ownerName = (id: string | null) => sellers.find((s) => s.id === id)?.full_name ?? "—";

  const renderTask = (task: CrmActivity) => {
    const overdue = !task.completed_at && task.due_at && new Date(task.due_at) < new Date();
    return (
      <div key={task.id} className="flex items-start gap-3 py-2.5 border-b last:border-b-0">
        <Checkbox
          className="mt-1"
          checked={!!task.completed_at}
          aria-label={`Concluir ${task.title}`}
          onCheckedChange={(checked) => toggleActivity.mutate({ id: task.id, done: checked === true })}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-[10px]">
              {ACTIVITY_TYPE_LABELS[task.activity_type]}
            </Badge>
            <p className={cn("text-sm font-medium", task.completed_at && "line-through text-muted-foreground")}>
              {task.title}
            </p>
            {overdue && <Badge variant="destructive" className="text-[10px]">Atrasada</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {dealTitle(task.deal_id) ? `Negócio: ${dealTitle(task.deal_id)}` : "Sem negócio vinculado"}
            {showOwnerColumn ? ` • ${ownerName(task.assigned_to)}` : ""}
            {task.due_at ? ` • ${new Date(task.due_at).toLocaleString("pt-BR")}` : ""}
          </p>
          {task.description && <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Excluir ${task.title}`}
          onClick={() => deleteActivity.mutate(task.id)}
        >
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <Tabs value={view} onValueChange={(v) => setView(v as TaskView)}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="hoje">Hoje</TabsTrigger>
            <TabsTrigger value="proximas">Próximas</TabsTrigger>
            <TabsTrigger value="atrasadas">Atrasadas</TabsTrigger>
            <TabsTrigger value="concluidas">Concluídas</TabsTrigger>
            <TabsTrigger value="todas">Todas</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {TASK_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{ACTIVITY_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="gap-2" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" />
            Nova tarefa
          </Button>
        </div>
      </div>

      <Card className="p-4">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma tarefa nesta visão. Toda oportunidade deve ter um próximo passo definido.
          </p>
        )}
        {filtered.map(renderTask)}
      </Card>

      <ActivityFormDialog open={showForm} onOpenChange={setShowForm} activity={null} dealId={null} organizationId={null} />
    </div>
  );
}
