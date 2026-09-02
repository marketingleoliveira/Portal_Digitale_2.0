import { useMemo, useState } from "react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Building2, User, Phone, Mail, Clock, Search, Loader2, CalendarCheck,
  CheckCircle2, XCircle, Trash2, FileText,
} from "lucide-react";
import { format, isFuture, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  useCrmMeetingSchedules,
  useUpdateCrmMeeting,
  useDeleteCrmMeeting,
  type CrmMeetingSchedule,
  type CrmMeetingStatus,
} from "@/hooks/useCrmMeetingSchedules";

const STATUS_LABEL: Record<CrmMeetingStatus, string> = {
  agendado: "Agendado",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

export default function CrmAgendamentos() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | CrmMeetingStatus>("todos");

  const { data: meetings = [], isLoading } = useCrmMeetingSchedules();
  const updateMeeting = useUpdateCrmMeeting();
  const deleteMeeting = useDeleteCrmMeeting();

  const filtered = useMemo<CrmMeetingSchedule[]>(() => {
    const q = search.trim().toLowerCase();
    return meetings.filter((m) => {
      if (statusFilter !== "todos" && m.status !== statusFilter) return false;
      if (!q) return true;
      return (
        m.company_name.toLowerCase().includes(q) ||
        m.title.toLowerCase().includes(q) ||
        (m.contact_name ?? "").toLowerCase().includes(q) ||
        (m.assigned_profile?.full_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [meetings, search, statusFilter]);

  const stats = useMemo(() => {
    const upcoming = meetings.filter(
      (m) => m.status === "agendado" && isFuture(new Date(m.scheduled_date)),
    ).length;
    const overdue = meetings.filter(
      (m) => m.status === "agendado" && isPast(new Date(m.scheduled_date)),
    ).length;
    const done = meetings.filter((m) => m.status === "realizado").length;
    return { total: meetings.length, upcoming, overdue, done };
  }, [meetings]);

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Agendamentos</h1>
            <p className="text-sm text-muted-foreground">
              Resumo de todas as reuniões cadastradas no calendário do CRM
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar empresa, contato, vendedor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total", value: stats.total, icon: FileText },
            { label: "Próximos", value: stats.upcoming, icon: CalendarCheck },
            { label: "Pendentes/Atrasados", value: stats.overdue, icon: Clock },
            { label: "Realizados", value: stats.done, icon: CheckCircle2 },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <s.icon className="w-3.5 h-3.5" />
                  {s.label}
                </div>
                <p className="text-2xl font-bold mt-1">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base">Lista de agendamentos</CardTitle>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="agendado">Agendado</SelectItem>
                <SelectItem value="realizado">Realizado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <div className="flex justify-center py-14">
                <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
                <CalendarCheck className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm">Nenhum agendamento encontrado</p>
              </div>
            ) : (
              filtered.map((m) => {
                const date = new Date(m.scheduled_date);
                const late = m.status === "agendado" && isPast(date);
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "rounded-lg border p-3 bg-card",
                      late && "border-amber-300 dark:border-amber-800",
                    )}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{m.title}</span>
                          <Badge
                            variant={
                              m.status === "realizado"
                                ? "default"
                                : m.status === "cancelado"
                                  ? "destructive"
                                  : "secondary"
                            }
                            className="text-[10px]"
                          >
                            {STATUS_LABEL[m.status]}
                          </Badge>
                          {late && (
                            <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700">
                              Atrasado
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <Building2 className="w-3.5 h-3.5" />
                          <span className="truncate">{m.company_name}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(date, "dd/MM/yyyy HH:mm", { locale: ptBR })} · {m.duration_minutes} min
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {m.assigned_profile?.full_name ?? "Sem vendedor"}
                          </span>
                          {m.contact_name && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {m.contact_name}
                            </span>
                          )}
                          {m.contact_phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {m.contact_phone}
                            </span>
                          )}
                          {m.contact_email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {m.contact_email}
                            </span>
                          )}
                        </div>
                        {m.notes && (
                          <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">
                            {m.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {m.status !== "realizado" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Marcar como realizado"
                            onClick={() => updateMeeting.mutate({ id: m.id, status: "realizado" })}
                          >
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          </Button>
                        )}
                        {m.status !== "cancelado" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Cancelar agendamento"
                            onClick={() => updateMeeting.mutate({ id: m.id, status: "cancelado" })}
                          >
                            <XCircle className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Excluir agendamento"
                          onClick={() => deleteMeeting.mutate(m.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
