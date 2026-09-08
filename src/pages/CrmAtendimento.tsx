import { useMemo, useState } from "react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useLeadsRealtime, type Lead } from "@/hooks/useCRM";
import {
  useCrmScheduledLeads,
  useUpdateAttendanceStatus,
  ATTENDANCE_STATUS_CONFIG,
  ATTENDANCE_STATUS_ORDER,
  type AttendanceStatus,
} from "@/hooks/useCrmMeetingSchedules";
import { LeadDetailSheet } from "@/components/crm/LeadDetailSheet";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Loader2, Handshake, Users, UserCheck, CheckCircle2 } from "lucide-react";
import { isDevLevel } from "@/types/auth";
import { cn } from "@/lib/utils";

/**
 * Atendimento — leads gerados pelos agendamentos do CRM.
 * Vendedores visualizam exclusivamente os leads designados a eles (isolamento reforçado por RLS).
 */
const CrmAtendimento = () => {
  const { user } = useAuth();
  const canSeeAll = isDevLevel(user?.role) || user?.role === "sdr" || user?.role === "admin";
  const isSeller = user?.role === "vendedor";

  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | "all">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  useLeadsRealtime();
  // Fonte única: apenas leads vinculados a agendamentos do Calendário do CRM.
  const { data, isLoading } = useCrmScheduledLeads();
  const updateStatus = useUpdateAttendanceStatus();
  const scheduledLeads = data?.leads ?? [];
  const scheduledOwners = data?.owners ?? {};

  const visibleLeads = useMemo(() => {
    // Cada vendedor vê exclusivamente os agendamentos designados a ele.
    let scoped = canSeeAll
      ? scheduledLeads
      : scheduledLeads.filter(
          (l) => l.assigned_to === user?.id || scheduledOwners[l.id] === user?.id,
        );
    if (statusFilter !== "all") {
      scoped = scoped.filter((l) => (l.attendance_status ?? "agendado") === statusFilter);
    }
    if (!searchTerm) return scoped;
    const q = searchTerm.toLowerCase();
    return scoped.filter(
      (l) =>
        l.company_name.toLowerCase().includes(q) ||
        l.contact_name.toLowerCase().includes(q) ||
        l.contact_email?.toLowerCase().includes(q) ||
        l.contact_phone?.includes(q),
    );
  }, [scheduledLeads, scheduledOwners, canSeeAll, user?.id, searchTerm, statusFilter]);

  const openCount = visibleLeads.filter(
    (l) => !["finalizado", "cancelado"].includes(l.attendance_status ?? "agendado"),
  ).length;
  const doneCount = visibleLeads.filter((l) => l.attendance_status === "finalizado").length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Handshake className="w-6 h-6 text-primary" />
            {isSeller ? "Meu Atendimento" : "Atendimento"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isSeller
              ? "Aqui aparecem apenas os leads designados a você pelos agendamentos do Calendário do CRM"
              : canSeeAll
                ? "Leads designados aos vendedores a partir dos agendamentos do CRM"
                : "Leads designados a você a partir dos agendamentos do CRM"}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{visibleLeads.length}</p>
                <p className="text-xs text-muted-foreground">
                  {isSeller ? "Meus leads" : "Leads no atendimento"}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Handshake className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{openCount}</p>
                <p className="text-xs text-muted-foreground">
                  {isSeller ? "Meus atendimentos em andamento" : "Em andamento"}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{doneCount}</p>
                <p className="text-xs text-muted-foreground">Finalizados</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={isSeller ? "Buscar nos meus leads..." : "Buscar leads..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as AttendanceStatus | "all")}
          >
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {ATTENDANCE_STATUS_ORDER.map((key) => (
                <SelectItem key={key} value={key}>
                  {ATTENDANCE_STATUS_CONFIG[key].label}
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
            <CardContent className="p-10 text-center">
              <UserCheck className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">
                {isSeller
                  ? "Você ainda não possui leads atribuídos. Assim que o gerente designar uma reunião a você no Calendário do CRM, seus leads aparecerão aqui."
                  : "Nenhum agendamento designado até o momento. Os leads aparecem aqui após uma reunião ser agendada no Calendário do CRM."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {visibleLeads.map((lead) => {
              const status = (lead.attendance_status ?? "agendado") as AttendanceStatus;
              const cfg = ATTENDANCE_STATUS_CONFIG[status] ?? ATTENDANCE_STATUS_CONFIG.agendado;
              return (
                <Card key={lead.id}>
                  <CardContent className="p-4 flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold truncate">{lead.company_name}</p>
                        <Badge variant="outline" className={cn("text-xs", cfg.className)}>
                          {cfg.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {lead.contact_name}
                        {lead.contact_phone ? ` · ${lead.contact_phone}` : ""}
                        {lead.contact_email ? ` · ${lead.contact_email}` : ""}
                      </p>
                      {canSeeAll && lead.assigned_profile?.full_name && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Responsável: {lead.assigned_profile.full_name}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Select
                        value={status}
                        onValueChange={(v) =>
                          updateStatus.mutate({ leadId: lead.id, status: v as AttendanceStatus })
                        }
                        disabled={updateStatus.isPending}
                      >
                        <SelectTrigger className="w-full sm:w-[180px]" aria-label="Status do atendimento">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ATTENDANCE_STATUS_ORDER.map((key) => (
                            <SelectItem key={key} value={key}>
                              {ATTENDANCE_STATUS_CONFIG[key].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedLead(lead);
                          setShowDetail(true);
                        }}
                      >
                        Detalhes
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <LeadDetailSheet lead={selectedLead} open={showDetail} onOpenChange={setShowDetail} />
    </DashboardLayout>
  );
};

export default CrmAtendimento;
