import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCloseDeal, useCrmSettings, type CrmDeal, type CrmStage } from "@/hooks/useAgendor";

interface CloseDealDialogProps {
  deal: CrmDeal | null;
  stages: CrmStage[];
  outcome: "ganho" | "perdido";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Diálogo de fechamento: ganho confirma valor final, perda exige motivo. */
export function CloseDealDialog({ deal, stages, outcome, open, onOpenChange }: CloseDealDialogProps) {
  const closeDeal = useCloseDeal();
  const { data: settings } = useCrmSettings();
  const [finalValue, setFinalValue] = useState("");
  const [closedAt, setClosedAt] = useState("");
  const [reason, setReason] = useState("");
  const [competitor, setCompetitor] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open || !deal) return;
    setFinalValue(String(deal.value ?? ""));
    setClosedAt(new Date().toISOString().slice(0, 10));
    setReason("");
    setCompetitor("");
    setNote("");
  }, [open, deal]);

  if (!deal) return null;
  const isWin = outcome === "ganho";
  const targetStage = stages.find((s) => (isWin ? s.is_won : s.is_lost));
  const invalid = !isWin && !reason;

  const handleConfirm = async () => {
    if (invalid) return;
    await closeDeal.mutateAsync({
      deal,
      outcome,
      stageId: targetStage?.id ?? null,
      finalValue: isWin ? Number(finalValue.replace(",", ".")) || 0 : null,
      lossReason: isWin ? null : reason,
      competitor: isWin ? null : competitor.trim() || null,
      note: note.trim() || null,
      closedAt: closedAt ? new Date(`${closedAt}T12:00:00`).toISOString() : null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{isWin ? "Ganhar negócio" : "Perder negócio"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isWin ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="final-value">Valor final fechado (R$)</Label>
                <Input
                  id="final-value"
                  inputMode="decimal"
                  value={finalValue}
                  onChange={(e) => setFinalValue(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="closed-at">Data do fechamento</Label>
                <Input
                  id="closed-at"
                  type="date"
                  value={closedAt}
                  onChange={(e) => setClosedAt(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Motivo da perda *</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {(settings?.loss_reasons ?? []).map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="competitor">Concorrente (opcional)</Label>
                <Input id="competitor" value={competitor} onChange={(e) => setCompetitor(e.target.value)} />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="close-note">Observação</Label>
            <Textarea id="close-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={invalid || closeDeal.isPending}>
            {isWin ? "Confirmar ganho" : "Confirmar perda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
