REVOKE ALL ON FUNCTION public.crm_touch_deal_activity() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_log_owner_change() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_can_view(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.crm_can_view_deal(uuid, uuid) FROM anon;