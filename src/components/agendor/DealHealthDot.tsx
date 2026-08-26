import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DEAL_HEALTH_CLASSES, DEAL_HEALTH_LABELS, type DealHealth } from "@/hooks/useAgendor";

interface DealHealthDotProps {
  health: DealHealth;
  daysIdle?: number;
  className?: string;
}

/** Semáforo de saúde do negócio (verde/amarelo/vermelho). */
export function DealHealthDot({ health, daysIdle, className }: DealHealthDotProps) {
  const detail =
    health === "saudavel"
      ? "Possui próxima tarefa agendada"
      : health === "atencao"
        ? "Tarefa atrasada ou sem próximo passo definido"
        : "Sem próxima tarefa ou negócio parado";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label={`Saúde: ${DEAL_HEALTH_LABELS[health]}`}
            className={cn(
              "inline-block w-2.5 h-2.5 rounded-full shrink-0",
              DEAL_HEALTH_CLASSES[health],
              className
            )}
          />
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs font-medium">{DEAL_HEALTH_LABELS[health]}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
          {typeof daysIdle === "number" && (
            <p className="text-xs text-muted-foreground">
              {daysIdle <= 0 ? "Movimentado hoje" : `${daysIdle} dia(s) sem movimentação`}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
