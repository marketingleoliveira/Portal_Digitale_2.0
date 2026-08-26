import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/* ============================================================
 * Módulo Agendor — núcleo CRM (Fase 1)
 * Entidades: Funis -> Etapas -> Negócios -> Atividades
 *            Organizações -> Pessoas
 * Integrações: leads (rastreio de origem), products (itens do negócio),
 *              profiles (responsáveis)
 * ============================================================ */

export type DealStatus = "aberto" | "ganho" | "perdido";

export type ActivityType =
  | "ligacao"
  | "email"
  | "whatsapp"
  | "reuniao"
  | "visita"
  | "tarefa"
  | "nota"
  | "historico";

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  ligacao: "Ligação",
  email: "E-mail",
  whatsapp: "WhatsApp",
  reuniao: "Reunião",
  visita: "Visita",
  tarefa: "Tarefa",
  nota: "Nota",
  historico: "Histórico",
};

export interface CrmPipeline {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  sort_order: number;
}

export interface CrmStage {
  id: string;
  pipeline_id: string;
  name: string;
  sort_order: number;
  color: string;
  probability: number;
  is_won: boolean;
  is_lost: boolean;
}

export interface CrmOrganization {
  id: string;
  name: string;
  legal_name: string | null;
  cnpj: string | null;
  sector: string | null;
  category: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  cep: string | null;
  street: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  region: string | null;
  notes: string | null;
  owner_user_id: string | null;
  lead_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CrmPerson {
  id: string;
  organization_id: string | null;
  name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  linkedin: string | null;
  is_primary: boolean;
  notes: string | null;
  owner_user_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CrmDeal {
  id: string;
  title: string;
  description: string | null;
  value: number;
  status: DealStatus;
  loss_reason: string | null;
  pipeline_id: string;
  stage_id: string;
  organization_id: string | null;
  person_id: string | null;
  lead_id: string | null;
  source: string;
  owner_user_id: string | null;
  expected_close_date: string | null;
  closed_at: string | null;
  sort_order: number;
  last_activity_at?: string | null;
  won_value?: number | null;
  loss_competitor?: string | null;

  created_by: string;
  created_at: string;
  updated_at: string;
  organization?: { id: string; name: string } | null;
  person?: { id: string; name: string; phone: string | null } | null;
}

export interface CrmActivity {
  id: string;
  activity_type: ActivityType;
  title: string;
  description: string | null;
  due_at: string | null;
  completed_at: string | null;
  deal_id: string | null;
  organization_id: string | null;
  person_id: string | null;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/* ---------------------- Realtime ---------------------- */

export function useAgendorRealtime() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("agendor-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_deals" }, () => {
        queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_activities" }, () => {
        queryClient.invalidateQueries({ queryKey: ["crm-activities"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

/* ---------------------- Funis e etapas ---------------------- */

export function usePipelines() {
  return useQuery({
    queryKey: ["crm-pipelines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_pipelines")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as CrmPipeline[];
    },
  });
}

export function useStages(pipelineId?: string | null) {
  return useQuery({
    queryKey: ["crm-stages", pipelineId ?? null],
    enabled: !!pipelineId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_stages")
        .select("*")
        .eq("pipeline_id", pipelineId!)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as CrmStage[];
    },
  });
}

/* ---------------------- Organizações ---------------------- */

export function useOrganizations() {
  return useQuery({
    queryKey: ["crm-organizations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_organizations")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CrmOrganization[];
    },
  });
}

export function useSaveOrganization() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload: Partial<CrmOrganization> & { name: string }) => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      if (payload.id) {
        const { id, ...rest } = payload;
        const { error } = await supabase.from("crm_organizations").update(rest as never).eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("crm_organizations").insert({
        ...payload,
        created_by: user.id,
        owner_user_id: payload.owner_user_id ?? user.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-organizations"] });
      toast.success("Organização salva com sucesso.");
    },
    onError: (err: Error) => toast.error("Erro ao salvar organização: " + err.message),
  });
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_organizations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-organizations"] });
      queryClient.invalidateQueries({ queryKey: ["crm-people"] });
      toast.success("Organização removida.");
    },
    onError: (err: Error) => toast.error("Erro ao remover: " + err.message),
  });
}

/* ---------------------- Pessoas ---------------------- */

export function usePeople(organizationId?: string | null) {
  return useQuery({
    queryKey: ["crm-people", organizationId ?? "all"],
    queryFn: async () => {
      let query = supabase.from("crm_people").select("*").order("name");
      if (organizationId) query = query.eq("organization_id", organizationId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as CrmPerson[];
    },
  });
}

export function useSavePerson() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload: Partial<CrmPerson> & { name: string }) => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      if (payload.id) {
        const { id, ...rest } = payload;
        const { error } = await supabase.from("crm_people").update(rest as never).eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("crm_people").insert({
        ...payload,
        created_by: user.id,
        owner_user_id: payload.owner_user_id ?? user.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-people"] });
      toast.success("Contato salvo com sucesso.");
    },
    onError: (err: Error) => toast.error("Erro ao salvar contato: " + err.message),
  });
}

export function useDeletePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_people").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-people"] });
      toast.success("Contato removido.");
    },
    onError: (err: Error) => toast.error("Erro ao remover: " + err.message),
  });
}

/* ---------------------- Negócios ---------------------- */

export function useDeals(pipelineId?: string | null, ownerId?: string | null) {
  return useQuery({
    queryKey: ["crm-deals", pipelineId ?? "all", ownerId ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("crm_deals")
        .select(
          "*, organization:crm_organizations(id, name), person:crm_people(id, name, phone)"
        )
        .order("created_at", { ascending: false });
      if (pipelineId) query = query.eq("pipeline_id", pipelineId);
      if (ownerId) query = query.eq("owner_user_id", ownerId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as CrmDeal[];
    },
  });
}


export function useSaveDeal() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload: Partial<CrmDeal> & { title: string }) => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      if (payload.id) {
        const { id, organization, person, ...rest } = payload;
        const { error } = await supabase.from("crm_deals").update(rest as never).eq("id", id);
        if (error) throw error;
        return;
      }
      const { organization, person, ...rest } = payload;
      const { error } = await supabase.from("crm_deals").insert({
        ...rest,
        created_by: user.id,
        owner_user_id: rest.owner_user_id ?? user.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
      toast.success("Negócio salvo com sucesso.");
    },
    onError: (err: Error) => toast.error("Erro ao salvar negócio: " + err.message),
  });
}

export function useMoveDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      stage_id,
      status,
    }: {
      id: string;
      stage_id: string;
      status: DealStatus;
    }) => {
      const { error } = await supabase
        .from("crm_deals")
        .update({
          stage_id,
          status,
          closed_at: status === "aberto" ? null : new Date().toISOString(),
        } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
      queryClient.invalidateQueries({ queryKey: ["crm-activities"] });
    },
    onError: (err: Error) => toast.error("Erro ao mover negócio: " + err.message),
  });
}

export function useDeleteDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_deals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
      toast.success("Negócio removido.");
    },
    onError: (err: Error) => toast.error("Erro ao remover: " + err.message),
  });
}

/* ---------------------- Atividades ---------------------- */

export function useActivities(filters?: {
  dealId?: string | null;
  onlyOpen?: boolean;
  ownerId?: string | null;
}) {
  return useQuery({
    queryKey: [
      "crm-activities",
      filters?.dealId ?? "all",
      filters?.onlyOpen ?? false,
      filters?.ownerId ?? "all",
    ],
    queryFn: async () => {
      let query = supabase
        .from("crm_activities")
        .select("*")
        .order("due_at", { ascending: true, nullsFirst: false });
      if (filters?.dealId) query = query.eq("deal_id", filters.dealId);
      if (filters?.onlyOpen) query = query.is("completed_at", null);
      if (filters?.ownerId) query = query.eq("assigned_to", filters.ownerId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as CrmActivity[];
    },
  });
}


export function useSaveActivity() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload: Partial<CrmActivity> & { title: string }) => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      if (payload.id) {
        const { id, ...rest } = payload;
        const { error } = await supabase.from("crm_activities").update(rest as never).eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("crm_activities").insert({
        ...payload,
        created_by: user.id,
        assigned_to: payload.assigned_to ?? user.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-activities"] });
      toast.success("Atividade salva com sucesso.");
    },
    onError: (err: Error) => toast.error("Erro ao salvar atividade: " + err.message),
  });
}

export function useToggleActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase
        .from("crm_activities")
        .update({ completed_at: done ? new Date().toISOString() : null } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-activities"] }),
    onError: (err: Error) => toast.error("Erro ao atualizar atividade: " + err.message),
  });
}

export function useDeleteActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_activities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-activities"] });
      toast.success("Atividade removida.");
    },
    onError: (err: Error) => toast.error("Erro ao remover: " + err.message),
  });
}

export const formatBRL = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value ?? 0);

/* ============================================================
 * Escopo comercial, saúde do funil, fechamento, transferências,
 * configurações e produtos do negócio (Fases 1 a 5)
 * ============================================================ */

export interface CrmSeller {
  id: string;
  full_name: string;
  email: string;
  role: string;
  avatar_url: string | null;
}

/** Vendedores e demais responsáveis comerciais ativos. */
export function useSellers() {
  return useQuery({
    queryKey: ["crm-sellers"],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (rolesError) throw rolesError;

      const commercial = (roles ?? []).filter((r) =>
        ["vendedor", "sdr", "gerente", "diretoria", "dev"].includes(String(r.role))
      );
      if (commercial.length === 0) return [] as CrmSeller[];

      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, is_active")
        .in("id", commercial.map((r) => r.user_id))
        .order("full_name");
      if (error) throw error;

      return (profiles ?? [])
        .filter((p) => p.is_active !== false)
        .map((p) => ({
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          avatar_url: p.avatar_url,
          role: String(commercial.find((r) => r.user_id === p.id)?.role ?? ""),
        })) as CrmSeller[];
    },
  });
}

/* ---------------------- Configurações do módulo ---------------------- */

export interface CrmModuleSettings {
  loss_reasons: string[];
  sources: string[];
  health_rules: { stale_days: number; warning_days: number };
}

const DEFAULT_SETTINGS: CrmModuleSettings = {
  loss_reasons: ["Preço", "Concorrente", "Sem retorno", "Outro"],
  sources: ["Site", "Indicação", "WhatsApp", "Outro"],
  health_rules: { stale_days: 7, warning_days: 3 },
};

export function useCrmSettings() {
  return useQuery({
    queryKey: ["crm-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("crm_settings").select("key, value");
      if (error) throw error;
      const map = new Map((data ?? []).map((row) => [row.key, row.value]));
      return {
        loss_reasons: (map.get("loss_reasons") as string[]) ?? DEFAULT_SETTINGS.loss_reasons,
        sources: (map.get("sources") as string[]) ?? DEFAULT_SETTINGS.sources,
        health_rules:
          (map.get("health_rules") as CrmModuleSettings["health_rules"]) ??
          DEFAULT_SETTINGS.health_rules,
      } as CrmModuleSettings;
    },
  });
}

export function useSaveCrmSetting() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      const { error } = await supabase
        .from("crm_settings")
        .upsert({ key, value, updated_by: user?.id ?? null } as never, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-settings"] });
      toast.success("Configuração salva.");
    },
    onError: (err: Error) => toast.error("Erro ao salvar configuração: " + err.message),
  });
}

/* ---------------------- Saúde do funil ---------------------- */

export type DealHealth = "saudavel" | "atencao" | "critico";

export const DEAL_HEALTH_LABELS: Record<DealHealth, string> = {
  saudavel: "Saudável",
  atencao: "Atenção",
  critico: "Crítico",
};

export const DEAL_HEALTH_CLASSES: Record<DealHealth, string> = {
  saudavel: "bg-emerald-500",
  atencao: "bg-amber-500",
  critico: "bg-destructive",
};

/**
 * Verde: possui próxima tarefa futura e movimentação recente.
 * Amarelo: tarefa pendente/atrasada ou sem movimentação recente.
 * Vermelho: sem próxima tarefa ou parado além do limite configurado.
 */
export function computeDealHealth(
  deal: CrmDeal,
  activities: CrmActivity[],
  rules: CrmModuleSettings["health_rules"] = DEFAULT_SETTINGS.health_rules
): { health: DealHealth; nextTask: CrmActivity | null; daysIdle: number } {
  const now = Date.now();
  const open = activities.filter(
    (a) => a.deal_id === deal.id && !a.completed_at && a.activity_type !== "historico"
  );
  const future = open
    .filter((a) => a.due_at && new Date(a.due_at).getTime() >= now)
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());
  const overdue = open.filter((a) => a.due_at && new Date(a.due_at).getTime() < now);

  const reference = deal.last_activity_at ?? deal.updated_at ?? deal.created_at;
  const daysIdle = Math.floor((now - new Date(reference).getTime()) / 86400000);

  let health: DealHealth = "saudavel";
  if (open.length === 0 || daysIdle >= rules.stale_days) health = "critico";
  else if (overdue.length > 0 || future.length === 0 || daysIdle >= rules.warning_days)
    health = "atencao";

  return { health, nextTask: future[0] ?? overdue[0] ?? null, daysIdle };
}

/* ---------------------- Ganho e perda ---------------------- */

export function useCloseDeal() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      deal: CrmDeal;
      outcome: Extract<DealStatus, "ganho" | "perdido">;
      stageId?: string | null;
      finalValue?: number | null;
      lossReason?: string | null;
      competitor?: string | null;
      note?: string | null;
      closedAt?: string | null;
    }) => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      const closedAt = input.closedAt ?? new Date().toISOString();

      const { error } = await supabase
        .from("crm_deals")
        .update({
          status: input.outcome,
          closed_at: closedAt,
          stage_id: input.stageId ?? input.deal.stage_id,
          value: input.outcome === "ganho" && input.finalValue != null ? input.finalValue : input.deal.value,
          won_value: input.outcome === "ganho" ? input.finalValue ?? input.deal.value : null,
          loss_reason: input.outcome === "perdido" ? input.lossReason ?? null : null,
          loss_competitor: input.outcome === "perdido" ? input.competitor ?? null : null,
        } as never)
        .eq("id", input.deal.id);
      if (error) throw error;

      const description =
        input.outcome === "ganho"
          ? `Negócio ganho por ${formatBRL(input.finalValue ?? Number(input.deal.value ?? 0))}${input.note ? ` — ${input.note}` : ""}`
          : `Negócio perdido — motivo: ${input.lossReason ?? "não informado"}${input.competitor ? ` (concorrente: ${input.competitor})` : ""}${input.note ? ` — ${input.note}` : ""}`;

      await supabase.from("crm_activities").insert({
        activity_type: "historico",
        title: input.outcome === "ganho" ? "Negócio ganho" : "Negócio perdido",
        description,
        deal_id: input.deal.id,
        organization_id: input.deal.organization_id,
        completed_at: closedAt,
        created_by: user.id,
        assigned_to: input.deal.owner_user_id ?? user.id,
      } as never);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
      queryClient.invalidateQueries({ queryKey: ["crm-activities"] });
      toast.success(variables.outcome === "ganho" ? "Negócio marcado como ganho." : "Negócio marcado como perdido.");
    },
    onError: (err: Error) => toast.error("Erro ao fechar negócio: " + err.message),
  });
}

export function useReopenDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("crm_deals")
        .update({ status: "aberto", closed_at: null, won_value: null } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
      toast.success("Negócio reaberto.");
    },
    onError: (err: Error) => toast.error("Erro ao reabrir: " + err.message),
  });
}

/* ---------------------- Transferência de carteira ---------------------- */

export function useTransferDeals() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ dealIds, toUserId }: { dealIds: string[]; toUserId: string }) => {
      if (dealIds.length === 0) throw new Error("Selecione ao menos um negócio");
      const { error } = await supabase
        .from("crm_deals")
        .update({ owner_user_id: toUserId } as never)
        .in("id", dealIds);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
      queryClient.invalidateQueries({ queryKey: ["crm-activities"] });
      queryClient.invalidateQueries({ queryKey: ["crm-transfers"] });
      toast.success(`${vars.dealIds.length} negócio(s) transferido(s).`);
    },
    onError: (err: Error) => toast.error("Erro ao transferir: " + err.message),
  });
}

export interface CrmTransfer {
  id: string;
  entity_type: string;
  entity_id: string;
  from_user_id: string | null;
  to_user_id: string | null;
  transferred_by: string;
  reason: string | null;
  created_at: string;
}

export function useTransfers(limit = 50) {
  return useQuery({
    queryKey: ["crm-transfers", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_ownership_transfers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as CrmTransfer[];
    },
  });
}

/* ---------------------- Produtos do negócio ---------------------- */

export interface CrmDealProduct {
  id: string;
  deal_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount: number;
}

export function useDealProducts(dealId?: string | null) {
  return useQuery({
    queryKey: ["crm-deal-products", dealId ?? null],
    enabled: !!dealId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_deal_products")
        .select("*")
        .eq("deal_id", dealId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as CrmDealProduct[];
    },
  });
}

export function useSaveDealProduct() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (payload: Partial<CrmDealProduct> & { deal_id: string; product_name: string }) => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      const { error } = await supabase.from("crm_deal_products").insert({
        deal_id: payload.deal_id,
        product_id: payload.product_id ?? null,
        product_name: payload.product_name,
        quantity: payload.quantity ?? 1,
        unit_price: payload.unit_price ?? 0,
        discount: payload.discount ?? 0,
        created_by: user.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-deal-products"] });
      toast.success("Produto adicionado ao negócio.");
    },
    onError: (err: Error) => toast.error("Erro ao adicionar produto: " + err.message),
  });
}

export function useDeleteDealProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_deal_products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-deal-products"] });
      toast.success("Produto removido.");
    },
    onError: (err: Error) => toast.error("Erro ao remover produto: " + err.message),
  });
}

/* ---------------------- Funis e etapas (administração) ---------------------- */

export function useSavePipeline() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (payload: Partial<CrmPipeline> & { name: string }) => {
      if (payload.id) {
        const { id, ...rest } = payload;
        const { error } = await supabase.from("crm_pipelines").update(rest as never).eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("crm_pipelines")
        .insert({ ...payload, created_by: user?.id ?? null } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-pipelines"] });
      toast.success("Funil salvo.");
    },
    onError: (err: Error) => toast.error("Erro ao salvar funil: " + err.message),
  });
}

export function useSaveStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<CrmStage> & { name: string; pipeline_id: string }) => {
      if (payload.id) {
        const { id, ...rest } = payload;
        const { error } = await supabase.from("crm_stages").update(rest as never).eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("crm_stages").insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-stages"] });
      toast.success("Etapa salva.");
    },
    onError: (err: Error) => toast.error("Erro ao salvar etapa: " + err.message),
  });
}

export function useDeleteStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_stages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-stages"] });
      toast.success("Etapa removida.");
    },
    onError: (err: Error) => toast.error("Erro ao remover etapa: " + err.message),
  });
}

export function useDeletePipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_pipelines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-pipelines"] });
      toast.success("Funil removido.");
    },
    onError: (err: Error) => toast.error("Erro ao remover funil: " + err.message),
  });
}
