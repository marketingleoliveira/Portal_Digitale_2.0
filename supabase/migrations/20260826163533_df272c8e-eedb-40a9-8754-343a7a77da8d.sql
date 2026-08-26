-- ============ FASE 1: NÚCLEO CRM (AGENDOR) ============

-- 1. FUNIS
CREATE TABLE public.crm_pipelines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_pipelines TO authenticated;
GRANT ALL ON public.crm_pipelines TO service_role;
ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_pipelines_select" ON public.crm_pipelines FOR SELECT TO authenticated USING (true);
CREATE POLICY "crm_pipelines_admin_all" ON public.crm_pipelines FOR ALL TO authenticated
  USING (public.has_full_access(auth.uid())) WITH CHECK (public.has_full_access(auth.uid()));

-- 2. ETAPAS
CREATE TABLE public.crm_stages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT 'slate',
  probability integer NOT NULL DEFAULT 0,
  is_won boolean NOT NULL DEFAULT false,
  is_lost boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_stages_pipeline ON public.crm_stages(pipeline_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_stages TO authenticated;
GRANT ALL ON public.crm_stages TO service_role;
ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_stages_select" ON public.crm_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "crm_stages_admin_all" ON public.crm_stages FOR ALL TO authenticated
  USING (public.has_full_access(auth.uid())) WITH CHECK (public.has_full_access(auth.uid()));

-- 3. ORGANIZAÇÕES
CREATE TABLE public.crm_organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  legal_name text,
  cnpj text,
  sector text,
  category text,
  website text,
  email text,
  phone text,
  cep text,
  street text,
  neighborhood text,
  city text,
  state text,
  region text,
  notes text,
  owner_user_id uuid,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_org_owner ON public.crm_organizations(owner_user_id);
CREATE INDEX idx_crm_org_lead ON public.crm_organizations(lead_id);
CREATE INDEX idx_crm_org_name ON public.crm_organizations(name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_organizations TO authenticated;
GRANT ALL ON public.crm_organizations TO service_role;
ALTER TABLE public.crm_organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_org_select" ON public.crm_organizations FOR SELECT TO authenticated USING (true);
CREATE POLICY "crm_org_insert" ON public.crm_organizations FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "crm_org_update" ON public.crm_organizations FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR owner_user_id = auth.uid() OR public.has_full_access(auth.uid()));
CREATE POLICY "crm_org_delete" ON public.crm_organizations FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR owner_user_id = auth.uid() OR public.has_full_access(auth.uid()));

-- 4. PESSOAS
CREATE TABLE public.crm_people (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid REFERENCES public.crm_organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  job_title text,
  email text,
  phone text,
  whatsapp text,
  linkedin text,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  owner_user_id uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_people_org ON public.crm_people(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_people TO authenticated;
GRANT ALL ON public.crm_people TO service_role;
ALTER TABLE public.crm_people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_people_select" ON public.crm_people FOR SELECT TO authenticated USING (true);
CREATE POLICY "crm_people_insert" ON public.crm_people FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "crm_people_update" ON public.crm_people FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR owner_user_id = auth.uid() OR public.has_full_access(auth.uid()));
CREATE POLICY "crm_people_delete" ON public.crm_people FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR owner_user_id = auth.uid() OR public.has_full_access(auth.uid()));

-- 5. NEGÓCIOS
CREATE TABLE public.crm_deals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','ganho','perdido')),
  loss_reason text,
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE RESTRICT,
  stage_id uuid NOT NULL REFERENCES public.crm_stages(id) ON DELETE RESTRICT,
  organization_id uuid REFERENCES public.crm_organizations(id) ON DELETE SET NULL,
  person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  source lead_source NOT NULL DEFAULT 'outro',
  owner_user_id uuid,
  expected_close_date date,
  closed_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_deals_stage ON public.crm_deals(stage_id);
CREATE INDEX idx_crm_deals_pipeline ON public.crm_deals(pipeline_id);
CREATE INDEX idx_crm_deals_org ON public.crm_deals(organization_id);
CREATE INDEX idx_crm_deals_owner ON public.crm_deals(owner_user_id);
CREATE INDEX idx_crm_deals_status ON public.crm_deals(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_deals TO authenticated;
GRANT ALL ON public.crm_deals TO service_role;
ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_deals_select" ON public.crm_deals FOR SELECT TO authenticated USING (true);
CREATE POLICY "crm_deals_insert" ON public.crm_deals FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "crm_deals_update" ON public.crm_deals FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR owner_user_id = auth.uid() OR public.has_full_access(auth.uid()));
CREATE POLICY "crm_deals_delete" ON public.crm_deals FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR owner_user_id = auth.uid() OR public.has_full_access(auth.uid()));

-- 6. PRODUTOS DO NEGÓCIO
CREATE TABLE public.crm_deal_products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id uuid NOT NULL REFERENCES public.crm_deals(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_deal_products_deal ON public.crm_deal_products(deal_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_deal_products TO authenticated;
GRANT ALL ON public.crm_deal_products TO service_role;
ALTER TABLE public.crm_deal_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_deal_products_select" ON public.crm_deal_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "crm_deal_products_insert" ON public.crm_deal_products FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "crm_deal_products_update" ON public.crm_deal_products FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_full_access(auth.uid()));
CREATE POLICY "crm_deal_products_delete" ON public.crm_deal_products FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_full_access(auth.uid()));

-- 7. ATIVIDADES / TAREFAS / HISTÓRICO
CREATE TABLE public.crm_activities (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_type text NOT NULL DEFAULT 'tarefa'
    CHECK (activity_type IN ('ligacao','email','whatsapp','reuniao','visita','tarefa','nota','historico')),
  title text NOT NULL,
  description text,
  due_at timestamptz,
  completed_at timestamptz,
  deal_id uuid REFERENCES public.crm_deals(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.crm_organizations(id) ON DELETE CASCADE,
  person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
  assigned_to uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_activities_deal ON public.crm_activities(deal_id);
CREATE INDEX idx_crm_activities_org ON public.crm_activities(organization_id);
CREATE INDEX idx_crm_activities_assigned ON public.crm_activities(assigned_to);
CREATE INDEX idx_crm_activities_due ON public.crm_activities(due_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_activities TO authenticated;
GRANT ALL ON public.crm_activities TO service_role;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_activities_select" ON public.crm_activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "crm_activities_insert" ON public.crm_activities FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "crm_activities_update" ON public.crm_activities FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR assigned_to = auth.uid() OR public.has_full_access(auth.uid()));
CREATE POLICY "crm_activities_delete" ON public.crm_activities FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR assigned_to = auth.uid() OR public.has_full_access(auth.uid()));

-- 8. TRIGGERS updated_at
CREATE TRIGGER trg_crm_pipelines_updated_at BEFORE UPDATE ON public.crm_pipelines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_crm_stages_updated_at BEFORE UPDATE ON public.crm_stages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_crm_org_updated_at BEFORE UPDATE ON public.crm_organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_crm_people_updated_at BEFORE UPDATE ON public.crm_people FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_crm_deals_updated_at BEFORE UPDATE ON public.crm_deals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_crm_deal_products_updated_at BEFORE UPDATE ON public.crm_deal_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_crm_activities_updated_at BEFORE UPDATE ON public.crm_activities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 9. HISTÓRICO AUTOMÁTICO DE MUDANÇA DE ETAPA/SITUAÇÃO
CREATE OR REPLACE FUNCTION public.crm_log_deal_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_stage text;
  new_stage text;
BEGIN
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    SELECT name INTO old_stage FROM public.crm_stages WHERE id = OLD.stage_id;
    SELECT name INTO new_stage FROM public.crm_stages WHERE id = NEW.stage_id;
    INSERT INTO public.crm_activities (activity_type, title, description, deal_id, organization_id, completed_at, created_by, assigned_to)
    VALUES ('historico', 'Etapa alterada',
            COALESCE(old_stage,'?') || ' -> ' || COALESCE(new_stage,'?'),
            NEW.id, NEW.organization_id, now(),
            COALESCE(auth.uid(), NEW.created_by), NEW.owner_user_id);
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.crm_activities (activity_type, title, description, deal_id, organization_id, completed_at, created_by, assigned_to)
    VALUES ('historico', 'Situação alterada',
            OLD.status || ' -> ' || NEW.status,
            NEW.id, NEW.organization_id, now(),
            COALESCE(auth.uid(), NEW.created_by), NEW.owner_user_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_crm_deals_log_change AFTER UPDATE ON public.crm_deals
FOR EACH ROW EXECUTE FUNCTION public.crm_log_deal_change();

-- 10. FUNIL PADRÃO
INSERT INTO public.crm_pipelines (name, description, is_default, sort_order)
VALUES ('Funil de Vendas', 'Funil padrão do módulo Agendor', true, 0);

INSERT INTO public.crm_stages (pipeline_id, name, sort_order, color, probability, is_won, is_lost)
SELECT p.id, s.name, s.ord, s.color, s.prob, s.won, s.lost
FROM public.crm_pipelines p,
(VALUES
  ('Prospecção', 0, 'slate', 10, false, false),
  ('Contato Feito', 1, 'sky', 25, false, false),
  ('Proposta Enviada', 2, 'amber', 50, false, false),
  ('Negociação', 3, 'orange', 75, false, false),
  ('Ganho', 4, 'emerald', 100, true, false),
  ('Perdido', 5, 'rose', 0, false, true)
) AS s(name, ord, color, prob, won, lost)
WHERE p.is_default = true;