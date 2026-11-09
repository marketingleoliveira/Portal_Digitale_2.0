import { useEffect, useState } from 'react';
import { CalendarClock, Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

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
  const [scheduledAt, setScheduledAt] = useState('');
  const [busy, setBusy] = useState(false);

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

    const date = new Date(scheduledAt);
    if (!scheduledAt || !Number.isFinite(date.getTime()) ||
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
      setScheduledAt('');
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
        <div className="border rounded-lg p-3 space-y-3 bg-background">
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
          <div className="space-y-2">
            <Label htmlFor="schedule-files-date">
              Data e horário
            </Label>
            <Input
              id="schedule-files-date"
              type="datetime-local"
              value={scheduledAt}
              onChange={event => setScheduledAt(event.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            O arquivo ficará reservado até a data escolhida.
            As permissões definidas acima serão preservadas.
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
