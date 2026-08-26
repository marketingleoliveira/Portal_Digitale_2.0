import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS, type AppRole } from "@/types/auth";
import { useSellers, useTransferDeals } from "@/hooks/useAgendor";

interface TransferDealsDialogProps {
  dealIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}

/** Transfere a carteira (um ou vários negócios) para outro responsável. */
export function TransferDealsDialog({ dealIds, open, onOpenChange, onDone }: TransferDealsDialogProps) {
  const { data: sellers = [] } = useSellers();
  const transfer = useTransferDeals();
  const [toUserId, setToUserId] = useState("");

  useEffect(() => {
    if (open) setToUserId("");
  }, [open]);

  const handleConfirm = async () => {
    if (!toUserId) return;
    await transfer.mutateAsync({ dealIds, toUserId });
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Transferir responsável</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {dealIds.length} negócio(s) selecionado(s). A transferência fica registrada no histórico.
          </p>
          <div className="space-y-1.5">
            <Label>Novo responsável</Label>
            <Select value={toUserId} onValueChange={setToUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o vendedor" />
              </SelectTrigger>
              <SelectContent>
                {sellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name} — {ROLE_LABELS[s.role as AppRole] ?? s.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!toUserId || dealIds.length === 0 || transfer.isPending}>
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
