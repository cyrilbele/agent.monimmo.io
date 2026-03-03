import { inject, Injectable } from "@angular/core";

import type { AICallLogListResponse } from "../core/api.models";
import { ApiClientService } from "../core/api-client.service";

@Injectable({ providedIn: "root" })
export class AICallsService {
  private readonly api = inject(ApiClientService);

  async list(limit = 100): Promise<AICallLogListResponse> {
    return this.api.request<AICallLogListResponse>("GET", "/me/ai-calls", {
      params: { limit },
    });
  }
}

