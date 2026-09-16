import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const LeadSchema = z.object({
  source_system: z.literal("digitale_institucional"),
  external_lead_id: z.string().uuid(),
  qualification_status: z.literal("qualified"),
  qualification_score: z.number().int().min(0).max(100).optional(),
  company_name: z.string().trim().min(1).max(255).optional(),
  contact_name: z.string().trim().min(1).max(255).optional(),
  fabric_name: z.string().trim().min(1).max(255).optional(),
  cnpj: z.string().trim().max(32).optional(),
  whatsapp: z.string().trim().max(32).optional(),
  email: z.string().trim().email().max(320).optional(),
  cnae: z.string().trim().max(40).optional(),
  recommendation: z.string().trim().max(500).optional(),
  ai_summary: z.string().trim().max(2000).optional(),
  validated_at: z.string().datetime().optional(),
});

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const constantTimeEqual = (left: string, right: string) => {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) return false;

  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const configuredSecret = Deno.env.get("CRM_LEAD_WEBHOOK_SECRET");
  const suppliedSecret = req.headers.get("x-crm-webhook-secret") ?? "";
  if (!configuredSecret || !constantTimeEqual(configuredSecret, suppliedSecret)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const parsed = LeadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Backend configuration unavailable" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.rpc("ingest_qualified_crm_lead", {
      _payload: parsed.data,
    });

    if (error) {
      console.error("Qualified CRM lead import failed", error.message);
      return jsonResponse({ error: "Unable to import qualified lead" }, 500);
    }

    return jsonResponse(data, 200);
  } catch (error) {
    console.error("Qualified CRM lead receiver failed", error);
    return jsonResponse({ error: "Unexpected import failure" }, 500);
  }
});