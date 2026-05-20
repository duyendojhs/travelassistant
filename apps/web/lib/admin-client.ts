import type {
  AdminContentSummary,
  AdminDashboardSummary,
  AuditLog,
  Destination,
  ItineraryTemplate,
  ProductEvent,
  Tag
} from "@travelassistant/shared";

import { createApiClient } from "./api-client";

export type ProductEventPayload = Readonly<{
  event_name: string;
  intent?: string;
  destination_slug?: string;
  session_id?: string;
  latency_ms?: number;
  cost_usd?: number;
  metadata_json?: Record<string, unknown>;
}>;

export function createAdminClient(accessToken?: string) {
  const client = createApiClient({ accessToken });

  return {
    dashboard(): Promise<AdminDashboardSummary> {
      return client.get<AdminDashboardSummary>("/admin/dashboard");
    },
    contentSummary(): Promise<AdminContentSummary> {
      return client.get<AdminContentSummary>("/admin/content/summary");
    },
    auditLogs(limit = 50): Promise<AuditLog[]> {
      return client.get<AuditLog[]>(`/admin/audit-logs?limit=${limit}`);
    },
    listDestinations(): Promise<Destination[]> {
      return client.get<Destination[]>("/admin/destinations");
    },
    listTags(): Promise<Tag[]> {
      return client.get<Tag[]>("/admin/tags");
    },
    listItineraryTemplates(): Promise<ItineraryTemplate[]> {
      return client.get<ItineraryTemplate[]>("/admin/itinerary-templates");
    },
    publish(targetType: string, targetId: string): Promise<{ id: string; status: string }> {
      return client.post<{ id: string; status: string }>(`/admin/${targetType}/${targetId}/publish`, {});
    },
    ingestEvent(payload: ProductEventPayload): Promise<ProductEvent> {
      return client.post<ProductEvent>("/events", {
        metadata_json: {},
        ...payload
      });
    }
  };
}
