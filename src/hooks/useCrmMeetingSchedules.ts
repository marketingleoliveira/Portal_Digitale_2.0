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
  meeting_id?: string | null;
  lead_id?: string | null;
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

/** Generates a Google-Meet style code (xxx-xxxx-xxx) for the auto-created meeting room. */
function generateMeetingCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const block = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${block(3)}-${block(4)}-${block(3)}`;
}


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

/**
 * Leads originados exclusivamente de agendamentos do calendário do CRM.
 * Retorna o mapa lead_id -> vendedor designado, permitindo isolamento por vendedor.
 */
export function useCrmScheduledLeadOwners() {
  return useQuery({
    queryKey: ["crm-scheduled-lead-owners"],
    queryFn: async (): Promise<Record<string, string | null>> => {
      const { data, error } = await supabase
        .from("crm_meeting_schedules")
        .select("lead_id, assigned_to")
        .not("lead_id", "is", null);
      if (error) throw error;

      const map: Record<string, string | null> = {};
      for (const row of (data ?? []) as { lead_id: string | null; assigned_to: string | null }[]) {
        if (row.lead_id) map[row.lead_id] = row.assigned_to;
      }
      return map;
    },
  });
}

export function useCreateCrmMeeting() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: CrmMeetingInput) => {
      if (!user) throw new Error("Sessão expirada. Faça login novamente.");

      const title = input.title.trim();
      const company = input.company_name.trim();
      const sellerId = input.assigned_to || null;
      const hostId = sellerId || user.id;

      // 1. Create the online meeting room in the "Reunião" module, hosted by the seller.
      let meetingId: string | null = null;
      try {
        const { data: meeting, error: meetingError } = await supabase
          .from("meetings")
          .insert({
            title,
            meeting_code: generateMeetingCode(),
            host_user_id: hostId,
            scheduled_start: input.scheduled_date,
            scheduled_end: new Date(
              new Date(input.scheduled_date).getTime() + (input.duration_minutes ?? 60) * 60000,
            ).toISOString(),
          })
          .select("id")
          .single();
        if (meetingError) throw meetingError;
        meetingId = meeting?.id ?? null;
      } catch (err) {
        console.error("Falha ao criar sala de reunião do agendamento CRM", err);
      }

      // 2. Create the lead in the Atendimento pipeline, assigned to the seller only.
      let leadId: string | null = null;
      try {
        const { data: lead, error: leadError } = await supabase
          .from("leads")
          .insert({
            company_name: company,
            contact_name: input.contact_name?.trim() || company,
            contact_email: input.contact_email?.trim() || null,
            contact_phone: input.contact_phone?.trim() || null,
            source: "outro",
            status: "proposta",
            scope: "atendimento",
            notes: input.notes?.trim() || null,
            assigned_to: sellerId,
            created_by: user.id,
          })
          .select("id")
          .single();
        if (leadError) throw leadError;
        leadId = lead?.id ?? null;
      } catch (err) {
        console.error("Falha ao criar lead do agendamento CRM", err);
      }

      // 3. Persist the schedule with the links to the meeting and the lead.
      const { error } = await supabase.from("crm_meeting_schedules").insert({
        scheduled_date: input.scheduled_date,
        duration_minutes: input.duration_minutes ?? 60,
        title,
        company_name: company,
        contact_name: input.contact_name?.trim() || null,
        contact_phone: input.contact_phone?.trim() || null,
        contact_email: input.contact_email?.trim() || null,
        notes: input.notes?.trim() || null,
        assigned_to: sellerId,
        created_by: user.id,
        meeting_id: meetingId,
        lead_id: leadId,
      });
      if (error) throw error;

      // 4. Notify the assigned seller.
      if (sellerId && sellerId !== user.id) {
        try {
          const when = new Date(input.scheduled_date).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          await supabase.from("user_notifications").insert({
            title: `Nova reunião agendada: ${title}`,
            message: `Você foi designado para a reunião com ${company} em ${when}. O lead já está disponível no menu Atendimento.`,
            target_user_id: sellerId,
            created_by: user.id,
          });
        } catch (err) {
          console.error("Falha ao notificar vendedor do agendamento CRM", err);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["crm-scheduled-lead-owners"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Agendamento criado! Reunião e lead gerados para o vendedor.");
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
