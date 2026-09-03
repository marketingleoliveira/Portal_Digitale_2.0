import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { ArrowRightLeft, Pencil, RotateCcw, ThumbsDown, Trophy, Trash2 } from "lucide-react";
import { ActivitiesPanel } from "./ActivitiesPanel";
import { DealFormDialog } from "./DealFormDialog";
import { DealHealthDot } from "./DealHealthDot";
import { DealProductsPanel } from "./DealProductsPanel";
import { CloseDealDialog } from "./CloseDealDialog";
import { TransferDealsDialog } from "./TransferDealsDialog";
import {
  computeDealHealth,
  formatBRL,
  useActivities,
  useCrmSettings,
  useDeleteDeal,
  useReopenDeal,
  useSellers,
  type CrmDeal,
  type CrmStage,
} from "@/hooks/useAgendor";

interface DealDetailSheetProps {
  deal: CrmDeal | null;
  stages: CrmStage[];
  pipelineId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Habilita transferência de responsável (Gerência). */
  allowTransfer?: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  aberto: "Em aberto",
  ganho: "Ganho",
  perdido: "Perdido",
};

export function DealDetailSheet({
  deal,
  stages,
  pipelineId,
  open,
  onOpenChange,
  allowTransfer,
}: DealDetailSheetProps) {
  const deleteDeal = useDeleteDeal();
  const reopenDeal = useReopenDeal();
  const { data: activities = [] } = useActivities({ dealId: deal?.id ?? null });
  const { data: settings } = useCrmSettings();
  const { data: sellers = [] } = useSellers();
  const [showEdit, setShowEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [closeOutcome, setCloseOutcome] = useState<"ganho" | "perdido" | null>(null);

  if (!deal) return null;
  const stage = stages.find((s) => s.id === deal.stage_id);
  const owner = sellers.find((s) => s.id === deal.owner_user_id);
  const { health, nextTask, daysIdle } = computeDealHealth(deal, activities, settings?.health_rules);
  const isOpen = deal.status === "aberto";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="pr-8">{deal.title}</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{stage?.name ?? "Etapa"}</Badge>
              <Badge variant={deal.status === "perdido" ? "destructive" : "outline"}>
                {STATUS_LABEL[deal.status]}
              </Badge>
              {isOpen && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <DealHealthDot health={health} daysIdle={daysIdle} />
                  {daysIdle <= 0 ? "movimentado hoje" : `${daysIdle} dia(s) parado`}
                </span>
              )}
              <span className="text-lg font-bold ml-auto">
                {formatBRL(Number(deal.won_value ?? deal.value ?? 0))}
              </span>
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
              <div>
                <dt className="text-xs text-muted-foreground">Responsável</dt>
                <dd>{owner?.full_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Próximo passo</dt>
                <dd>{nextTask?.title ?? "Não definido"}</dd>
              </div>
              {deal.status === "perdido" && (
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Motivo da perda</dt>
                  <dd>
                    {deal.loss_reason ?? "—"}
                    {deal.loss_competitor ? ` • concorrente: ${deal.loss_competitor}` : ""}
                  </dd>
                </div>
              )}
            </dl>

            {deal.description && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{deal.description}</p>
            )}

            <div className="flex flex-wrap gap-2">
              {isOpen ? (
                <>
                  <Button size="sm" className="gap-2" onClick={() => setCloseOutcome("ganho")}>
                    <Trophy className="w-4 h-4" />
                    Marcar como ganho
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => setCloseOutcome("perdido")}
                  >
                    <ThumbsDown className="w-4 h-4" />
                    Marcar como perdido
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => reopenDeal.mutate(deal.id)}
                >
                  <RotateCcw className="w-4 h-4" />
                  Reabrir negócio
                </Button>
              )}
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowEdit(true)}>
                <Pencil className="w-4 h-4" />
                Editar
              </Button>
              {allowTransfer && (
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowTransfer(true)}>
                  <ArrowRightLeft className="w-4 h-4" />
                  Transferir
                </Button>
              )}
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="w-4 h-4 text-destructive" />
                Excluir
              </Button>
            </div>

            <Separator />

            <Tabs defaultValue="historico" className="space-y-4">
              <TabsList>
                <TabsTrigger value="historico">Histórico e tarefas</TabsTrigger>
                <TabsTrigger value="produtos">Produtos</TabsTrigger>
              </TabsList>
              <TabsContent value="historico">
                <ActivitiesPanel dealId={deal.id} organizationId={deal.organization_id} compact />
              </TabsContent>
              <TabsContent value="produtos">
                <DealProductsPanel dealId={deal.id} />
              </TabsContent>
            </Tabs>
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

      <CloseDealDialog
        deal={deal}
        stages={stages}
        outcome={closeOutcome ?? "ganho"}
        open={closeOutcome !== null}
        onOpenChange={(value) => !value && setCloseOutcome(null)}
      />

      <TransferDealsDialog dealIds={[deal.id]} open={showTransfer} onOpenChange={setShowTransfer} />

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
