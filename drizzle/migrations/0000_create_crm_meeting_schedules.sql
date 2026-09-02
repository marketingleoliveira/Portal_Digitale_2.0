CREATE TABLE public.crm_meeting_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_date timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  title text NOT NULL,
  company_name text NOT NULL,
  contact_name text,
  contact_phone text,
  contact_email text,
  notes text,
  status text NOT NULL DEFAULT 'agendado',
  assigned_to uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_meeting_schedules TO authenticated;
GRANT ALL ON public.crm_meeting_schedules TO service_role;

ALTER TABLE public.crm_meeting_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_meetings_select" ON public.crm_meeting_schedules
FOR SELECT TO authenticated
USING (public.has_full_access(auth.uid()) OR assigned_to = auth.uid() OR created_by = auth.uid() OR public.has_role(auth.uid(), 'sdr'));

CREATE POLICY "crm_meetings_insert" ON public.crm_meeting_schedules
FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "crm_meetings_update" ON public.crm_meeting_schedules
FOR UPDATE TO authenticated
USING (public.has_full_access(auth.uid()) OR created_by = auth.uid() OR assigned_to = auth.uid() OR public.has_role(auth.uid(), 'sdr'));

CREATE POLICY "crm_meetings_delete" ON public.crm_meeting_schedules
FOR DELETE TO authenticated
USING (public.has_full_access(auth.uid()) OR created_by = auth.uid() OR public.has_role(auth.uid(), 'sdr'));

CREATE INDEX idx_crm_meeting_schedules_date ON public.crm_meeting_schedules (scheduled_date);
CREATE INDEX idx_crm_meeting_schedules_assigned ON public.crm_meeting_schedules (assigned_to);

CREATE TRIGGER trg_crm_meeting_schedules_updated_at
BEFORE UPDATE ON public.crm_meeting_schedules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();