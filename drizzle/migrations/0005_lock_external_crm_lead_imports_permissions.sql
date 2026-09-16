REVOKE ALL ON TABLE public.crm_external_lead_imports FROM PUBLIC;
REVOKE ALL ON TABLE public.crm_external_lead_imports FROM anon;
GRANT SELECT ON TABLE public.crm_external_lead_imports TO authenticated;
GRANT ALL ON TABLE public.crm_external_lead_imports TO service_role;