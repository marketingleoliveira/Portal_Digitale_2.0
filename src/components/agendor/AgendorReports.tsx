import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL, useDeals, useSellers, useStages } from "@/hooks/useAgendor";

interface AgendorReportsProps {
  pipelineId: string | null;
  ownerId: string | null;
}

const PERIODS = [
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "180", label: "Últimos 6 meses" },
  { value: "365", label: "Últimos 12 meses" },
  { value: "all", label: "Todo o período" },
];

/** Relatórios comerciais: conversão por etapa, receita e desempenho por responsável. */
export function AgendorReports({ pipelineId, ownerId }: AgendorReportsProps) {
  const { data: deals = [] } = useDeals(pipelineId, ownerId);
  const { data: stages = [] } = useStages(pipelineId);
  const { data: sellers = [] } = useSellers();
  const [period, setPeriod] = useState("90");

  const scoped = useMemo(() => {
    if (period === "all") return deals;
    const limit = Date.now() - Number(period) * 86400000;
    return deals.filter((d) => new Date(d.created_at).getTime() >= limit);
  }, [deals, period]);

  const sum = (list: typeof scoped) => list.reduce((acc, d) => acc + Number(d.value ?? 0), 0);
  const won = scoped.filter((d) => d.status === "ganho");
  const lost = scoped.filter((d) => d.status === "perdido");
  const open = scoped.filter((d) => d.status === "aberto");

  const stageData = stages.map((stage) => ({
    name: stage.name,
    negocios: scoped.filter((d) => d.stage_id === stage.id).length,
    valor: sum(scoped.filter((d) => d.stage_id === stage.id)),
  }));

  const sellerData = sellers
    .map((s) => ({
      name: s.full_name.split(" ")[0],
      ganhos: won.filter((d) => d.owner_user_id === s.id).length,
      receita: sum(won.filter((d) => d.owner_user_id === s.id)),
    }))
    .filter((row) => row.ganhos > 0 || row.receita > 0);

  const outcomeData = [
    { name: "Ganhos", value: won.length },
    { name: "Perdidos", value: lost.length },
    { name: "Em aberto", value: open.length },
  ];
  const OUTCOME_FILLS = ["hsl(var(--primary))", "hsl(var(--destructive))", "hsl(var(--muted-foreground))"];

  const avgDays = won.length
    ? Math.round(
        won.reduce(
          (acc, d) =>
            acc +
            (new Date(d.closed_at ?? d.updated_at).getTime() - new Date(d.created_at).getTime()) / 86400000,
          0
        ) / won.length
      )
    : 0;

  const kpis = [
    { label: "Receita ganha", value: formatBRL(sum(won)) },
    { label: "Receita perdida", value: formatBRL(sum(lost)) },
    { label: "Receita em aberto", value: formatBRL(sum(open)) },
    { label: "Ticket médio", value: formatBRL(won.length ? sum(won) / won.length : 0) },
    {
      label: "Taxa de conversão",
      value: `${won.length + lost.length > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) : 0}%`,
    },
    { label: "Tempo médio de fechamento", value: `${avgDays} dia(s)` },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
            <p className="text-xl font-bold mt-1">{kpi.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-4">Negócios por etapa</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stageData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip />
              <Bar dataKey="negocios" name="Negócios" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-4">Resultado das oportunidades</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={outcomeData} dataKey="value" nameKey="name" outerRadius={90} label>
                {outcomeData.map((entry, index) => (
                  <Cell key={entry.name} fill={OUTCOME_FILLS[index]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-4">Receita ganha por responsável</h3>
        {sellerData.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma venda registrada no período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={sellerData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip formatter={(value: number) => formatBRL(value)} />
              <Bar dataKey="receita" name="Receita" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}
