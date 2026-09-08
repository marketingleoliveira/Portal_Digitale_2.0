ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS attendance_status text DEFAULT 'agendado';

ALTER TABLE public.leads
  ADD CONSTRAINT leads_attendance_status_check
  CHECK (attendance_status IS NULL OR attendance_status IN ('agendado','em_contato','negociando','finalizado','cancelado'));

UPDATE public.leads SET attendance_status = 'agendado'
WHERE attendance_status IS NULL AND scope = 'atendimento';

CREATE INDEX IF NOT EXISTS idx_leads_attendance_status ON public.leads (attendance_status);