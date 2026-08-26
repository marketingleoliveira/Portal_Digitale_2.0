import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash2 } from "lucide-react";
import { ActivitiesPanel } from "./ActivitiesPanel";
import { DealFormDialog } from "./DealFormDialog";
import { formatBRL, useDeleteDeal, type CrmDeal, type CrmStage } from "@/hooks/useAgendor";

interface DealDetailSheetProps {
  deal: CrmDeal | null;
  stages: CrmStage[];
  pipelineId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_LABEL: Record<string, string> = {
  aberto: "Em aberto",
  ganho: "Ganho",
  perdido: "Perdido",
};

export function DealDetailSheet({ deal, stages, pipelineId, open, onOpenChange }: DealDetailSheetProps) {
  const deleteDeal = useDeleteDeal();
  const [showEdit, setShowEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!deal) return null;
  const stage = stages.find((s) => s.id === deal.stage_id);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="pr-8">{deal.title}</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{stage?.name ?? "Etapa"}</Badge>
              <Badge variant={deal.status === "perdido" ? "destructive" : "outline"}>
                {STATUS_LABEL[deal.status]}
              </Badge>
              <span className="text-lg font-bold ml-auto">{formatBRL(Number(deal.value ?? 0))}</span>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Organização</dt>
                <dd>{deal.organization?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Contato</dt>
                <dd>{deal.person?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Telefone</dt>
                <dd>{deal.person?.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Previsão</dt>
                <dd>
                  {deal.expected_close_date
                    ? new Date(`${deal.expected_close_date}T12:00:00`).toLocaleDateString("pt-BR")
                    : "—"}
                </dd>
              </div>
            </dl>

            {deal.description && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{deal.description}</p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowEdit(true)}>
                <Pencil className="w-4 h-4" />
                Editar
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="w-4 h-4 text-destructive" />
                Excluir
              </Button>
            </div>

            <Separator />

            <ActivitiesPanel dealId={deal.id} organizationId={deal.organization_id} compact />
          </div>
        </SheetContent>
      </Sheet>

      <DealFormDialog
        open={showEdit}
        onOpenChange={setShowEdit}
        pipelineId={pipelineId}
        stages={stages}
        deal={deal}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir negócio?</AlertDialogTitle>
            <AlertDialogDescription>
              As atividades vinculadas a este negócio também serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteDeal.mutate(deal.id);
                setConfirmDelete(false);
                onOpenChange(false);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
