import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useOrganizations,
  usePeople,
  useSaveDeal,
  type CrmDeal,
  type CrmStage,
} from "@/hooks/useAgendor";

interface DealFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string | null;
  stages: CrmStage[];
  deal?: CrmDeal | null;
}

const NONE = "__none__";

export function DealFormDialog({ open, onOpenChange, pipelineId, stages, deal }: DealFormDialogProps) {
  const saveDeal = useSaveDeal();
  const { data: organizations = [] } = useOrganizations();
  const [form, setForm] = useState({
    title: "",
    value: "",
    stage_id: "",
    organization_id: NONE,
    person_id: NONE,
    expected_close_date: "",
    description: "",
  });

  const { data: people = [] } = usePeople(
    form.organization_id === NONE ? null : form.organization_id
  );

  useEffect(() => {
    if (!open) return;
    setForm({
      title: deal?.title ?? "",
      value: deal ? String(deal.value ?? "") : "",
      stage_id: deal?.stage_id ?? stages[0]?.id ?? "",
      organization_id: deal?.organization_id ?? NONE,
      person_id: deal?.person_id ?? NONE,
      expected_close_date: deal?.expected_close_date ?? "",
      description: deal?.description ?? "",
    });
  }, [open, deal, stages]);

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.stage_id || !pipelineId) return;
    const stage = stages.find((s) => s.id === form.stage_id);
    await saveDeal.mutateAsync({
      id: deal?.id,
      title: form.title.trim(),
      value: Number(form.value.replace(",", ".")) || 0,
      pipeline_id: pipelineId,
      stage_id: form.stage_id,
      status: stage?.is_won ? "ganho" : stage?.is_lost ? "perdido" : "aberto",
      organization_id: form.organization_id === NONE ? null : form.organization_id,
      person_id: form.person_id === NONE ? null : form.person_id,
      expected_close_date: form.expected_close_date || null,
      description: form.description.trim() || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{deal ? "Editar negócio" : "Novo negócio"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="deal-title">Título *</Label>
            <Input
              id="deal-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Ex.: Fornecimento de tecidos - 2026"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="deal-value">Valor (R$)</Label>
              <Input
                id="deal-value"
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-2">
              <Label>Etapa</Label>
              <Select value={form.stage_id} onValueChange={(v) => setForm((f) => ({ ...f, stage_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Organização</Label>
            <Select
              value={form.organization_id}
              onValueChange={(v) => setForm((f) => ({ ...f, organization_id: v, person_id: NONE }))}
            >
              <SelectTrigger><SelectValue placeholder="Sem organização" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem organização</SelectItem>
                {organizations.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Contato</Label>
            <Select value={form.person_id} onValueChange={(v) => setForm((f) => ({ ...f, person_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Sem contato" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem contato</SelectItem>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deal-date">Previsão de fechamento</Label>
            <Input
              id="deal-date"
              type="date"
              value={form.expected_close_date}
              onChange={(e) => setForm((f) => ({ ...f, expected_close_date: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="deal-desc">Observações</Label>
            <Textarea
              id="deal-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!form.title.trim() || !form.stage_id || saveDeal.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
