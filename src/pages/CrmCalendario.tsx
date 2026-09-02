import { useMemo, useState } from "react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { CalendarPlus, Clock, Loader2, User, Building2, Trash2 } from "lucide-react";
import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { CrmMeetingFormDialog } from "@/components/crm/CrmMeetingFormDialog";
import {
  useCrmMeetingSchedules,
  useDeleteCrmMeeting,
  type CrmMeetingSchedule,
} from "@/hooks/useCrmMeetingSchedules";

export default function CrmCalendario() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: meetings = [], isLoading } = useCrmMeetingSchedules();
  const deleteMeeting = useDeleteCrmMeeting();

  const dayMeetings = useMemo<CrmMeetingSchedule[]>(() => {
    if (!selectedDate) return [];
    return meetings.filter((m) => isSameDay(new Date(m.scheduled_date), selectedDate));
  }, [meetings, selectedDate]);

  const bookedDays = useMemo(
    () => meetings.map((m) => new Date(m.scheduled_date)),
    [meetings],
  );

  const handleSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    if (date) setDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Calendário CRM</h1>
            <p className="text-sm text-muted-foreground">
              Clique em uma data para agendar manualmente uma reunião e atribuir a um vendedor
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)} disabled={!selectedDate}>
            <CalendarPlus className="w-4 h-4 mr-2" />
            Nova reunião
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
          <Card>
            <CardContent className="p-3">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleSelect}
                locale={ptBR}
                modifiers={{ booked: bookedDays }}
                modifiersClassNames={{
                  booked: "font-bold text-primary underline underline-offset-4",
                }}
                className={cn("p-3 pointer-events-auto")}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="w-4 h-4 text-primary" />
                {selectedDate
                  ? format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                  : "Selecione uma data"}
                <Badge variant="secondary" className="ml-auto text-xs">
                  {dayMeetings.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : dayMeetings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <CalendarPlus className="w-9 h-9 mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma reunião agendada nesta data</p>
                </div>
              ) : (
                dayMeetings.map((m) => (
                  <div key={m.id} className="rounded-lg border p-3 bg-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{m.title}</p>
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <Building2 className="w-3.5 h-3.5" />
                          <span className="truncate">{m.company_name}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(new Date(m.scheduled_date), "HH:mm")} · {m.duration_minutes} min
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {m.assigned_profile?.full_name ?? "Sem vendedor"}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Excluir agendamento"
                        onClick={() => deleteMeeting.mutate(m.id)}
                        disabled={deleteMeeting.isPending}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <CrmMeetingFormDialog date={selectedDate} open={dialogOpen} onOpenChange={setDialogOpen} />
    </DashboardLayout>
  );
}
