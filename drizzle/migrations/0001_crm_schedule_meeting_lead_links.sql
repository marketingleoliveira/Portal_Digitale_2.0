ALTER TABLE public.crm_meeting_schedules
  ADD COLUMN IF NOT EXISTS meeting_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_meeting_schedules_meeting_id ON public.crm_meeting_schedules(meeting_id);
CREATE INDEX IF NOT EXISTS idx_crm_meeting_schedules_lead_id ON public.crm_meeting_schedules(lead_id);

-- Allow CRM schedulers (SDR / full access) to create meetings hosted by another user (the assigned seller)
DROP POLICY IF EXISTS "CRM schedulers can create meetings for sellers" ON public.meetings;
CREATE POLICY "CRM schedulers can create meetings for sellers"
ON public.meetings
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_full_access(auth.uid())
  OR public.has_role(auth.uid(), 'sdr'::app_role)
);

-- Sellers must be able to see meetings scheduled for them even before they start
DROP POLICY IF EXISTS "Users can view meetings assigned to them" ON public.meetings;
CREATE POLICY "Users can view meetings assigned to them"
ON public.meetings
FOR SELECT
TO authenticated
USING (
  host_user_id = auth.uid()
  OR public.has_full_access(auth.uid())
  OR public.has_role(auth.uid(), 'sdr'::app_role)
);

-- SDR / full access users need to notify the seller assigned to a schedule
DROP POLICY IF EXISTS "CRM schedulers can notify sellers" ON public.user_notifications;
CREATE POLICY "CRM schedulers can notify sellers"
ON public.user_notifications
FOR INSERT
TO authenticated
WITH CHECK (
  (public.has_full_access(auth.uid()) OR public.has_role(auth.uid(), 'sdr'::app_role))
  AND auth.uid() = created_by
);
