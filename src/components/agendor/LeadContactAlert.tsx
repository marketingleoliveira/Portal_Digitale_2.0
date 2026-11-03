import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useActivities, type CrmDeal } from "@/hooks/useAgendor";

const CONTACT_TYPES = new Set([
  "ligacao", "email", "whatsapp", "reuniao", "visita",
]);

export function LeadContactAlert({ deal }: { deal: CrmDeal }) {
  const { data: activities, isLoading, isError } =
    useActivities({ dealId: deal.id });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  if (deal.status !== "aberto") return null;
  if (isLoading) return null;
  if (isError || !activities) {
    return (
      <p className="text-xs text-muted-foreground">
        Não foi possível conferir o último contato.
      </p>
    );
  }

  const contacts = activities
    .filter((activity) =>
      activity.deal_id === deal.id
      && CONTACT_TYPES.has(activity.activity_type)
      && !!activity.completed_at
    )
    .map((activity) => Date.parse(activity.completed_at!))
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp <= now);

  const reference = contacts.length
    ? Math.max(...contacts)
    : Date.parse(deal.created_at);

  if (!Number.isFinite(reference) || now - reference <= 86400000)
    return null;

  const hours = Math.floor((now - reference) / 3600000);

  return (
    <div
      role="status"
      className="flex items-start gap-1.5 rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
      title={contacts.length
        ? `Último contato concluído: ${new Date(reference).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
        : "Nenhum contato concluído desde a criação do lead."}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        Mais de 24h sem contato — {hours}h
        {!contacts.length && (
          <span className="block font-normal">Primeiro contato pendente.</span>
        )}
      </span>
    </div>
  );
}
