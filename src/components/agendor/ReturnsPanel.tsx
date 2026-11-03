import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type DealReturn = {
  id: string;
  deal_id: string;
  deal_title: string;
  assigned_user_id: string;
  responsible_name: string | null;
  scheduled_at: string;
  description: string | null;
  completed_at: string | null;
};

type Filter = "todos" | "pendentes" | "concluidos";

function dateFromApi(value: string): Date {
  const normalized = value.includes("T")
    ? value
    : value.replace(" ", "T");

  return new Date(
    /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized)
      ? normalized
      : normalized + "Z"
  );
}

function brDate(value: string): string {
  const date = dateFromApi(value);
  return Number.isNaN(date.getTime())
    ? "Data inválida"
    : new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function dayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function ReturnsPanel({
  dealId,
  compact = false,
}: {
  dealId?: string;
  compact?: boolean;
}) {
  const { session } = useAuth();
  const [items, setItems] = useState<DealReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dateTime, setDateTime] = useState("");
  const [description, setDescription] = useState("");
  const [filter, setFilter] = useState<Filter>("pendentes");
  const [selectedDay, setSelectedDay] = useState<Date | undefined>();
  const [month, setMonth] = useState(new Date());
  const [showAllDays, setShowAllDays] = useState(true);

  const token =
    (session as any)?.access_token ||
    (session as any)?.accessToken;

  const request = useCallback(
    async (path: string, options: RequestInit = {}) => {
      if (!token) throw new Error("Sessão não disponível");

      const response = await fetch(`/api/agendor-returns${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.ok) {
        throw new Error(result.error || `Erro HTTP ${response.status}`);
      }

      return result;
    },
    [token]
  );

  const refresh = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const query = dealId
        ? `?deal_id=${encodeURIComponent(dealId)}`
        : "";

      const result = await request(query);
      setItems(result.returns || []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao carregar retornos"
      );
    } finally {
      setLoading(false);
    }
  }, [token, dealId, request]);

  useEffect(() => {
    setLoading(true);
    void refresh();

    const timer = window.setInterval(() => {
      void refresh();
    }, 30000);

    return () => window.clearInterval(timer);
  }, [refresh]);

  async function createReturn(event: React.FormEvent) {
    event.preventDefault();

    if (!dealId || !dateTime) return;

    // Agenda no fuso de Brasilia, inclusive se o navegador
    // estiver temporariamente configurado em outro fuso.
    const scheduled = new Date(`${dateTime}:00-03:00`);

    if (
      Number.isNaN(scheduled.getTime()) ||
      scheduled.getTime() <= Date.now()
    ) {
      toast.error("Escolha uma data e hora futuras.");
      return;
    }

    setSaving(true);

    try {
      await request("/", {
        method: "POST",
        body: JSON.stringify({
          deal_id: dealId,
          scheduled_at: scheduled.toISOString(),
          description,
        }),
      });

      setDateTime("");
      setDescription("");
      toast.success("Retorno agendado!");
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao agendar"
      );
    } finally {
      setSaving(false);
    }
  }

  async function completeReturn(id: string) {
    try {
      await request(`/${id}/complete`, {
        method: "POST",
      });
      toast.success("Retorno concluído!");
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao concluir"
      );
    }
  }

  const visible = useMemo(() => {
    return items.filter((item) => {
      if (filter === "pendentes" && item.completed_at) return false;
      if (filter === "concluidos" && !item.completed_at) return false;

      if (!compact && !showAllDays && selectedDay) {
        return dayKey(dateFromApi(item.scheduled_at)) === dayKey(selectedDay);
      }

      return true;
    });
  }, [items, filter, compact, showAllDays, selectedDay]);

  const pending = items.filter((item) => !item.completed_at).length;
  const completed = items.length - pending;
  const overdue = items.filter(
    (item) =>
      !item.completed_at &&
      dateFromApi(item.scheduled_at).getTime() < Date.now()
  ).length;

  const daysWithPending = items
    .filter((item) => !item.completed_at)
    .map((item) => dateFromApi(item.scheduled_at));

  const daysWithCompleted = items
    .filter((item) => !!item.completed_at)
    .map((item) => dateFromApi(item.scheduled_at));

  return (
    <div className="space-y-4">
      {!compact && (
        <>
          <div>
            <h2 className="text-xl font-semibold">Calendário de retornos</h2>
            <p className="text-sm text-muted-foreground">
              Acompanhe os contatos agendados e realizados.
              Horários de Brasília.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Pendentes</p>
              <p className="text-2xl font-semibold">{pending}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Atrasados</p>
              <p className="text-2xl font-semibold">{overdue}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Concluídos</p>
              <p className="text-2xl font-semibold">{completed}</p>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <Calendar
              mode="single"
              selected={selectedDay}
              onSelect={(day) => {
                setSelectedDay(day);
                setShowAllDays(!day);
              }}
              month={month}
              onMonthChange={setMonth}
              modifiers={{
                pending: daysWithPending,
                completed: daysWithCompleted,
              }}
              modifiersClassNames={{
                pending: "font-bold underline decoration-amber-500",
                completed: "font-bold text-emerald-600",
              }}
              className="mx-auto"
            />

            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
              <span>● Pendente: data sublinhada</span>
              <span>● Concluído: data verde</span>
            </div>

            <div className="mt-3 text-center">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowAllDays(true);
                  setSelectedDay(undefined);
                }}
              >
                Mostrar todos os dias
              </Button>
            </div>
          </div>
        </>
      )}

      {dealId && (
        <form
          onSubmit={(event) => void createReturn(event)}
          className="space-y-3 rounded-lg border p-4"
        >
          <div>
            <h3 className="font-semibold">Agendar retorno</h3>
            <p className="text-xs text-muted-foreground">
              O responsável pelo negócio receberá os lembretes.
            </p>
          </div>

          <label className="block space-y-1 text-sm">
            <span>Data e horário (Brasília)</span>
            <Input
              type="datetime-local"
              value={dateTime}
              onChange={(event) => setDateTime(event.target.value)}
              required
            />
          </label>

          <label className="block space-y-1 text-sm">
            <span>Observação</span>
            <textarea
              className="w-full min-h-20 rounded-md border bg-background p-3 text-sm"
              placeholder="Ex.: Retornar sobre o orçamento enviado"
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <Button type="submit" disabled={saving || !dateTime}>
            {saving ? "Salvando..." : "Agendar retorno"}
          </Button>
        </form>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">
            {compact ? "Retornos deste negócio" : "Lista de retornos"}
          </h3>

          <Button
            size="sm"
            variant="outline"
            onClick={() => void refresh()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["pendentes", "concluidos", "todos"] as Filter[]).map(
            (value) => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? "default" : "outline"}
                onClick={() => setFilter(value)}
              >
                {value === "pendentes"
                  ? "Pendentes"
                  : value === "concluidos"
                    ? "Concluídos"
                    : "Todos"}
              </Button>
            )
          )}
        </div>

        {loading && (
          <p className="text-sm text-muted-foreground">
            Carregando retornos...
          </p>
        )}

        {!loading && visible.length === 0 && (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">
            Nenhum retorno encontrado para este filtro.
          </p>
        )}

        {visible.map((item) => {
          const done = Boolean(item.completed_at);
          const delayed =
            !done &&
            dateFromApi(item.scheduled_at).getTime() < Date.now();

          return (
            <div
              key={item.id}
              className="space-y-2 rounded-lg border p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium">
                    {compact ? "Retorno agendado" : item.deal_title}
                  </p>

                  <p className="flex items-center gap-2 text-sm">
                    <Clock3 className="h-4 w-4" />
                    {brDate(item.scheduled_at)}
                  </p>

                  {!compact && (
                    <p className="text-xs text-muted-foreground">
                      Responsável: {item.responsible_name || "Não identificado"}
                    </p>
                  )}

                  {item.description && (
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                </div>

                <span
                  className={
                    done
                      ? "text-xs font-medium text-emerald-600"
                      : delayed
                        ? "text-xs font-medium text-red-600"
                        : "text-xs font-medium text-amber-600"
                  }
                >
                  {done ? "Concluído" : delayed ? "Atrasado" : "Pendente"}
                </span>
              </div>

              {!done && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void completeReturn(item.id)}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Marcar como realizado
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
