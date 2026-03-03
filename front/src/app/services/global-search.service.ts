import { inject, Injectable } from "@angular/core";

import type { GlobalSearchResponse } from "../core/api.models";
import { ApiClientService } from "../core/api-client.service";

@Injectable({ providedIn: "root" })
export class GlobalSearchService {
  private readonly api = inject(ApiClientService);

  async search(query: string, limit = 20): Promise<GlobalSearchResponse> {
    const normalized = query.trim();
    if (!normalized) {
      return { items: [] };
    }

    return this.api.request<GlobalSearchResponse>("GET", "/search", {
      params: {
        q: normalized,
        limit,
      },
    });
  }
}

