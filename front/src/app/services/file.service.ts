import { inject, Injectable } from "@angular/core";

import type {
  FileDownloadUrlResponse,
  FileListResponse,
  FileResponse,
  FileUploadRequest,
} from "../core/api.models";
import { ApiClientService } from "../core/api-client.service";

@Injectable({ providedIn: "root" })
export class FileService {
  private readonly api = inject(ApiClientService);

  listByProperty(propertyId: string, limit = 100): Promise<FileListResponse> {
    return this.api.request<FileListResponse>("GET", "/files", {
      params: {
        propertyId,
        limit,
      },
    });
  }

  upload(payload: FileUploadRequest): Promise<FileResponse> {
    return this.api.request<FileResponse>("POST", "/files/upload", {
      body: payload,
    });
  }

  getDownloadUrl(fileId: string): Promise<FileDownloadUrlResponse> {
    return this.api.request<FileDownloadUrlResponse>(
      "GET",
      `/files/${encodeURIComponent(fileId)}/download-url`,
    );
  }
}
