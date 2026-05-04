import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinanceiroCampaignResult } from "./financeiro-campaign-runner.js";

const MAX_TEMPLATE_LEN = 8000;
const MAX_RESULTS_ROWS = 2000;

export async function persistFinanceiroCampaignRun(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    agentId: string;
    createdByUserId: string;
    jobId: string | null;
    messageTemplate: string;
    status: "completed" | "failed";
    result?: FinanceiroCampaignResult;
    errorMessage?: string;
  }
): Promise<void> {
  const template = params.messageTemplate.slice(0, MAX_TEMPLATE_LEN);
  let results: FinanceiroCampaignResult["results"] | null =
    params.status === "completed" && params.result ? params.result.results : null;

  const summary: Record<string, unknown> =
    params.status === "completed" && params.result
      ? {
          total: params.result.total,
          sent: params.result.sent,
          failed: params.result.failed,
          delivery: params.result.delivery,
        }
      : {
          total: params.result?.total ?? 0,
          sent: params.result?.sent ?? 0,
          failed: params.result?.failed ?? 0,
          delivery: params.result?.delivery ?? null,
        };

  if (results && results.length > MAX_RESULTS_ROWS) {
    results = results.slice(0, MAX_RESULTS_ROWS);
    summary.results_truncated = true;
  }

  const { error } = await supabase.from("financeiro_campaign_runs").insert({
    tenant_id: params.tenantId,
    agent_id: params.agentId,
    created_by: params.createdByUserId,
    job_id: params.jobId,
    message_template: template,
    status: params.status,
    summary,
    results,
    error_message: params.errorMessage ?? null,
  });

  if (error) {
    console.warn("[FinanceiroCampaign] persist run failed:", error.message);
  }
}
