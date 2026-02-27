import { inject, Injectable } from "@angular/core";

import type { RunAIResponse, VocalListResponse, VocalResponse, VocalUploadRequest } from "../core/api.models";
import { ApiClientService } from "../core/api-client.service";

@Injectable({ providedIn: "root" })
export class VocalService {
  private readonly api = inject(ApiClientService);

  list(limit = 100): Promise<VocalListResponse> {
    return this.api.request<VocalListResponse>("GET", "/vocals", {
      params: { limit },
    });
  }

  upload(payload: VocalUploadRequest): Promise<VocalResponse> {
    return this.api.request<VocalResponse>("POST", "/vocals/upload", {
      body: payload,
    });
  }

  getById(vocalId: string): Promise<VocalResponse> {
    return this.api.request<VocalResponse>("GET", `/vocals/${encodeURIComponent(vocalId)}`);
  }

  enqueueTranscription(vocalId: string): Promise<RunAIResponse> {
    return this.api.request<RunAIResponse>(
      "POST",
      `/vocals/${encodeURIComponent(vocalId)}/transcribe`,
    );
  }
}
