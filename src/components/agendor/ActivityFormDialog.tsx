import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ACTIVITY_TYPE_LABELS,
  useSaveActivity,
  type ActivityType,
  type CrmActivity,
} from "@/hooks/useAgendor";

interface ActivityFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity?: CrmActivity | null;
  dealId?: string | null;
  organizationId?: string | null;
}

const SELECTABLE_TYPES: ActivityType[] = [
  "tarefa",
  "ligacao",
  "email",
  "whatsapp",
  "reuniao",
  "visita",
  "nota",
];

const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function ActivityFormDialog({
  open,
  onOpenChange,
  activity,
  dealId,
  organizationId,
}: ActivityFormDialogProps) {
  const saveActivity = useSaveActivity();
  const [form, setForm] = useState({
    activity_type: "tarefa" as ActivityType,
    title: "",
    description: "",
    due_at: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      activity_type: (activity?.activity_type as ActivityType) ?? "tarefa",
      title: activity?.title ?? "",
      description: activity?.description ?? "",
      due_at: toLocalInput(activity?.due_at),
    });
  }, [open, activity]);

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    await saveActivity.mutateAsync({
      id: activity?.id,
      activity_type: form.activity_type,
      title: form.title.trim(),
      description: form.description.trim() || null,
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      deal_id: activity?.deal_id ?? dealId ?? null,
      organization_id: activity?.organization_id ?? organizationId ?? null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{activity ? "Editar atividade" : "Nova atividade"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select
              value={form.activity_type}
              onValueChange={(v) => setForm((f) => ({ ...f, activity_type: v as ActivityType }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SELECTABLE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{ACTIVITY_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="act-title">Título *</Label>
            <Input
              id="act-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Ex.: Ligar para confirmar proposta"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="act-due">Data e hora</Label>
            <Input
              id="act-due"
              type="datetime-local"
              value={form.due_at}
              onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="act-desc">Descrição</Label>
            <Textarea
              id="act-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!form.title.trim() || saveActivity.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
