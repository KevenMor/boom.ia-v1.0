import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAllPromptConfigs, getPromptConfig, buildSystemPrompt, getDispatcherPrompt } from "../_shared/prompts/registry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-nexus-auth, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");

    if (slug) {
      // Return specific tenant prompt config
      const config = getPromptConfig(slug);
      if (!config) {
        return new Response(JSON.stringify({ error: "Tenant not found in prompt registry" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Build the full system prompt as it would be used
      const fullSystemPrompt = buildSystemPrompt("", slug, true);
      const dispatcherPrompt = getDispatcherPrompt(slug);

      return new Response(JSON.stringify({
        slug: config.slug,
        version: config.version,
        description: config.description,
        systemPrompt: config.systemPrompt || "(uses agent's database prompt)",
        communicationRules: config.communicationRules || "(none)",
        dispatcherPrompt,
        fullComposedPrompt: fullSystemPrompt,
        fullPromptLength: fullSystemPrompt.length,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Return all tenant prompt configs (summary)
    const allConfigs = getAllPromptConfigs();
    const summary = Object.entries(allConfigs).map(([key, config]) => ({
      slug: config.slug,
      version: config.version,
      description: config.description,
      systemPromptLength: (config.systemPrompt || "").length,
      communicationRulesLength: (config.communicationRules || "").length,
      dispatcherPromptLength: config.dispatcherPrompt.length,
    }));

    return new Response(JSON.stringify({ tenants: summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
