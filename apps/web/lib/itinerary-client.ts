import type { SavedItinerary } from "@travelassistant/shared";

import { createApiClient } from "./api-client";

export type ItineraryGeneratePayload = Readonly<{
  destination: string;
  days?: number;
  interests?: string[];
  budget?: string | null;
  travelers?: number;
}>;

export function createItineraryClient(accessToken?: string) {
  const client = createApiClient({ accessToken });

  return {
    generate(payload: ItineraryGeneratePayload): Promise<SavedItinerary> {
      return client.post<SavedItinerary>("/itineraries/generate", payload);
    },
    list(): Promise<SavedItinerary[]> {
      return client.get<SavedItinerary[]>("/itineraries");
    },
    get(itineraryId: string): Promise<SavedItinerary> {
      return client.get<SavedItinerary>(`/itineraries/${itineraryId}`);
    },
    update(itineraryId: string, payload: Partial<Pick<SavedItinerary, "title" | "plan_json">>): Promise<SavedItinerary> {
      return client.put<SavedItinerary>(`/itineraries/${itineraryId}`, payload);
    },
    delete(itineraryId: string): Promise<void> {
      return client.delete(`/itineraries/${itineraryId}`);
    },
    share(itineraryId: string): Promise<SavedItinerary> {
      return client.post<SavedItinerary>(`/itineraries/${itineraryId}/share`, {});
    },
    getShared(shareId: string): Promise<SavedItinerary> {
      return client.get<SavedItinerary>(`/shared/itineraries/${shareId}`);
    }
  };
}
