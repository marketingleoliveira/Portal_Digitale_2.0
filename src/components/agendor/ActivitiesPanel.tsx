import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActivityFormDialog } from "./ActivityFormDialog";
import {
  ACTIVITY_TYPE_LABELS,
  useActivities,
  useDeleteActivity,
  useToggleActivity,
  type CrmActivity,
} from "@/hooks/useAgendor";

interface ActivitiesPanelProps {
  dealId?: string | null;
  organizationId?: string | null;
  compact?: boolean;
}

export function ActivitiesPanel({ dealId, organizationId, compact }: ActivitiesPanelProps) {
  const { data: activities = [], isLoading } = useActivities({ dealId: dealId ?? null });
  const toggleActivity = useToggleActivity();
  const deleteActivity = useDeleteActivity();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CrmActivity | null>(null);

  const { pending, done } = useMemo(() => {
    const sorted = [...activities];
    return {
      pending: sorted.filter((a) => !a.completed_at),
      done: sorted.filter((a) => !!a.completed_at),
    };
  }, [activities]);

  const renderItem = (activity: CrmActivity) => {
    const overdue = !activity.completed_at && activity.due_at && new Date(activity.due_at) < new Date();
    const isHistory = activity.activity_type === "historico";
    return (
      <div key={activity.id} className="flex items-start gap-3 py-2 border-b last:border-b-0">
        {!isHistory && (
          <Checkbox
            className="mt-1"
            checked={!!activity.completed_at}
            aria-label={`Concluir ${activity.title}`}
            onCheckedChange={(checked) =>
              toggleActivity.mutate({ id: activity.id, done: checked === true })
            }
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={isHistory ? "outline" : "secondary"} className="text-[10px]">
              {ACTIVITY_TYPE_LABELS[activity.activity_type]}
            </Badge>
            <p className={cn("text-sm font-medium", activity.completed_at && !isHistory && "line-through text-muted-foreground")}>
              {activity.title}
            </p>
            {overdue && <Badge variant="destructive" className="text-[10px]">Atrasada</Badge>}
          </div>
          {activity.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{activity.description}</p>
          )}
          {activity.due_at && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(activity.due_at).toLocaleString("pt-BR")}
            </p>
          )}
        </div>
        {!isHistory && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Excluir ${activity.title}`}
            onClick={() => deleteActivity.mutate(activity.id)}
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className={cn("font-semibold", compact ? "text-sm" : "text-base")}>
          Atividades e histórico
        </h3>
        <Button
          size="sm"
          className="gap-2"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          <Plus className="w-4 h-4" />
          Nova
        </Button>
      </div>

      <Card className="p-4">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!isLoading && activities.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
        )}
        {pending.map(renderItem)}
        {done.length > 0 && (
          <div className="mt-4 pt-3 border-t">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Concluídas</p>
            {done.map(renderItem)}
          </div>
        )}
      </Card>

      <ActivityFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        activity={editing}
        dealId={dealId ?? null}
        organizationId={organizationId ?? null}
      />
    </div>
  );
}
