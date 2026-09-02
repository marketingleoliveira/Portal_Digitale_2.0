import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type CrmMeetingStatus = "agendado" | "realizado" | "cancelado";

export interface CrmMeetingSchedule {
  id: string;
  scheduled_date: string;
  duration_minutes: number;
  title: string;
  company_name: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  status: CrmMeetingStatus;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  assigned_profile?: { id: string; full_name: string; avatar_url: string | null } | null;
}

export interface CrmMeetingInput {
  scheduled_date: string;
  duration_minutes?: number;
  title: string;
  company_name: string;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  notes?: string | null;
  assigned_to?: string | null;
}

const QUERY_KEY = ["crm-meeting-schedules"] as const;

export function useCrmMeetingSchedules() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<CrmMeetingSchedule[]> => {
      const { data, error } = await supabase
        .from("crm_meeting_schedules")
        .select("*")
        .order("scheduled_date", { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as unknown as CrmMeetingSchedule[];
      const ownerIds = Array.from(
        new Set(rows.map((r) => r.assigned_to).filter((id): id is string => !!id)),
      );
      if (ownerIds.length === 0) return rows;

      // Manual mapping: no explicit FK between this table and profiles.
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", ownerIds);

      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({
        ...r,
        assigned_profile: r.assigned_to ? byId.get(r.assigned_to) ?? null : null,
      }));
    },
  });
}

export function useCreateCrmMeeting() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: CrmMeetingInput) => {
      if (!user) throw new Error("Sessão expirada. Faça login novamente.");
      const { error } = await supabase.from("crm_meeting_schedules").insert({
        scheduled_date: input.scheduled_date,
        duration_minutes: input.duration_minutes ?? 60,
        title: input.title.trim(),
        company_name: input.company_name.trim(),
        contact_name: input.contact_name?.trim() || null,
        contact_phone: input.contact_phone?.trim() || null,
        contact_email: input.contact_email?.trim() || null,
        notes: input.notes?.trim() || null,
        assigned_to: input.assigned_to || null,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Agendamento criado com sucesso!");
    },
    onError: (err: Error) => toast.error("Erro ao agendar: " + err.message),
  });
}

export function useUpdateCrmMeeting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CrmMeetingSchedule> & { id: string }) => {
      const { error } = await supabase
        .from("crm_meeting_schedules")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Agendamento atualizado!");
    },
    onError: (err: Error) => toast.error("Erro ao atualizar: " + err.message),
  });
}

export function useDeleteCrmMeeting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_meeting_schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Agendamento excluído!");
    },
    onError: (err: Error) => toast.error("Erro ao excluir: " + err.message),
  });
}
