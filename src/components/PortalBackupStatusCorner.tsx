import React from "react";
import { useAuth } from "@/contexts/AuthContext";

type BackupStatus = {
  repository?: string;
  lastAttemptAt?: string | null;
  lastRunSuccessful?: boolean;
  lastSuccessAt?: string | null;
  commit?: string | null;
  error?: string | null;
};

const allowed = new Set([
  "marketing@digitaletextil.com.br",
  "marketing2@digitaletextil.com.br",
]);

function formatDate(value?: string | null) {
  if (!value) return "Não confirmado";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Não confirmado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export default function PortalBackupStatusCorner() {
  const { user } = useAuth();
  const email = user?.email?.trim().toLowerCase();
  const authorized = Boolean(email && allowed.has(email));

  const [data, setData] = React.useState<BackupStatus | null>(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    if (!authorized) return;

    let mounted = true;

    const refresh = async () => {
      try {
        const response = await fetch(
          "/backup-status.json?t=" + Date.now(),
          { cache: "no-store" }
        );

        if (!response.ok) throw new Error("HTTP");

        const result = await response.json();

        if (
          result.repository !==
          "marketingleoliveira/Portal_Digitale_2.0"
        ) {
          throw new Error("Repositorio inesperado");
        }

        if (mounted) {
          setData(result);
          setError(false);
        }
      } catch {
        if (mounted) setError(true);
      }
    };

    void refresh();
    const timer = window.setInterval(refresh, 60000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [authorized]);

  if (!authorized) return null;

  const lastSuccess = data?.lastSuccessAt;
  const failed = data?.lastRunSuccessful === false;
  const ok = Boolean(lastSuccess) && !failed;

  return (
    <div
      className="fixed bottom-5 right-5 z-[60] w-[255px] max-w-[calc(100vw-32px)] rounded-xl border border-border bg-background/95 px-3 py-3 shadow-lg backdrop-blur-sm"
      aria-label="Status do backup do Portal"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">
          Backup automático
        </span>
        <span
          className={
            "text-[10px] font-semibold " +
            (ok
              ? "text-emerald-600"
              : "text-amber-600")
          }
        >
          {error
            ? "Indisponível"
            : failed
              ? "Falha na última tentativa"
              : ok
                ? "Confirmado"
                : "Não confirmado"}
        </span>
      </div>

      <div className="mt-2 text-[11px] text-muted-foreground">
        Último envio: {error
          ? "Indisponível"
          : formatDate(lastSuccess)}
      </div>

      {!error && data?.commit && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          Commit: {data.commit.slice(0, 12)}
        </div>
      )}

      {!error && failed && (
        <div className="mt-1 text-[10px] text-amber-600">
          Última tentativa: {formatDate(data.lastAttemptAt)}
        </div>
      )}

      <div className="mt-1 text-[10px] text-muted-foreground">
        Agendamento: diariamente às 18h
      </div>
    </div>
  );
}
