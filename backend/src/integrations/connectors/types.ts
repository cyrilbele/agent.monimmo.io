export type OAuthTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
};

export type IntegrationProvider = "GMAIL" | "GOOGLE_CALENDAR" | "WHATSAPP";

export type ConnectInput = {
  code: string;
  redirectUri?: string;
};

export type ImportedAttachment = {
  externalId: string;
  fileName: string;
  mimeType: string;
  size: number;
};

export type ImportedMessage = {
  externalId: string;
  subject?: string;
  body: string;
  receivedAt: Date;
  attachments: ImportedAttachment[];
};

export type ImportedCalendarEvent = {
  externalId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  payload?: Record<string, unknown>;
};

export interface GmailConnector {
  exchangeCodeForTokens(input: ConnectInput): Promise<OAuthTokenSet>;
  syncMessages(input: {
    cursor?: string;
    accessToken: string;
  }): Promise<{ nextCursor: string | null; messages: ImportedMessage[] }>;
}

export interface CalendarConnector {
  exchangeCodeForTokens(input: ConnectInput): Promise<OAuthTokenSet>;
  syncEvents(input: {
    cursor?: string;
    accessToken: string;
  }): Promise<{ nextCursor: string | null; events: ImportedCalendarEvent[] }>;
}

export interface WhatsAppConnector {
  exchangeCodeForTokens(input: ConnectInput): Promise<OAuthTokenSet>;
  syncMessages(input: {
    cursor?: string;
    accessToken: string;
  }): Promise<{ nextCursor: string | null; messages: ImportedMessage[] }>;
}
