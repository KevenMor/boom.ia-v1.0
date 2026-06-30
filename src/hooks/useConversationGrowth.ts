import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchAgentTokenUsageInRange } from "@/lib/fetch-agent-token-usage";
import {
  buildConversationGrowthSeries,
  type ConversationGrowthPoint,
  type ConversationUsageRow,
} from "@/lib/conversation-growth";

export interface ConversationGrowthSeries {
  monthly: ConversationGrowthPoint[];
  annual: ConversationGrowthPoint[];
}

const USAGE_SELECT = "conversation_id, created_at";

export function useConversationGrowth(tenantId?: string | null) {
  return useQuery({
    queryKey: ["conversation-growth", tenantId ?? "all"],
    queryFn: async (): Promise<ConversationGrowthSeries> => {
      const since = new Date();
      since.setFullYear(since.getFullYear() - 4);
      since.setMonth(0, 1);
      since.setHours(0, 0, 0, 0);

      const raw = await fetchAgentTokenUsageInRange(since, tenantId, {
        columns: USAGE_SELECT,
        globalLimit: 80_000,
      });

      return buildConversationGrowthSeries(raw as ConversationUsageRow[]);
    },
    refetchInterval: 60_000,
    staleTime: 1000 * 60 * 5,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });
}
