import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { CalendarClock, AlertCircle, CheckCircle2 } from "lucide-react";

type ReturnItem = {
  scheduled_at: string;
  completed_at: string | null;
};

function parseUtc(value: string) {
  const date = value.replace(" ", "T");
  return new Date(
    /(?:Z|[+-]\d{2}:\d{2})$/.test(date) ? date : `${date}Z`
  );
}

function brasiliaDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function ReturnsDashboardWidget() {
  const { session } = useAuth();
  const [returns, setReturns] = useState<ReturnItem[]>([]);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const token =
    (session as any)?.access_token ||
    (session as any)?.accessToken;

  useEffect(() => {
    if (!token) {
      setReturns([]);
      setLoaded(false);
      return;
    }

    let active = true;

    const load = async () => {
      try {
        const response = await fetch("/api/agendor-returns", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) throw new Error("Falha ao carregar");

        const data = await response.json();
        if (!data.ok) throw new Error("Resposta inválida");

        if (active) {
          setReturns(data.returns || []);
          setError(false);
          setLoaded(true);
        }
      } catch {
        if (active) {
          setError(true);
          setLoaded(true);
        }
      }
    };

    void load();

    const interval = window.setInterval(() => {
      void load();
    }, 30000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [token]);

  const now = new Date();
  const today = brasiliaDay(now);

  const pending = returns.filter(r => !r.completed_at);
  const overdue = pending.filter(
    r => parseUtc(r.scheduled_at).getTime() < now.getTime()
  );

  const todayReturns = pending.filter(
    r => brasiliaDay(parseUtc(r.scheduled_at)) === today
  );

  const cards = [
    {
      label: "Retornos pendentes",
      value: pending.length,
      icon: CalendarClock,
    },
    {
      label: "Retornos atrasados",
      value: overdue.length,
      icon: AlertCircle,
    },
    {
      label: "Retornos de hoje",
      value: todayReturns.length,
      icon: CheckCircle2,
    },
  ];

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Meus retornos</h2>
        <p className="text-xs text-muted-foreground">
          Acompanhamento do Agendor · Horário de Brasília
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          Não foi possível carregar os retornos.
        </p>
      )}

      {!loaded && (
        <p className="text-sm text-muted-foreground">
          Carregando...
        </p>
      )}

      {loaded && !error && (
        <div className="grid gap-3 sm:grid-cols-3">
          {cards.map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-xl border bg-card p-4"
            >
              <div className="rounded-lg bg-muted p-2">
                <Icon className="h-5 w-5" />
              </div>

              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {value}
                </p>
                <p className="text-xs text-muted-foreground">
                  {label}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
