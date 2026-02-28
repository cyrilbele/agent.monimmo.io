import { inject, Injectable } from "@angular/core";

import type {
  PropertyCreateRequest,
  PropertyListResponse,
  PropertyParticipantCreateRequest,
  PropertyParticipantResponse,
  PropertyPatchRequest,
  PropertyProspectCreateRequest,
  PropertyProspectListResponse,
  PropertyProspectResponse,
  PropertyComparablesResponse,
  PropertyRiskResponse,
  PropertyVisitCreateRequest,
  PropertyVisitListResponse,
  PropertyVisitPatchRequest,
  PropertyVisitResponse,
  PropertyResponse,
  PropertyStatus,
  ComparablePropertyType,
} from "../core/api.models";
import { ApiClientService } from "../core/api-client.service";

@Injectable({ providedIn: "root" })
export class PropertyService {
  private readonly api = inject(ApiClientService);

  list(limit = 100): Promise<PropertyListResponse> {
    return this.api.request<PropertyListResponse>("GET", "/properties", {
      params: { limit },
    });
  }

  getById(id: string): Promise<PropertyResponse> {
    return this.api.request<PropertyResponse>("GET", `/properties/${encodeURIComponent(id)}`);
  }

  create(payload: PropertyCreateRequest): Promise<PropertyResponse> {
    return this.api.request<PropertyResponse>("POST", "/properties", {
      body: payload,
    });
  }

  patch(id: string, payload: PropertyPatchRequest): Promise<PropertyResponse> {
    return this.api.request<PropertyResponse>("PATCH", `/properties/${encodeURIComponent(id)}`, {
      body: payload,
    });
  }

  updateStatus(id: string, status: PropertyStatus): Promise<PropertyResponse> {
    return this.api.request<PropertyResponse>(
      "PATCH",
      `/properties/${encodeURIComponent(id)}/status`,
      {
        body: { status },
      },
    );
  }

  addParticipant(
    propertyId: string,
    payload: PropertyParticipantCreateRequest,
  ): Promise<PropertyParticipantResponse> {
    return this.api.request<PropertyParticipantResponse>(
      "POST",
      `/properties/${encodeURIComponent(propertyId)}/participants`,
      {
        body: payload,
      },
    );
  }

  listProspects(propertyId: string): Promise<PropertyProspectListResponse> {
    return this.api.request<PropertyProspectListResponse>(
      "GET",
      `/properties/${encodeURIComponent(propertyId)}/prospects`,
    );
  }

  addProspect(
    propertyId: string,
    payload: PropertyProspectCreateRequest,
  ): Promise<PropertyProspectResponse> {
    return this.api.request<PropertyProspectResponse>(
      "POST",
      `/properties/${encodeURIComponent(propertyId)}/prospects`,
      {
        body: payload,
      },
    );
  }

  listVisits(propertyId: string): Promise<PropertyVisitListResponse> {
    return this.api.request<PropertyVisitListResponse>(
      "GET",
      `/properties/${encodeURIComponent(propertyId)}/visits`,
    );
  }

  addVisit(
    propertyId: string,
    payload: PropertyVisitCreateRequest,
  ): Promise<PropertyVisitResponse> {
    return this.api.request<PropertyVisitResponse>(
      "POST",
      `/properties/${encodeURIComponent(propertyId)}/visits`,
      {
        body: payload,
      },
    );
  }

  getVisitById(visitId: string): Promise<PropertyVisitResponse> {
    return this.api.request<PropertyVisitResponse>("GET", `/visits/${encodeURIComponent(visitId)}`);
  }

  patchVisitById(
    visitId: string,
    payload: PropertyVisitPatchRequest,
  ): Promise<PropertyVisitResponse> {
    return this.api.request<PropertyVisitResponse>("PATCH", `/visits/${encodeURIComponent(visitId)}`, {
      body: payload,
    });
  }

  getRisks(propertyId: string): Promise<PropertyRiskResponse> {
    return this.api.request<PropertyRiskResponse>(
      "GET",
      `/properties/${encodeURIComponent(propertyId)}/risks`,
    );
  }

  getComparables(
    propertyId: string,
    options?: { propertyType?: ComparablePropertyType; forceRefresh?: boolean },
  ): Promise<PropertyComparablesResponse> {
    return this.api.request<PropertyComparablesResponse>(
      "GET",
      `/properties/${encodeURIComponent(propertyId)}/comparables`,
      {
        params: {
          propertyType: options?.propertyType,
          forceRefresh: options?.forceRefresh,
        },
      },
    );
  }

  listCalendarVisits(from?: string, to?: string): Promise<PropertyVisitListResponse> {
    return this.api.request<PropertyVisitListResponse>("GET", "/visits", {
      params: { from, to },
    });
  }
}
