CREATE TABLE public.crm_external_lead_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL,
  external_lead_id text NOT NULL,
  qualification_status text NOT NULL,
  qualification_score integer,
  organization_id uuid REFERENCES public.crm_organizations(id) ON DELETE SET NULL,
  person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.crm_deals(id) ON DELETE SET NULL,
  owner_user_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_external_lead_imports_source_external_unique UNIQUE (source_system, external_lead_id),
  CONSTRAINT crm_external_lead_imports_score_range CHECK (qualification_score IS NULL OR qualification_score BETWEEN 0 AND 100)
);

GRANT SELECT ON public.crm_external_lead_imports TO authenticated;
GRANT ALL ON public.crm_external_lead_imports TO service_role;

ALTER TABLE public.crm_external_lead_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_external_lead_imports_select"
ON public.crm_external_lead_imports
FOR SELECT
TO authenticated
USING (public.has_full_access(auth.uid()) OR owner_user_id = auth.uid());

CREATE INDEX crm_external_lead_imports_owner_idx
ON public.crm_external_lead_imports(owner_user_id, imported_at DESC);

CREATE INDEX crm_external_lead_imports_deal_idx
ON public.crm_external_lead_imports(deal_id);

CREATE TRIGGER trg_crm_external_lead_imports_updated_at
BEFORE UPDATE ON public.crm_external_lead_imports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();