import { inject, Injectable } from "@angular/core";

import type {
  AssistantConversationResponse,
  AssistantMessageContextRequest,
  AssistantMessageCreateResponse,
} from "../core/api.models";
import { normalizeApiBaseUrl } from "../core/auth-helpers";
import { ApiClientService } from "../core/api-client.service";
import { sessionStore } from "../core/session-store";

export interface AssistantStreamHandlers {
  onDelta?: (chunk: string) => void;
  onStatus?: (status: string) => void;
}

@Injectable({ providedIn: "root" })
export class AssistantService {
  private readonly api = inject(ApiClientService);
  private readonly baseUrl = this.resolveApiBaseUrl();

  getConversation(): Promise<AssistantConversationResponse> {
    return this.api.request<AssistantConversationResponse>("GET", "/assistant/conversation");
  }

  resetConversation(): Promise<AssistantConversationResponse> {
    return this.api.request<AssistantConversationResponse>("POST", "/assistant/conversation/reset", {
      body: {},
    });
  }

  sendMessage(
    message: string,
    context?: AssistantMessageContextRequest | null,
  ): Promise<AssistantMessageCreateResponse> {
    return this.api.request<AssistantMessageCreateResponse>("POST", "/assistant/messages", {
      body: context ? { message, context } : { message },
    });
  }

  async sendMessageStream(
    message: string,
    handlers: AssistantStreamHandlers = {},
    context?: AssistantMessageContextRequest | null,
  ): Promise<AssistantMessageCreateResponse> {
    const token = sessionStore.accessToken();
    if (!token) {
      throw new Error("Session expirée. Veuillez vous reconnecter.");
    }

    const response = await fetch(`${this.baseUrl}/assistant/messages/stream`, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(context ? { message, context } : { message }),
    });

    if (!response.ok) {
      let errorMessage = `Requête impossible (${response.status}).`;
      try {
        const parsed = (await response.json()) as { message?: unknown };
        if (typeof parsed.message === "string" && parsed.message.trim()) {
          errorMessage = parsed.message;
        }
      } catch {
        // no-op
      }

      throw new Error(errorMessage);
    }

    if (!response.body) {
      return this.sendMessage(message, context);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalPayload: AssistantMessageCreateResponse | null = null;

    const parseEvent = (block: string): void => {
      const lines = block
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0);
      if (lines.length === 0) {
        return;
      }

      let event = "message";
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith("event:")) {
          event = line.slice("event:".length).trim();
          continue;
        }

        if (line.startsWith("data:")) {
          dataLines.push(line.slice("data:".length).trim());
        }
      }

      const dataRaw = dataLines.join("\n");
      if (!dataRaw) {
        return;
      }

      let payload: unknown = null;
      try {
        payload = JSON.parse(dataRaw) as unknown;
      } catch {
        return;
      }

      if (event === "status") {
        if (
          payload &&
          typeof payload === "object" &&
          !Array.isArray(payload) &&
          typeof (payload as { state?: unknown }).state === "string"
        ) {
          handlers.onStatus?.((payload as { state: string }).state);
        }
        return;
      }

      if (event === "delta") {
        if (
          payload &&
          typeof payload === "object" &&
          !Array.isArray(payload) &&
          typeof (payload as { text?: unknown }).text === "string"
        ) {
          handlers.onDelta?.((payload as { text: string }).text);
        }
        return;
      }

      if (event === "error") {
        if (
          payload &&
          typeof payload === "object" &&
          !Array.isArray(payload) &&
          typeof (payload as { message?: unknown }).message === "string"
        ) {
          throw new Error((payload as { message: string }).message);
        }

        throw new Error("Streaming assistant impossible.");
      }

      if (event === "final") {
        finalPayload = payload as AssistantMessageCreateResponse;
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      let separatorIndex = buffer.indexOf("\n\n");
      while (separatorIndex >= 0) {
        const rawBlock = buffer.slice(0, separatorIndex).replace(/\r/g, "");
        buffer = buffer.slice(separatorIndex + 2);
        parseEvent(rawBlock);
        separatorIndex = buffer.indexOf("\n\n");
      }

      if (done) {
        break;
      }
    }

    if (finalPayload) {
      return finalPayload;
    }

    return this.sendMessage(message, context);
  }

  private resolveApiBaseUrl(): string {
    const runtimeValue =
      typeof window !== "undefined"
        ? (window as Window & { MONIMMO_API_BASE_URL?: string }).MONIMMO_API_BASE_URL
        : undefined;

    return normalizeApiBaseUrl(runtimeValue);
  }
}
