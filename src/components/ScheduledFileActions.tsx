import { useEffect, useState } from 'react';
import { CalendarClock, CalendarDays, ChevronDown, Clock3, Loader2, Upload, X } from 'lucide-react';
import { format, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// Próxima hora cheia sugerida; o agendamento continua respeitando o fuso do navegador.
const suggestedDate = () => {
  const value = new Date();
  value.setHours(value.getHours() + 1, 0, 0, 0);
  return value;
};

const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const monthNames = Array.from({ length: 12 }, (_, i) =>
  format(new Date(2024, i, 1), 'MMMM', { locale: ptBR })
);

interface FormValues {
  name: string;
  description: string;
  category_id: string;
  subcategory_id: string;
  visibility: string[];
  regions: string[];
}

interface Props {
  files: File[];
  form: FormValues;
  categoryName: string;
  uploading: boolean;
  onSend: () => void;
  onScheduled: () => void;
}

export default function ScheduledFileActions({
  files, form, categoryName, uploading, onSend, onScheduled
}: Props) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date>(() => suggestedDate());
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => suggestedDate());
  const [hour, setHour] = useState(() => String(suggestedDate().getHours()).padStart(2, '0'));
  const [minute, setMinute] = useState('00');
  const [busy, setBusy] = useState(false);

  const changeCalendarMonth = (month: number) => {
    setCalendarMonth(previous => new Date(previous.getFullYear(), month, 1));
  };
  const changeCalendarYear = (year: number) => {
    setCalendarMonth(previous => new Date(year, previous.getMonth(), 1));
  };

  const schedule = async () => {
    if (!files.length) {
      toast.error('Selecione pelo menos um arquivo');
      return;
    }
    if (files.length === 1 && !form.name.trim()) {
      toast.error('Informe o nome do arquivo');
      return;
    }
    if (!form.visibility.length) {
      toast.error('Selecione pelo menos um cargo');
      return;
    }

    const date = new Date(
      scheduledDate.getFullYear(), scheduledDate.getMonth(), scheduledDate.getDate(),
      Number(hour), Number(minute), 0, 0
    );
    if (!Number.isFinite(date.getTime()) ||
        date.getTime() < Date.now() + 60000) {
      toast.error('Selecione data e horário futuros');
      return;
    }

    const token = (session as any)?.access_token;
    if (!token) {
      toast.error('Sessão inválida. Entre novamente.');
      return;
    }

    setBusy(true);
    try {
      const payload = new FormData();
      files.forEach(file => payload.append('files', file));
      payload.append('name', form.name);
      payload.append('description', form.description);
      payload.append('category', categoryName);
      payload.append('subcategory_id', form.subcategory_id);
      payload.append('visibility', JSON.stringify(form.visibility));
      payload.append('regions', JSON.stringify(form.regions));
      payload.append('scheduled_at', date.toISOString());

      const response = await fetch('/api/scheduled-files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: payload,
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error?.message || 'Erro ao agendar envio');
      }

      toast.success('Arquivo agendado com sucesso');
      setOpen(false);
      setCalendarOpen(false);
      const initial = suggestedDate();
      setScheduledDate(initial);
      setCalendarMonth(initial);
      setHour(String(initial.getHours()).padStart(2, '0'));
      setMinute('00');
      onScheduled();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao agendar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          onClick={onSend}
          disabled={uploading || busy}
          className="w-full text-white"
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Upload className="w-4 h-4 mr-1" />
          )}
          Enviar Arquivo
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(value => !value)}
          disabled={uploading || busy}
          className="w-full"
        >
          <CalendarClock className="w-4 h-4 mr-1" />
          Agendar Envio
        </Button>
      </div>

      {open && (
        <div className="border rounded-lg p-3 space-y-2 bg-background">
          <div className="flex justify-between items-center">
            <span className="font-medium text-sm">
              Programar publicação
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.18fr)_minmax(0,0.95fr)_minmax(0,1.2fr)] gap-3 lg:items-end">
            <div className="space-y-2 min-w-0">
              <Label id="schedule-files-date-label">Data da publicação</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    aria-labelledby="schedule-files-date-label"
                    aria-expanded={calendarOpen}
                    disabled={busy}
                    className="w-full justify-between gap-2 text-left font-normal h-10"
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <CalendarDays className="w-4 h-4 shrink-0" />
                      <span className="truncate">{format(scheduledDate, 'dd/MM/yyyy', { locale: ptBR })}</span>
                    </span>
                    <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${calendarOpen ? 'rotate-180' : ''}`} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={6}
                  collisionPadding={12}
                  className="w-[min(350px,calc(100vw-2rem))] p-3 max-h-[75dvh] overflow-y-auto"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 mb-3">
                    <select
                      aria-label="Escolher mês"
                      value={calendarMonth.getMonth()}
                      onChange={event => changeCalendarMonth(Number(event.target.value))}
                      className="min-w-0 h-9 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {monthNames.map((name, index) => (
                        <option key={name} value={index}>
                          {name.charAt(0).toUpperCase() + name.slice(1)}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Escolher ano"
                      value={calendarMonth.getFullYear()}
                      onChange={event => changeCalendarYear(Number(event.target.value))}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {Array.from({ length: 6 }, (_, index) => new Date().getFullYear() + index)
                        .map(year => <option key={year} value={year}>{year}</option>)}
                    </select>
                  </div>
                  <Calendar
                    mode="single"
                    locale={ptBR}
                    month={calendarMonth}
                    onMonthChange={setCalendarMonth}
                    selected={scheduledDate}
                    onSelect={date => {
                      if (!date) return;
                      setScheduledDate(date);
                      setCalendarMonth(date);
                      setCalendarOpen(false);
                    }}
                    disabled={{ before: startOfDay(new Date()) }}
                    fromDate={startOfDay(new Date())}
                    toDate={new Date(new Date().getFullYear() + 5, 11, 31)}
                    showOutsideDays={false}
                    className="mx-auto p-0"
                    classNames={{ caption: 'hidden', month: 'space-y-2' }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          <div className="space-y-2">
            <Label>
              <Clock3 className="w-4 h-4 inline-block mr-1 align-text-bottom" />
              Horário da publicação
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="schedule-files-hour" className="text-xs text-muted-foreground">
                  Hora
                </label>
                <select
                  id="schedule-files-hour"
                  aria-label="Hora da publicação"
                  value={hour}
                  onChange={event => setHour(event.target.value)}
                  disabled={busy}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {hours.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="schedule-files-minute" className="text-xs text-muted-foreground">
                  Minuto
                </label>
                <select
                  id="schedule-files-minute"
                  aria-label="Minuto da publicação"
                  value={minute}
                  onChange={event => setMinute(event.target.value)}
                  disabled={busy}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {minutes.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Publicação em {format(scheduledDate, 'dd/MM/yyyy', { locale: ptBR })} às {hour}:{minute}
              {' '}— horário do seu dispositivo.
            </p>
          </div>
            <div className="space-y-2 min-w-0">
              <p className="text-[11px] leading-tight text-muted-foreground">
                O arquivo ficará reservado até a publicação; as permissões serão preservadas.
              </p>
              <Button
                type="button"
                className="w-full"
                disabled={busy || uploading}
                onClick={() => void schedule()}
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CalendarClock className="w-4 h-4 mr-2" />
                )}
                Confirmar Agendamento
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ScheduledItem {
  id: string;
  display_name: string;
  scheduled_at: string;
  status: string;
}

export function ScheduledFilesPanel({ refreshKey }: { refreshKey: number }) {
  const { session } = useAuth();
  const [items, setItems] = useState<ScheduledItem[]>([]);
  const [busy, setBusy] = useState(false);
  const token = (session as any)?.access_token;

  const load = async () => {
    if (!token) return;
    try {
      const response = await fetch('/api/scheduled-files', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) return;
      const result = await response.json();
      setItems(result.data || []);
    } catch (error) {
      console.error('Falha ao consultar agendamentos:', error);
    }
  };

  useEffect(() => {
    void load();
  }, [token, refreshKey]);

  const cancel = async (id: string) => {
    if (!window.confirm('Cancelar o envio agendado?')) return;
    setBusy(true);
    try {
      const response = await fetch(
        '/api/scheduled-files/' + encodeURIComponent(id),
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error?.message || 'Falha ao cancelar');
      }
      toast.success('Agendamento cancelado');
      await load();
    } catch (error: any) {
      toast.error(error.message || 'Falha ao cancelar');
    } finally {
      setBusy(false);
    }
  };

  const pending = items.filter(
    item => item.status === 'scheduled' || item.status === 'failed'
  );

  if (!pending.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <CalendarClock className="w-5 h-5" />
          Envios Agendados
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {pending.map(item => (
          <div
            key={item.id}
            className="border rounded-lg p-3 flex flex-wrap items-center justify-between gap-3"
          >
            <div>
              <p className="font-medium text-sm">
                {item.display_name}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(item.scheduled_at).toLocaleString('pt-BR')}
              </p>
              {item.status === 'failed' && (
                <p className="text-xs text-destructive">
                  Falha na publicação. Necessária verificação.
                </p>
              )}
            </div>
            {item.status === 'scheduled' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void cancel(item.id)}
              >
                Cancelar
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
