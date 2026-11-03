import { Card } from "@/components/ui/card";
import { Briefcase, TrendingUp, Trophy, XCircle, Globe, Sparkles } from "lucide-react";
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

  const normalizeSource = (source: CrmDeal["source"]) =>
    String(source ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();

  const siteLeads = deals.filter(
    (deal) => normalizeSource(deal.source) === "SITE"
  );
  const aiLeads = deals.filter(
    (deal) => ["IA", "IA PROSPECCAO"].includes(normalizeSource(deal.source))
  );

  const items = [
    {
      label: "Leads do site",
      value: String(siteLeads.length),
      hint: `${siteLeads.filter((d) => d.status === "aberto").length} em aberto · todos os status`,
      icon: Globe,
    },
    {
      label: "Leads da IA",
      value: String(aiLeads.length),
      hint: `${aiLeads.filter((d) => d.status === "aberto").length} em aberto · todos os status`,
      icon: Sparkles,
    },
    { label: "Negócios abertos", value: String(open.length), hint: formatBRL(openValue), icon: Briefcase },
    { label: "Ganhos", value: String(won.length), hint: formatBRL(wonValue), icon: Trophy },
    { label: "Perdidos", value: String(lost.length), hint: "Encerrados sem venda", icon: XCircle },
    { label: "Taxa de conversão", value: `${conversion}%`, hint: `${closed} negócios encerrados`, icon: TrendingUp },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
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
