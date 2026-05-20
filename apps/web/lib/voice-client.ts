import type { STTResponse, TTSResponse, VoiceJob } from "@travelassistant/shared";

import { createApiClient } from "./api-client";

export function createVoiceClient(accessToken?: string) {
  const client = createApiClient({ accessToken });

  return {
    speechToText(file: File): Promise<STTResponse> {
      const formData = new FormData();
      formData.set("file", file);
      return client.postForm<STTResponse>("/voice/stt", formData);
    },
    textToSpeech(text: string): Promise<TTSResponse> {
      return client.post<TTSResponse>("/voice/tts", { text });
    },
    query(file: File): Promise<VoiceJob> {
      const formData = new FormData();
      formData.set("file", file);
      return client.postForm<VoiceJob>("/voice/query", formData);
    },
    getStatus(jobId: string): Promise<VoiceJob> {
      return client.get<VoiceJob>(`/voice/status/${jobId}`);
    }
  };
}
