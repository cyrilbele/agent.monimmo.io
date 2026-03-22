import { inject, Injectable } from "@angular/core";

import type {
  AccountUserCreateRequest,
  AccountUserResponse,
  PropertyCreateRequest,
  PropertyListResponse,
  PropertyParticipantCreateRequest,
  PropertyParticipantResponse,
  PropertyPatchRequest,
  PropertyProspectCreateRequest,
  PropertyProspectListResponse,
  PropertyProspectResponse,
  PropertyComparablesResponse,
  PropertyValuationAIRequest,
  PropertyValuationAIPromptResponse,
  PropertyValuationAIResponse,
  PropertyRiskResponse,
  PropertyVisitCreateRequest,
  PropertyVisitListResponse,
  PropertyVisitPatchRequest,
  PropertyVisitResponse,
  CalendarAppointmentCreateRequest,
  CalendarAppointmentListResponse,
  CalendarAppointmentResponse,
  RdvListResponse,
  RdvResponse,
  PropertyResponse,
  PropertyStatus,
  ComparablePropertyType,
  AssistantObjectType,
  ObjectDataStructureResponse,
  ObjectChangeListResponse,
  LinkCreateRequest,
  LinkRelatedResponse,
  LinkResponse,
} from "../core/api.models";
import { ApiClientService } from "../core/api-client.service";

@Injectable({ providedIn: "root" })
export class PropertyService {
  private readonly api = inject(ApiClientService);

  private toProspectFromLink(
    propertyId: string,
    link: LinkResponse,
    user: AccountUserResponse,
  ): PropertyProspectResponse {
    const relationRoleRaw = link.params?.["relationRole"];
    const relationRole = typeof relationRoleRaw === "string" ? relationRoleRaw : "PROSPECT";

    return {
      id: link.id,
      propertyId,
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      address: user.address,
      postalCode: user.postalCode,
      city: user.city,
      relationRole,
      createdAt: link.createdAt,
    };
  }

  list(limit = 100, query?: string): Promise<PropertyListResponse> {
    const normalizedLimit = Number.isFinite(limit) ? Math.trunc(limit) : 100;
    const safeLimit = Math.min(100, Math.max(1, normalizedLimit || 100));

    return this.api.request<PropertyListResponse>("GET", "/properties", {
      params: { limit: safeLimit, q: query },
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
    const linkPayload: LinkCreateRequest = {
      typeLien: "bien_user",
      objectId1: propertyId,
      objectId2: payload.contactId,
      params: {
        relationRole: "PROSPECT",
      },
    };

    return this.api
      .request<LinkResponse>("POST", "/links", {
        body: linkPayload,
      })
      .then((link) => ({
        id: link.id,
        propertyId,
        contactId: payload.contactId,
        role: payload.role,
        createdAt: link.createdAt,
      }));
  }

  async listProspects(propertyId: string): Promise<PropertyProspectListResponse> {
    const related = await this.api.request<LinkRelatedResponse>(
      "GET",
      `/links/related/bien/${encodeURIComponent(propertyId)}`,
    );

    const items = related.items
      .filter(
        (item): item is LinkRelatedResponse["items"][number] & { otherSide: AccountUserResponse } =>
          item.otherSideObjectType === "user" &&
          !!item.otherSide &&
          typeof item.otherSide === "object" &&
          !Array.isArray(item.otherSide) &&
          typeof (item.otherSide as { id?: unknown }).id === "string",
      )
      .map((item) => this.toProspectFromLink(propertyId, item.link, item.otherSide));

    return { items };
  }

  async addProspect(
    propertyId: string,
    payload: PropertyProspectCreateRequest,
  ): Promise<PropertyProspectResponse> {
    let user: AccountUserResponse;

    if (payload.userId) {
      user = await this.api.request<AccountUserResponse>(
        "GET",
        `/users/${encodeURIComponent(payload.userId)}`,
      );
    } else if (payload.newClient) {
      const createUserPayload: AccountUserCreateRequest = {
        firstName: payload.newClient.firstName,
        lastName: payload.newClient.lastName,
        phone: payload.newClient.phone,
        email: payload.newClient.email,
        address: payload.newClient.address ?? null,
        postalCode: payload.newClient.postalCode ?? null,
        city: payload.newClient.city ?? null,
        accountType: "CLIENT",
      };
      user = await this.api.request<AccountUserResponse>("POST", "/users", {
        body: createUserPayload,
      });
    } else {
      throw new Error("userId ou newClient est obligatoire.");
    }

    const link = await this.api.request<LinkResponse>("POST", "/links", {
      body: {
        typeLien: "bien_user",
        objectId1: propertyId,
        objectId2: user.id,
        params: {
          relationRole: payload.relationRole ?? "PROSPECT",
        },
      },
    });

    return this.toProspectFromLink(propertyId, link, user);
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

  runValuationAnalysis(
    propertyId: string,
    payload?: PropertyValuationAIRequest,
  ): Promise<PropertyValuationAIResponse> {
    return this.api.request<PropertyValuationAIResponse>(
      "POST",
      `/properties/${encodeURIComponent(propertyId)}/valuation-ai`,
      {
        body: payload ?? {},
      },
    );
  }

  generateValuationPrompt(
    propertyId: string,
    payload?: PropertyValuationAIRequest,
  ): Promise<PropertyValuationAIPromptResponse> {
    return this.api.request<PropertyValuationAIPromptResponse>(
      "POST",
      `/properties/${encodeURIComponent(propertyId)}/valuation-ai/prompt`,
      {
        body: payload ?? {},
      },
    );
  }

  listCalendarVisits(from?: string, to?: string): Promise<PropertyVisitListResponse> {
    return this.api.request<PropertyVisitListResponse>("GET", "/visits", {
      params: { from, to },
    });
  }

  listCalendarAppointments(
    from?: string,
    to?: string,
  ): Promise<CalendarAppointmentListResponse> {
    return this.api.request<CalendarAppointmentListResponse>("GET", "/calendar-events", {
      params: { from, to },
    });
  }

  getCalendarAppointmentById(appointmentId: string): Promise<CalendarAppointmentResponse> {
    return this.api.request<CalendarAppointmentResponse>(
      "GET",
      `/calendar-events/${encodeURIComponent(appointmentId)}`,
    );
  }

  listRdv(from?: string, to?: string): Promise<RdvListResponse> {
    return this.api.request<RdvListResponse>("GET", "/rdv", {
      params: { from, to },
    });
  }

  getRdvById(rdvId: string): Promise<RdvResponse> {
    return this.api.request<RdvResponse>("GET", `/rdv/${encodeURIComponent(rdvId)}`);
  }

  createCalendarAppointment(
    payload: CalendarAppointmentCreateRequest,
  ): Promise<CalendarAppointmentResponse> {
    return this.api.request<CalendarAppointmentResponse>("POST", "/calendar-events", {
      body: payload,
    });
  }

  getDataStructure(objectType: AssistantObjectType): Promise<ObjectDataStructureResponse> {
    return this.api.request<ObjectDataStructureResponse>(
      "GET",
      `/data-structure/${encodeURIComponent(objectType)}`,
    );
  }

  listObjectChanges(
    objectType: AssistantObjectType,
    objectId: string,
    limit = 200,
  ): Promise<ObjectChangeListResponse> {
    const normalizedLimit = Number.isFinite(limit) ? Math.trunc(limit) : 200;
    const safeLimit = Math.min(500, Math.max(1, normalizedLimit || 200));

    return this.api.request<ObjectChangeListResponse>(
      "GET",
      `/object-changes/${encodeURIComponent(objectType)}/${encodeURIComponent(objectId)}`,
      {
        params: {
          limit: safeLimit,
        },
      },
    );
  }
}
