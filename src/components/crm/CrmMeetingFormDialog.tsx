import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarPlus, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useVendedores } from "@/hooks/useCRM";
import { useCreateCrmMeeting } from "@/hooks/useCrmMeetingSchedules";

export interface CrmMeetingFormDialogProps {
  date: Date | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CrmMeetingFormDialog({ date, open, onOpenChange }: CrmMeetingFormDialogProps) {
  const { data: vendedores } = useVendedores();
  const createMeeting = useCreateCrmMeeting();

  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState("60");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [vendedor, setVendedor] = useState("");

  useEffect(() => {
    if (open) {
      setTime("09:00");
      setDuration("60");
      setTitle("");
      setCompany("");
      setContact("");
      setPhone("");
      setEmail("");
      setNotes("");
      setVendedor("");
    }
  }, [open]);

  const canSubmit = !!date && company.trim().length > 0 && !createMeeting.isPending;

  const handleSubmit = async () => {
    if (!date) return;
    const [hours, minutes] = time.split(":").map(Number);
    const scheduled = new Date(date);
    scheduled.setHours(hours || 0, minutes || 0, 0, 0);

    await createMeeting.mutateAsync({
      scheduled_date: scheduled.toISOString(),
      duration_minutes: Number(duration) || 60,
      title: title.trim() || `Reunião - ${company.trim()}`,
      company_name: company,
      contact_name: contact,
      contact_phone: phone,
      contact_email: email,
      notes,
      assigned_to: vendedor || null,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-primary" />
            Nova reunião
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {date && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              {format(date, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="crm-meeting-time">Horário</Label>
              <Input
                id="crm-meeting-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="crm-meeting-duration">Duração (min)</Label>
              <Input
                id="crm-meeting-duration"
                type="number"
                min={15}
                step={15}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="crm-meeting-company">Empresa / Lead *</Label>
            <Input
              id="crm-meeting-company"
              value={company}
              maxLength={120}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Nome da empresa"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="crm-meeting-title">Título da reunião</Label>
            <Input
              id="crm-meeting-title"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={company ? `Reunião - ${company}` : "Reunião comercial"}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="crm-meeting-contact">Contato</Label>
              <Input
                id="crm-meeting-contact"
                value={contact}
                maxLength={120}
                onChange={(e) => setContact(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="crm-meeting-phone">Telefone</Label>
              <Input
                id="crm-meeting-phone"
                value={phone}
                maxLength={30}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="crm-meeting-email">E-mail</Label>
            <Input
              id="crm-meeting-email"
              type="email"
              value={email}
              maxLength={160}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Vendedor responsável</Label>
            <Select value={vendedor} onValueChange={setVendedor}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar vendedor..." />
              </SelectTrigger>
              <SelectContent>
                {vendedores?.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.full_name} {v.region ? `(${v.region})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="crm-meeting-notes">Observações</Label>
            <Textarea
              id="crm-meeting-notes"
              value={notes}
              maxLength={1000}
              rows={3}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalhes do agendamento, pauta, interesse do lead..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {createMeeting.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Agendar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
