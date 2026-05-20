import type { ChatExchange, ChatMessage, ChatSession, FeedbackState } from "@travelassistant/shared";

import { createApiClient } from "./api-client";

export type ChatMessagePayload = Readonly<{
  content: string;
  modality?: string;
  idempotency_key?: string;
}>;

export function createChatClient(accessToken?: string) {
  const client = createApiClient({ accessToken });

  return {
    createSession(title?: string): Promise<ChatSession> {
      return client.post<ChatSession>("/chat/sessions", { title: title ?? null });
    },
    listSessions(): Promise<ChatSession[]> {
      return client.get<ChatSession[]>("/chat/sessions");
    },
    getSession(sessionId: string): Promise<ChatSession> {
      return client.get<ChatSession>(`/chat/sessions/${sessionId}`);
    },
    deleteSession(sessionId: string): Promise<void> {
      return client.delete(`/chat/sessions/${sessionId}`);
    },
    listMessages(sessionId: string): Promise<ChatMessage[]> {
      return client.get<ChatMessage[]>(`/chat/sessions/${sessionId}/messages`);
    },
    postMessage(sessionId: string, payload: ChatMessagePayload): Promise<ChatExchange> {
      return client.post<ChatExchange>(`/chat/sessions/${sessionId}/messages`, payload);
    },
    streamMessage(sessionId: string, payload: ChatMessagePayload): Promise<Response> {
      return client.stream(`/chat/sessions/${sessionId}/stream`, payload);
    },
    sendFeedback(messageId: string, feedbackState: FeedbackState): Promise<ChatMessage> {
      return client.post<ChatMessage>("/chat/feedback", {
        message_id: messageId,
        feedback_state: feedbackState
      });
    }
  };
}
