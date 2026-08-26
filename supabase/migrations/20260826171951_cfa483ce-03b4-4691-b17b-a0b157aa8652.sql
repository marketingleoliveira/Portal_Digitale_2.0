-- 1. Helper de escopo
CREATE OR REPLACE FUNCTION public.crm_can_view(_user_id uuid, _owner uuid, _creator uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_full_access(_user_id)
     OR (_owner IS NOT NULL AND _owner = _user_id)
     OR (_creator IS NOT NULL AND _creator = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.crm_can_view_deal(_user_id uuid, _deal_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_full_access(_user_id)
     OR EXISTS (
       SELECT 1 FROM public.crm_deals d
       WHERE d.id = _deal_id
         AND (d.owner_user_id = _user_id OR d.created_by = _user_id)
     )
$$;

-- 2. Novos campos em crm_deals
ALTER TABLE public.crm_deals
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS won_value numeric,
  ADD COLUMN IF NOT EXISTS loss_competitor text;

-- 3. Transferências de carteira
CREATE TABLE IF NOT EXISTS public.crm_ownership_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('deal','organization','person','activity')),
  entity_id uuid NOT NULL,
  from_user_id uuid,
  to_user_id uuid,
  reason text,
  transferred_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.crm_ownership_transfers TO authenticated;
GRANT ALL ON public.crm_ownership_transfers TO service_role;
ALTER TABLE public.crm_ownership_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_transfers_select ON public.crm_ownership_transfers
  FOR SELECT TO authenticated
  USING (public.has_full_access(auth.uid()) OR from_user_id = auth.uid() OR to_user_id = auth.uid());
CREATE POLICY crm_transfers_insert ON public.crm_ownership_transfers
  FOR INSERT TO authenticated WITH CHECK (transferred_by = auth.uid());

-- 4. Configurações do módulo
CREATE TABLE IF NOT EXISTS public.crm_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.crm_settings TO authenticated;
GRANT ALL ON public.crm_settings TO service_role;
ALTER TABLE public.crm_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_settings_select ON public.crm_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY crm_settings_admin ON public.crm_settings FOR ALL TO authenticated
  USING (public.has_full_access(auth.uid())) WITH CHECK (public.has_full_access(auth.uid()));
GRANT INSERT, UPDATE, DELETE ON public.crm_settings TO authenticated;
CREATE TRIGGER trg_crm_settings_updated_at BEFORE UPDATE ON public.crm_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

INSERT INTO public.crm_settings (key, value) VALUES
  ('loss_reasons', '["Preço","Prazo de entrega","Concorrente","Sem orçamento","Sem retorno","Fora de perfil","Outro"]'::jsonb),
  ('sources', '["Instagram","Site","WhatsApp","Indicação","TikTok","Marketplace","Evento","Telefone","E-mail","Outro"]'::jsonb),
  ('health_rules', '{"stale_days":7,"warning_days":3}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 5. Políticas de isolamento
DROP POLICY IF EXISTS crm_deals_select ON public.crm_deals;
CREATE POLICY crm_deals_select ON public.crm_deals FOR SELECT TO authenticated
  USING (public.crm_can_view(auth.uid(), owner_user_id, created_by));

DROP POLICY IF EXISTS crm_org_select ON public.crm_organizations;
CREATE POLICY crm_org_select ON public.crm_organizations FOR SELECT TO authenticated
  USING (
    public.crm_can_view(auth.uid(), owner_user_id, created_by)
    OR EXISTS (
      SELECT 1 FROM public.crm_deals d
      WHERE d.organization_id = crm_organizations.id
        AND (d.owner_user_id = auth.uid() OR d.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS crm_people_select ON public.crm_people;
CREATE POLICY crm_people_select ON public.crm_people FOR SELECT TO authenticated
  USING (
    public.crm_can_view(auth.uid(), owner_user_id, created_by)
    OR EXISTS (
      SELECT 1 FROM public.crm_deals d
      WHERE d.person_id = crm_people.id
        AND (d.owner_user_id = auth.uid() OR d.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS crm_activities_select ON public.crm_activities;
CREATE POLICY crm_activities_select ON public.crm_activities FOR SELECT TO authenticated
  USING (
    public.crm_can_view(auth.uid(), assigned_to, created_by)
    OR (deal_id IS NOT NULL AND public.crm_can_view_deal(auth.uid(), deal_id))
  );

DROP POLICY IF EXISTS crm_deal_products_select ON public.crm_deal_products;
CREATE POLICY crm_deal_products_select ON public.crm_deal_products FOR SELECT TO authenticated
  USING (public.crm_can_view_deal(auth.uid(), deal_id));

DROP POLICY IF EXISTS crm_deals_insert ON public.crm_deals;
CREATE POLICY crm_deals_insert ON public.crm_deals FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (public.has_full_access(auth.uid()) OR owner_user_id = auth.uid())
  );

-- 6. Última movimentação + histórico de transferência
CREATE OR REPLACE FUNCTION public.crm_touch_deal_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.deal_id IS NOT NULL THEN
    UPDATE public.crm_deals SET last_activity_at = now() WHERE id = NEW.deal_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_activities_touch_deal ON public.crm_activities;
CREATE TRIGGER trg_crm_activities_touch_deal AFTER INSERT ON public.crm_activities
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_deal_activity();

CREATE OR REPLACE FUNCTION public.crm_log_owner_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  old_name text;
  new_name text;
BEGIN
  NEW.last_activity_at := now();

  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
    SELECT full_name INTO old_name FROM public.profiles WHERE id = OLD.owner_user_id;
    SELECT full_name INTO new_name FROM public.profiles WHERE id = NEW.owner_user_id;

    INSERT INTO public.crm_ownership_transfers (entity_type, entity_id, from_user_id, to_user_id, transferred_by)
    VALUES ('deal', NEW.id, OLD.owner_user_id, NEW.owner_user_id, COALESCE(auth.uid(), NEW.created_by));

    INSERT INTO public.crm_activities (activity_type, title, description, deal_id, organization_id, completed_at, created_by, assigned_to)
    VALUES ('historico', 'Responsável alterado',
            COALESCE(old_name,'Sem responsável') || ' -> ' || COALESCE(new_name,'Sem responsável'),
            NEW.id, NEW.organization_id, now(),
            COALESCE(auth.uid(), NEW.created_by), NEW.owner_user_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_deals_owner_change ON public.crm_deals;
CREATE TRIGGER trg_crm_deals_owner_change BEFORE UPDATE ON public.crm_deals
  FOR EACH ROW EXECUTE FUNCTION public.crm_log_owner_change();

UPDATE public.crm_deals SET last_activity_at = GREATEST(updated_at, created_at) WHERE last_activity_at IS NULL;