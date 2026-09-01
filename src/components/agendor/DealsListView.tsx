import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRightLeft } from "lucide-react";
import { DealHealthDot } from "./DealHealthDot";
import { TransferDealsDialog } from "./TransferDealsDialog";
import {
  computeDealHealth,
  formatBRL,
  useCrmSettings,
  useSellers,
  type CrmActivity,
  type CrmDeal,
  type CrmStage,
} from "@/hooks/useAgendor";

interface DealsListViewProps {
  deals: CrmDeal[];
  stages: CrmStage[];
  activities: CrmActivity[];
  onSelectDeal: (deal: CrmDeal) => void;
  /** Habilita seleção em massa e transferência de carteira (Gerência). */
  allowTransfer?: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  aberto: "Em aberto",
  ganho: "Ganho",
  perdido: "Perdido",
};

/** Visualização em lista dos negócios, com transferência em massa para a Gerência. */
export function DealsListView({ deals, stages, activities, onSelectDeal, allowTransfer }: DealsListViewProps) {
  const { data: settings } = useCrmSettings();
  const { data: sellers = [] } = useSellers();
  const [selected, setSelected] = useState<string[]>([]);
  const [showTransfer, setShowTransfer] = useState(false);

  const rows = useMemo(
    () =>
      deals.map((deal) => ({
        deal,
        stage: stages.find((s) => s.id === deal.stage_id),
        owner: sellers.find((s) => s.id === deal.owner_user_id)?.full_name ?? "—",
        ...computeDealHealth(deal, activities, settings?.health_rules),
      })),
    [deals, stages, activities, sellers, settings]
  );

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  if (deals.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Nenhum negócio encontrado com os filtros atuais.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {allowTransfer && selected.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{selected.length} selecionado(s)</span>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => setShowTransfer(true)}>
            <ArrowRightLeft className="w-4 h-4" />
            Transferir responsável
          </Button>
        </div>
      )}

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {allowTransfer && <TableHead className="w-10" />}
              <TableHead className="w-10">Saúde</TableHead>
              <TableHead>Negócio</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Etapa</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Próxima tarefa</TableHead>
              <TableHead>Última movimentação</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ deal, stage, owner, health, nextTask, daysIdle }) => (
              <TableRow
                key={deal.id}
                className="cursor-pointer"
                onClick={() => onSelectDeal(deal)}
              >
                {allowTransfer && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.includes(deal.id)}
                      aria-label={`Selecionar ${deal.title}`}
                      onCheckedChange={() => toggle(deal.id)}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <DealHealthDot health={health} daysIdle={daysIdle} />
                </TableCell>
                <TableCell className="font-medium">{deal.title}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {deal.organization?.name ?? deal.person?.name ?? "—"}
                </TableCell>
                <TableCell className="text-sm">{stage?.name ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{owner}</TableCell>
                <TableCell className="text-right font-semibold">{formatBRL(Number(deal.value ?? 0))}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {nextTask
                    ? `${nextTask.title}${nextTask.due_at ? ` • ${new Date(nextTask.due_at).toLocaleDateString("pt-BR")}` : ""}`
                    : "Sem próximo passo"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {daysIdle <= 0 ? "Hoje" : `${daysIdle} dia(s)`}
                </TableCell>
                <TableCell>
                  <Badge variant={deal.status === "perdido" ? "destructive" : deal.status === "ganho" ? "default" : "secondary"}>
                    {STATUS_LABEL[deal.status]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <TransferDealsDialog
        dealIds={selected}
        open={showTransfer}
        onOpenChange={setShowTransfer}
        onDone={() => setSelected([])}
      />
    </div>
  );
}
