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

export function useActivities(filters?: { dealId?: string | null; onlyOpen?: boolean }) {
  return useQuery({
    queryKey: ["crm-activities", filters?.dealId ?? "all", filters?.onlyOpen ?? false],
    queryFn: async () => {
      let query = supabase
        .from("crm_activities")
        .select("*")
        .order("due_at", { ascending: true, nullsFirst: false });
      if (filters?.dealId) query = query.eq("deal_id", filters.dealId);
      if (filters?.onlyOpen) query = query.is("completed_at", null);
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
