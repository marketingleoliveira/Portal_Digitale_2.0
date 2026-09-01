import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye } from "lucide-react";
import {
  computeDealHealth,
  formatBRL,
  useActivities,
  useCrmSettings,
  useDeals,
  useSellers,
} from "@/hooks/useAgendor";

interface SellersPerformanceProps {
  pipelineId: string | null;
  onViewSeller: (sellerId: string) => void;
}

/** Comparativo de desempenho por vendedor, com acesso à visão individual. */
export function SellersPerformance({ pipelineId, onViewSeller }: SellersPerformanceProps) {
  const { data: sellers = [], isLoading } = useSellers();
  const { data: deals = [] } = useDeals(pipelineId, null);
  const { data: activities = [] } = useActivities({});
  const { data: settings } = useCrmSettings();

  const rows = useMemo(() => {
    const now = new Date();
    return sellers
      .map((seller) => {
        const mine = deals.filter((d) => d.owner_user_id === seller.id);
        const open = mine.filter((d) => d.status === "aberto");
        const won = mine.filter((d) => d.status === "ganho");
        const lost = mine.filter((d) => d.status === "perdido");
        const sum = (list: typeof mine) => list.reduce((acc, d) => acc + Number(d.value ?? 0), 0);
        const closed = won.length + lost.length;
        const tasks = activities.filter(
          (a) => a.assigned_to === seller.id && a.activity_type !== "historico" && !a.completed_at
        );
        const critical = open.filter(
          (d) => computeDealHealth(d, activities, settings?.health_rules).health === "critico"
        ).length;

        return {
          seller,
          total: mine.length,
          open: open.length,
          openValue: sum(open),
          won: won.length,
          revenue: sum(won),
          lost: lost.length,
          conversion: closed > 0 ? Math.round((won.length / closed) * 100) : 0,
          ticket: won.length > 0 ? sum(won) / won.length : 0,
          overdue: tasks.filter((a) => a.due_at && new Date(a.due_at) < now).length,
          critical,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [sellers, deals, activities, settings]);

  if (isLoading) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Carregando vendedores...</Card>;
  }

  return (
    <Card className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vendedor</TableHead>
            <TableHead className="text-right">Carteira</TableHead>
            <TableHead className="text-right">Em andamento</TableHead>
            <TableHead className="text-right">Em negociação</TableHead>
            <TableHead className="text-right">Ganhos</TableHead>
            <TableHead className="text-right">Receita</TableHead>
            <TableHead className="text-right">Conversão</TableHead>
            <TableHead className="text-right">Ticket médio</TableHead>
            <TableHead className="text-right">Tarefas atrasadas</TableHead>
            <TableHead className="text-right">Críticos</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.seller.id}>
              <TableCell className="font-medium">{row.seller.full_name}</TableCell>
              <TableCell className="text-right">{row.total}</TableCell>
              <TableCell className="text-right">{row.open}</TableCell>
              <TableCell className="text-right">{formatBRL(row.openValue)}</TableCell>
              <TableCell className="text-right">{row.won}</TableCell>
              <TableCell className="text-right font-semibold">{formatBRL(row.revenue)}</TableCell>
              <TableCell className="text-right">{row.conversion}%</TableCell>
              <TableCell className="text-right">{formatBRL(row.ticket)}</TableCell>
              <TableCell className="text-right">
                {row.overdue > 0 ? (
                  <Badge variant="destructive">{row.overdue}</Badge>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {row.critical > 0 ? (
                  <Badge variant="outline" className="border-destructive text-destructive">{row.critical}</Badge>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => onViewSeller(row.seller.id)}>
                  <Eye className="w-4 h-4" />
                  Ver Agendor
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-8">
                Nenhum vendedor cadastrado.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
