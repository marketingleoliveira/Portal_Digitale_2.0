import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/local/client";
import { AppRole, ROLE_LABELS } from "@/types/auth";

export const SANTA_SETTING_KEY = "seasonal_santa";
export const SANTA_CUTOFF = Date.parse("2026-12-26T00:00:00-03:00");

export interface SeasonalSantaSettings {
  enabled: boolean;
  roles: AppRole[];
  autoDisableOnDec26: boolean;
}

// Sem registro gravado, continua como antes: ativo só para Desenvolvedor
// até 26/12/2026 às 00:00 (Brasília).
export const DEFAULT_SANTA_SETTINGS: SeasonalSantaSettings = {
  enabled: true,
  roles: ["dev"],
  autoDisableOnDec26: true,
};

const ALL_ROLES = new Set<AppRole>(Object.keys(ROLE_LABELS) as AppRole[]);

export function normalizeSantaSettings(raw: unknown): SeasonalSantaSettings {
  let value = raw;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return { ...DEFAULT_SANTA_SETTINGS }; }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_SANTA_SETTINGS };
  }
  const data = value as Partial<SeasonalSantaSettings>;
  const roles = Array.isArray(data.roles)
    ? Array.from(new Set(data.roles.filter((r): r is AppRole => ALL_ROLES.has(r as AppRole))))
    : [...DEFAULT_SANTA_SETTINGS.roles];
  return {
    enabled: typeof data.enabled === "boolean" ? data.enabled : DEFAULT_SANTA_SETTINGS.enabled,
    roles,
    autoDisableOnDec26: typeof data.autoDisableOnDec26 === "boolean"
      ? data.autoDisableOnDec26 : DEFAULT_SANTA_SETTINGS.autoDisableOnDec26,
  };
}

export function santaVisibleForRole(
  settings: SeasonalSantaSettings,
  role: AppRole | null | undefined,
  now = Date.now(),
): boolean {
  return !!role && settings.enabled && settings.roles.includes(role) &&
    !(settings.autoDisableOnDec26 && now >= SANTA_CUTOFF);
}

export function useSeasonalSantaSettings() {
  const [settings, setSettings] = useState<SeasonalSantaSettings>(DEFAULT_SANTA_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("erp_settings")
        .select("value").eq("key", SANTA_SETTING_KEY).maybeSingle();
      if (error) throw error;
      setSettings(normalizeSantaSettings(data?.value ?? null));
      setReadError(false);
    } catch (error) {
      // Se a leitura falhar, não reexibir o Papai Noel para cargos que
      // podem ter sido desativados por um desenvolvedor.
      console.error("Erro ao carregar configuração do Papai Noel:", error);
      setReadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const channel = supabase.channel("erp-seasonal-santa")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "erp_settings",
        filter: "key.eq." + SANTA_SETTING_KEY,
      }, () => { void refresh(); }).subscribe();
    const checkVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", checkVisible);
    // Rede ou WebSocket temporariamente indisponível: sincronizar sem reload.
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", checkVisible);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const saveSettings = useCallback(async (next: SeasonalSantaSettings) => {
    const safe = normalizeSantaSettings(next);
    const { error } = await supabase.from("erp_settings").upsert(
      { key: SANTA_SETTING_KEY, value: safe as unknown as never },
      { onConflict: "key" },
    );
    if (error) {
      console.error("Erro ao salvar configuração do Papai Noel:", error);
      return false;
    }
    setSettings(safe);
    setReadError(false);
    return true;
  }, []);

  return { settings, loading, readError, refresh, saveSettings };
}
