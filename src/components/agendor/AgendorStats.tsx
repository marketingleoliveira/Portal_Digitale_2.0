import { Card } from "@/components/ui/card";
import { Briefcase, TrendingUp, Trophy, XCircle } from "lucide-react";
import { formatBRL, type CrmDeal } from "@/hooks/useAgendor";

interface AgendorStatsProps {
  deals: CrmDeal[];
}

export function AgendorStats({ deals }: AgendorStatsProps) {
  const open = deals.filter((d) => d.status === "aberto");
  const won = deals.filter((d) => d.status === "ganho");
  const lost = deals.filter((d) => d.status === "perdido");
  const openValue = open.reduce((sum, d) => sum + Number(d.value ?? 0), 0);
  const wonValue = won.reduce((sum, d) => sum + Number(d.value ?? 0), 0);
  const closed = won.length + lost.length;
  const conversion = closed > 0 ? Math.round((won.length / closed) * 100) : 0;

  const items = [
    { label: "Negócios abertos", value: String(open.length), hint: formatBRL(openValue), icon: Briefcase },
    { label: "Ganhos", value: String(won.length), hint: formatBRL(wonValue), icon: Trophy },
    { label: "Perdidos", value: String(lost.length), hint: "Encerrados sem venda", icon: XCircle },
    { label: "Taxa de conversão", value: `${conversion}%`, hint: `${closed} negócios encerrados`, icon: TrendingUp },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map(({ label, value, hint, icon: Icon }) => (
        <Card key={label} className="p-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground truncate">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            <p className="text-xs text-muted-foreground truncate">{hint}</p>
          </div>
          <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
        </Card>
      ))}
    </div>
  );
}
