CREATE TABLE public.erp_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.erp_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.erp_settings TO authenticated;
GRANT ALL ON public.erp_settings TO service_role;

ALTER TABLE public.erp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read settings"
ON public.erp_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only devs can insert settings"
ON public.erp_settings FOR INSERT TO authenticated
WITH CHECK (public.get_user_role(auth.uid())::text = 'dev');

CREATE POLICY "Only devs can update settings"
ON public.erp_settings FOR UPDATE TO authenticated
USING (public.get_user_role(auth.uid())::text = 'dev')
WITH CHECK (public.get_user_role(auth.uid())::text = 'dev');

CREATE POLICY "Only devs can delete settings"
ON public.erp_settings FOR DELETE TO authenticated
USING (public.get_user_role(auth.uid())::text = 'dev');

CREATE TRIGGER trg_erp_settings_updated_at
BEFORE UPDATE ON public.erp_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();