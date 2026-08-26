import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppRole } from "@/types/auth";

export const MENU_VISIBILITY_KEY = "menu_visibility";

/** Map of nav item href -> roles for which the menu must be hidden. */
export type MenuVisibility = Record<string, AppRole[]>;

interface UseErpSettingsResult {
  hiddenMenus: MenuVisibility;
  loading: boolean;
  isMenuHidden: (href: string, role: AppRole | null | undefined) => boolean;
  saveHiddenMenus: (next: MenuVisibility) => Promise<boolean>;
  refresh: () => Promise<void>;
}

/**
 * Reads/writes the global ERP settings stored in `erp_settings`.
 * Every authenticated user can read; only the `dev` role can write (enforced by RLS).
 */
export const useErpSettings = (): UseErpSettingsResult => {
  const [hiddenMenus, setHiddenMenus] = useState<MenuVisibility>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("erp_settings")
        .select("value")
        .eq("key", MENU_VISIBILITY_KEY)
        .maybeSingle();

      if (error) throw error;

      const value = (data?.value ?? {}) as Record<string, unknown>;
      const normalized: MenuVisibility = {};
      Object.entries(value).forEach(([href, roles]) => {
        if (Array.isArray(roles)) normalized[href] = roles as AppRole[];
      });
      setHiddenMenus(normalized);
    } catch (err) {
      console.error("Erro ao carregar configurações do ERP:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    const channel = supabase
      .channel("erp-settings-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "erp_settings" },
        () => {
          refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  const isMenuHidden = useCallback(
    (href: string, role: AppRole | null | undefined) => {
      if (!role || role === "dev") return false;
      return (hiddenMenus[href] || []).includes(role);
    },
    [hiddenMenus],
  );

  const saveHiddenMenus = useCallback(async (next: MenuVisibility) => {
    // Drop empty entries to keep the payload clean.
    const cleaned: MenuVisibility = {};
    Object.entries(next).forEach(([href, roles]) => {
      if (roles && roles.length > 0) cleaned[href] = roles;
    });

    const { error } = await supabase
      .from("erp_settings")
      .upsert(
        { key: MENU_VISIBILITY_KEY, value: cleaned as unknown as never },
        { onConflict: "key" },
      );

    if (error) {
      console.error("Erro ao salvar visibilidade de menus:", error);
      return false;
    }

    setHiddenMenus(cleaned);
    return true;
  }, []);

  return { hiddenMenus, loading, isMenuHidden, saveHiddenMenus, refresh };
};
