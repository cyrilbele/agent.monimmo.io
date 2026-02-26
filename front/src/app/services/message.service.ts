import { inject, Injectable } from "@angular/core";

import type { MessageListResponse } from "../core/api.models";
import { ApiClientService } from "../core/api-client.service";

@Injectable({ providedIn: "root" })
export class MessageService {
  private readonly api = inject(ApiClientService);

  listByProperty(propertyId: string, limit = 100): Promise<MessageListResponse> {
    return this.api.request<MessageListResponse>("GET", "/messages", {
      params: {
        propertyId,
        limit,
      },
    });
  }
}
