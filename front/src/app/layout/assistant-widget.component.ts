import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { marked } from "marked";

import type {
  AssistantConversationResponse,
  AssistantMessageContextRequest,
  AssistantMessageResponse,
} from "../core/api.models";
import { AssistantService } from "../services/assistant.service";

@Component({
  selector: "app-assistant-widget",
  imports: [CommonModule, FormsModule],
  templateUrl: "./assistant-widget.component.html",
  styleUrl: "./assistant-widget.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssistantWidgetComponent implements OnDestroy {
  private readonly assistantService = inject(AssistantService);
  private readonly router = inject(Router);
  private readonly mobileMediaQuery =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 768px)")
      : null;
  private readonly onMediaChange = (event: MediaQueryListEvent): void => {
    this.mobileLayout.set(event.matches);
  };

  readonly open = signal(false);
  readonly loading = signal(false);
  readonly sending = signal(false);
  readonly assistantThinking = signal(false);
  readonly feedback = signal<string | null>(null);
  readonly draft = signal("");
  readonly conversation = signal<AssistantConversationResponse | null>(null);
  readonly mobileLayout = signal(this.mobileMediaQuery?.matches ?? false);
  readonly messages = computed(() => this.conversation()?.messages ?? []);

  constructor() {
    this.mobileMediaQuery?.addEventListener("change", this.onMediaChange);
  }

  ngOnDestroy(): void {
    this.mobileMediaQuery?.removeEventListener("change", this.onMediaChange);
  }

  async toggle(): Promise<void> {
    const next = !this.open();
    this.open.set(next);

    if (!next) {
      return;
    }

    await this.loadConversation();
  }

  close(): void {
    this.open.set(false);
  }

  async loadConversation(): Promise<void> {
    if (this.loading()) {
      return;
    }

    this.loading.set(true);
    this.feedback.set(null);

    try {
      const response = await this.assistantService.getConversation();
      this.conversation.set(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chargement de l'assistant impossible.";
      this.feedback.set(message);
    } finally {
      this.loading.set(false);
    }
  }

  async resetConversation(): Promise<void> {
    if (this.loading()) {
      return;
    }

    this.loading.set(true);
    this.feedback.set(null);

    try {
      const response = await this.assistantService.resetConversation();
      this.conversation.set(response);
      this.draft.set("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Réinitialisation de la conversation impossible.";
      this.feedback.set(message);
    } finally {
      this.loading.set(false);
    }
  }

  async send(): Promise<void> {
    const message = this.draft().trim();
    if (!message || this.sending()) {
      return;
    }

    this.sending.set(true);
    this.assistantThinking.set(true);
    this.feedback.set(null);
    this.appendOptimisticUserMessage(message);
    const assistantTempId = this.appendOptimisticAssistantMessage();
    this.draft.set("");
    const context = this.resolveCurrentContext(this.router.url);

    try {
      const response = await this.assistantService.sendMessageStream(
        message,
        {
          onDelta: (chunk) => {
            if (chunk) {
              this.appendAssistantDelta(assistantTempId, chunk);
              this.assistantThinking.set(false);
            }
          },
        },
        context,
      );
      this.conversation.set(response.conversation);
    } catch (error) {
      this.removeMessage(assistantTempId);
      const msg = error instanceof Error ? error.message : "Message assistant impossible.";
      this.feedback.set(msg);
    } finally {
      this.sending.set(false);
      this.assistantThinking.set(false);
    }
  }

  onDraftKeydown(event: KeyboardEvent): void {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void this.send();
  }

  trackMessage(_index: number, message: AssistantMessageResponse): string {
    return message.id;
  }

  messageHTML(message: AssistantMessageResponse): string {
    if (message.role === "ASSISTANT") {
      return this.toHTML(message.text);
    }

    return this.escapeHtml(message.text).replace(/\n/g, "<br/>");
  }

  private appendOptimisticUserMessage(text: string): void {
    const nowIso = new Date().toISOString();
    this.conversation.update((current) => {
      const baseConversation: AssistantConversationResponse =
        current ?? {
          id: "pending",
          greeting: "",
          messages: [],
          createdAt: nowIso,
          updatedAt: nowIso,
        };

      return {
        ...baseConversation,
        updatedAt: nowIso,
        messages: [
          ...baseConversation.messages,
          {
            id: `tmp-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role: "USER",
            text,
            citations: [],
            createdAt: nowIso,
          },
        ],
      };
    });
  }

  private appendOptimisticAssistantMessage(): string {
    const id = `tmp-assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nowIso = new Date().toISOString();

    this.conversation.update((current) => {
      const baseConversation: AssistantConversationResponse =
        current ?? {
          id: "pending",
          greeting: "",
          messages: [],
          createdAt: nowIso,
          updatedAt: nowIso,
        };

      return {
        ...baseConversation,
        updatedAt: nowIso,
        messages: [
          ...baseConversation.messages,
          {
            id,
            role: "ASSISTANT",
            text: "",
            citations: [],
            createdAt: nowIso,
          },
        ],
      };
    });

    return id;
  }

  private appendAssistantDelta(messageId: string, chunk: string): void {
    this.conversation.update((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        updatedAt: new Date().toISOString(),
        messages: current.messages.map((message) =>
          message.id === messageId
            ? {
                ...message,
                text: `${message.text}${chunk}`,
              }
            : message,
        ),
      };
    });
  }

  private removeMessage(messageId: string): void {
    this.conversation.update((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        updatedAt: new Date().toISOString(),
        messages: current.messages.filter((message) => message.id !== messageId),
      };
    });
  }

  private toHTML(markdown: string): string {
    const rendered = marked.parse(markdown, {
      gfm: true,
      breaks: true,
      async: false,
    });

    return typeof rendered === "string" ? rendered : "";
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  private resolveCurrentContext(url: string): AssistantMessageContextRequest | null {
    const [path] = url.split("?");
    if (!path) {
      return null;
    }

    const segments = path
      .split("/")
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
    if (segments.length < 3 || segments[0] !== "app") {
      return null;
    }

    const section = segments[1];
    const objectId = segments[2];
    if (!objectId || objectId === "nouveau") {
      return null;
    }

    if (section === "bien") {
      return {
        objectType: "bien",
        objectId,
      };
    }

    if (section === "utilisateurs") {
      return {
        objectType: "user",
        objectId,
      };
    }

    if (section === "rdv") {
      return {
        objectType: "rdv",
        objectId,
      };
    }

    return null;
  }
}
