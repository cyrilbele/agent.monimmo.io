import { inject, Injectable } from "@angular/core";

import type {
  AccountType,
  AccountUserCreateRequest,
  AccountUserListResponse,
  AccountUserPatchRequest,
  AccountUserDetailResponse,
} from "../core/api.models";
import { ApiClientService } from "../core/api-client.service";

@Injectable({ providedIn: "root" })
export class UserService {
  private readonly api = inject(ApiClientService);

  list(limit = 100, query?: string, accountType?: AccountType): Promise<AccountUserListResponse> {
    const normalizedLimit = Number.isFinite(limit) ? Math.trunc(limit) : 100;
    const safeLimit = Math.min(100, Math.max(1, normalizedLimit || 100));

    return this.api.request<AccountUserListResponse>("GET", "/users", {
      params: { limit: safeLimit, q: query, accountType },
    });
  }

  getById(id: string): Promise<AccountUserDetailResponse> {
    return this.api.request<AccountUserDetailResponse>(
      "GET",
      `/users/${encodeURIComponent(id)}`,
    );
  }

  create(payload: AccountUserCreateRequest): Promise<AccountUserDetailResponse> {
    return this.api.request<AccountUserDetailResponse>("POST", "/users", {
      body: payload,
    });
  }

  patch(id: string, payload: AccountUserPatchRequest): Promise<AccountUserDetailResponse> {
    return this.api.request<AccountUserDetailResponse>(
      "PATCH",
      `/users/${encodeURIComponent(id)}`,
      {
        body: payload,
      },
    );
  }
}
