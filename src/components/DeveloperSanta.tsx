import { useEffect, useState } from "react";
import type { AppRole } from "@/types/auth";
import { useSeasonalSantaSettings, SANTA_CUTOFF, santaVisibleForRole } from "@/hooks/useSeasonalSantaSettings";
import "./developer-santa.css";

interface DeveloperSantaProps {
  role: AppRole;
}

// A configuração define os cargos e a ativação.
// O prazo de 26/12 pode ser desligado manualmente no ERP.
export default function DeveloperSanta({ role }: DeveloperSantaProps) {
  const { settings, loading, readError } = useSeasonalSantaSettings();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const MAX_WAIT = 24 * 60 * 60 * 1000;
    const checkExpiration = () => {
      if (timer !== undefined) clearTimeout(timer);
      const timestamp = Date.now();
      setNow(timestamp);
      if (settings.autoDisableOnDec26) {
        const remaining = SANTA_CUTOFF - timestamp;
        if (remaining > 0) {
          // setTimeout acima de ~24 dias pode transbordar; reagendar diariamente.
          timer = setTimeout(checkExpiration, Math.min(remaining, MAX_WAIT));
        }
      }
    };
    checkExpiration();
    const onVisible = () => {
      if (document.visibilityState === "visible") checkExpiration();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [settings.autoDisableOnDec26]);

  if (loading || readError || !santaVisibleForRole(settings, role, now)) return null;

  return (
    <span className="dev-role-santa" aria-hidden="true">
      <img
        className="dev-role-santa-image"
        src="/santa/santa-body.webp"
        width="78"
        height="89"
        decoding="async"
        alt=""
        draggable={false}
      />
      <img
        className="dev-role-santa-hand dev-role-santa-wave"
        src="/santa/santa-hand.webp"
        width="78"
        height="89"
        decoding="async"
        alt=""
        draggable={false}
      />
    </span>
  );
}
