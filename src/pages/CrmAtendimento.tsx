import { useMemo, useState } from "react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useLeads, useLeadsRealtime, LEAD_STATUS_CONFIG, type Lead, type LeadStatus } from "@/hooks/useCRM";
import { LeadDetailSheet } from "@/components/crm/LeadDetailSheet";
import { CRMTable } from "@/components/crm/CRMTable";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, Handshake, Users } from "lucide-react";
import { isDevLevel } from "@/types/auth";

/**
 * Atendimento — leads gerados pelos agendamentos do CRM.
 * Vendedores visualizam exclusivamente os leads designados a eles (isolamento reforçado por RLS).
 */
const CrmAtendimento = () => {
  const { user } = useAuth();
  const canSeeAll = isDevLevel(user?.role) || user?.role === "sdr" || user?.role === "admin";

  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  useLeadsRealtime();
  const { data: leads = [], isLoading } = useLeads(
    statusFilter === "all" ? null : statusFilter,
    "atendimento",
  );

  const visibleLeads = useMemo(() => {
    const scoped = canSeeAll ? leads : leads.filter((l) => l.assigned_to === user?.id);
    if (!searchTerm) return scoped;
    const q = searchTerm.toLowerCase();
    return scoped.filter(
      (l) =>
        l.company_name.toLowerCase().includes(q) ||
        l.contact_name.toLowerCase().includes(q) ||
        l.contact_email?.toLowerCase().includes(q) ||
        l.contact_phone?.includes(q),
    );
  }, [leads, canSeeAll, user?.id, searchTerm]);

  const openCount = visibleLeads.filter((l) => !["ganho", "perdido", "fora_de_perfil"].includes(l.status)).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Handshake className="w-6 h-6 text-primary" />
            Atendimento
          </h1>
          <p className="text-sm text-muted-foreground">
            {canSeeAll
              ? "Leads designados aos vendedores a partir dos agendamentos do CRM"
              : "Leads designados a você a partir dos agendamentos do CRM"}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{visibleLeads.length}</p>
                <p className="text-xs text-muted-foreground">Leads no atendimento</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Handshake className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{openCount}</p>
                <p className="text-xs text-muted-foreground">Em andamento</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar leads..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as LeadStatus | "all")}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(LEAD_STATUS_CONFIG).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>
                  {cfg.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : visibleLeads.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              Nenhum lead designado até o momento.
            </CardContent>
          </Card>
        ) : (
          <CRMTable
            leads={visibleLeads}
            onSelectLead={(lead) => {
              setSelectedLead(lead);
              setShowDetail(true);
            }}
          />
        )}
      </div>

      <LeadDetailSheet lead={selectedLead} open={showDetail} onOpenChange={setShowDetail} />
    </DashboardLayout>
  );
};

export default CrmAtendimento;
