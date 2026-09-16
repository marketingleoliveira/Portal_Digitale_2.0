CREATE OR REPLACE FUNCTION public.ingest_qualified_crm_lead(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_system text := nullif(trim(_payload->>'source_system'), '');
  v_external_lead_id text := nullif(trim(_payload->>'external_lead_id'), '');
  v_status text := lower(coalesce(nullif(trim(_payload->>'qualification_status'), ''), ''));
  v_score integer;
  v_owner_id uuid;
  v_pipeline_id uuid;
  v_stage_id uuid;
  v_import public.crm_external_lead_imports%ROWTYPE;
  v_organization_id uuid;
  v_person_id uuid;
  v_deal_id uuid;
  v_company_name text;
  v_contact_name text;
  v_email text := nullif(lower(trim(_payload->>'email')), '');
  v_phone text := nullif(trim(_payload->>'whatsapp'), '');
  v_cnpj text := nullif(regexp_replace(coalesce(_payload->>'cnpj', ''), '\D', '', 'g'), '');
  v_fabric_name text := nullif(trim(_payload->>'fabric_name'), '');
  v_summary text := nullif(trim(_payload->>'ai_summary'), '');
  v_recommendation text := nullif(trim(_payload->>'recommendation'), '');
  v_description text;
BEGIN
  IF v_source_system IS NULL OR length(v_source_system) > 80 THEN
    RAISE EXCEPTION 'invalid source_system';
  END IF;
  IF v_external_lead_id IS NULL OR length(v_external_lead_id) > 200 THEN
    RAISE EXCEPTION 'invalid external_lead_id';
  END IF;
  IF v_status <> 'qualified' THEN
    RAISE EXCEPTION 'only qualified leads are accepted';
  END IF;
  IF _payload ? 'qualification_score' AND nullif(trim(_payload->>'qualification_score'), '') IS NOT NULL THEN
    v_score := (_payload->>'qualification_score')::integer;
    IF v_score < 0 OR v_score > 100 THEN
      RAISE EXCEPTION 'invalid qualification_score';
    END IF;
  END IF;

  SELECT i.* INTO v_import
  FROM public.crm_external_lead_imports i
  WHERE i.source_system = v_source_system
    AND i.external_lead_id = v_external_lead_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'created', false,
      'duplicate', true,
      'import_id', v_import.id,
      'deal_id', v_import.deal_id,
      'owner_user_id', v_import.owner_user_id
    );
  END IF;

  SELECT p.id INTO v_owner_id
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE lower(p.email) = 'sdr@digitaletextil.com.br'
    AND ur.role = 'sdr'::public.app_role
    AND coalesce(p.is_active, false) = true
  LIMIT 1;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'configured SDR user is unavailable';
  END IF;

  SELECT p.id INTO v_pipeline_id
  FROM public.crm_pipelines p
  WHERE p.is_default = true
  ORDER BY p.sort_order, p.created_at
  LIMIT 1;

  SELECT s.id INTO v_stage_id
  FROM public.crm_stages s
  WHERE s.pipeline_id = v_pipeline_id
    AND lower(s.name) = lower('Prospecção')
  ORDER BY s.sort_order
  LIMIT 1;

  IF v_pipeline_id IS NULL OR v_stage_id IS NULL THEN
    RAISE EXCEPTION 'default pipeline or Prospecção stage is unavailable';
  END IF;

  v_company_name := coalesce(
    nullif(trim(_payload->>'company_name'), ''),
    CASE WHEN v_email IS NOT NULL THEN split_part(v_email, '@', 2) END,
    'Lead do Agente CRM'
  );
  v_contact_name := coalesce(nullif(trim(_payload->>'contact_name'), ''), v_company_name);
  v_description := concat_ws(E'\n',
    'Lead qualificado automaticamente pelo Agente CRM do site institucional.',
    CASE WHEN v_fabric_name IS NOT NULL THEN 'Interesse: ' || v_fabric_name END,
    CASE WHEN v_score IS NOT NULL THEN 'Pontuação: ' || v_score::text || '/100' END,
    CASE WHEN v_recommendation IS NOT NULL THEN 'Recomendação: ' || v_recommendation END,
    CASE WHEN v_summary IS NOT NULL THEN 'Resumo: ' || v_summary END
  );

  SELECT o.id INTO v_organization_id
  FROM public.crm_organizations o
  WHERE o.owner_user_id = v_owner_id
    AND (
      (v_cnpj IS NOT NULL AND regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g') = v_cnpj)
      OR (v_email IS NOT NULL AND lower(coalesce(o.email, '')) = v_email)
    )
  ORDER BY o.created_at
  LIMIT 1;

  IF v_organization_id IS NULL THEN
    INSERT INTO public.crm_organizations (
      name, cnpj, email, phone, notes, owner_user_id, created_by
    ) VALUES (
      v_company_name, v_cnpj, v_email, v_phone, v_description, v_owner_id, v_owner_id
    ) RETURNING id INTO v_organization_id;
  END IF;

  SELECT p.id INTO v_person_id
  FROM public.crm_people p
  WHERE p.owner_user_id = v_owner_id
    AND (
      (v_email IS NOT NULL AND lower(coalesce(p.email, '')) = v_email)
      OR (v_phone IS NOT NULL AND regexp_replace(coalesce(p.whatsapp, p.phone, ''), '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g'))
    )
  ORDER BY p.created_at
  LIMIT 1;

  IF v_person_id IS NULL THEN
    INSERT INTO public.crm_people (
      organization_id, name, email, phone, whatsapp, is_primary, notes, owner_user_id, created_by
    ) VALUES (
      v_organization_id, v_contact_name, v_email, v_phone, v_phone, true, v_description, v_owner_id, v_owner_id
    ) RETURNING id INTO v_person_id;
  END IF;

  INSERT INTO public.crm_deals (
    title, description, value, status, pipeline_id, stage_id,
    organization_id, person_id, source, owner_user_id, created_by
  ) VALUES (
    'Prospecção - ' || v_company_name,
    v_description,
    0,
    'aberto',
    v_pipeline_id,
    v_stage_id,
    v_organization_id,
    v_person_id,
    'site'::public.lead_source,
    v_owner_id,
    v_owner_id
  ) RETURNING id INTO v_deal_id;

  INSERT INTO public.crm_activities (
    activity_type, title, description, deal_id, organization_id, person_id,
    completed_at, assigned_to, created_by
  ) VALUES (
    'historico',
    'Lead recebido do Agente CRM',
    v_description,
    v_deal_id,
    v_organization_id,
    v_person_id,
    now(),
    v_owner_id,
    v_owner_id
  );

  INSERT INTO public.user_notifications (
    title, message, created_by, target_user_id
  ) VALUES (
    'Novo lead qualificado no Agendor',
    v_company_name || ' foi qualificado pelo Agente CRM e está disponível na etapa Prospecção.',
    v_owner_id,
    v_owner_id
  );

  INSERT INTO public.crm_external_lead_imports (
    source_system, external_lead_id, qualification_status, qualification_score,
    organization_id, person_id, deal_id, owner_user_id, payload
  ) VALUES (
    v_source_system, v_external_lead_id, v_status, v_score,
    v_organization_id, v_person_id, v_deal_id, v_owner_id, _payload
  ) RETURNING * INTO v_import;

  RETURN jsonb_build_object(
    'created', true,
    'duplicate', false,
    'import_id', v_import.id,
    'deal_id', v_deal_id,
    'owner_user_id', v_owner_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_qualified_crm_lead(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ingest_qualified_crm_lead(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.ingest_qualified_crm_lead(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_qualified_crm_lead(jsonb) TO service_role;