import { inject, Injectable } from "@angular/core";

import type {
  IntegrationConnectRequest,
  IntegrationPath,
  IntegrationResponse,
  IntegrationSyncRequest,
} from "../core/api.models";
import { ApiClientService } from "../core/api-client.service";

@Injectable({ providedIn: "root" })
export class IntegrationService {
  private readonly api = inject(ApiClientService);

  connect(path: IntegrationPath, payload: IntegrationConnectRequest): Promise<IntegrationResponse> {
    return this.api.request<IntegrationResponse>("POST", `/integrations/${path}/connect`, {
      body: payload,
    });
  }

  sync(path: IntegrationPath, payload: IntegrationSyncRequest): Promise<IntegrationResponse> {
    return this.api.request<IntegrationResponse>("POST", `/integrations/${path}/sync`, {
      body: payload,
    });
  }
}
