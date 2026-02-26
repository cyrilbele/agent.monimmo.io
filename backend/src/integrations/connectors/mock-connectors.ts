import type {
  CalendarConnector,
  ConnectInput,
  GmailConnector,
  ImportedCalendarEvent,
  ImportedMessage,
  OAuthTokenSet,
  WhatsAppConnector,
} from "./types";

const tokenSet = (provider: string, input: ConnectInput): OAuthTokenSet => {
  const suffix = input.code || "demo_code";
  return {
    accessToken: `${provider.toLowerCase()}_access_${suffix}`,
    refreshToken: `${provider.toLowerCase()}_refresh_${suffix}`,
    expiresAt: new Date(Date.now() + 3600 * 1000),
  };
};

const paginate = <T>(items: T[], cursor?: string, pageSize = 2) => {
  const start = cursor ? Number(cursor) : 0;
  if (Number.isNaN(start) || start < 0) {
    return { chunk: items.slice(0, pageSize), nextCursor: String(pageSize) };
  }

  const chunk = items.slice(start, start + pageSize);
  const next = start + pageSize;
  return {
    chunk,
    nextCursor: next < items.length ? String(next) : null,
  };
};

const gmailMessages: ImportedMessage[] = [
  {
    externalId: "gmail_msg_1",
    subject: "Appartement Lyon 69003",
    body: "Bonjour, je souhaite visiter l'appartement T3 lumineux à Lyon 69003.",
    receivedAt: new Date("2026-02-20T10:00:00.000Z"),
    attachments: [
      {
        externalId: "gmail_att_1",
        fileName: "dpe-lyon.pdf",
        mimeType: "application/pdf",
        size: 12345,
      },
    ],
  },
  {
    externalId: "gmail_msg_2",
    subject: "Question mandat",
    body: "Pouvez-vous partager le mandat signé et la taxe foncière ?",
    receivedAt: new Date("2026-02-21T10:00:00.000Z"),
    attachments: [
      {
        externalId: "gmail_att_2",
        fileName: "mandat-vente-signe.pdf",
        mimeType: "application/pdf",
        size: 22345,
      },
      {
        externalId: "gmail_att_3",
        fileName: "taxe-fonciere-2025.pdf",
        mimeType: "application/pdf",
        size: 12345,
      },
    ],
  },
  {
    externalId: "gmail_msg_3",
    subject: "Offre d'achat",
    body: "Je peux proposer 345000 euros si la visite se passe bien.",
    receivedAt: new Date("2026-02-22T10:00:00.000Z"),
    attachments: [],
  },
];

const whatsappMessages: ImportedMessage[] = [
  {
    externalId: "wa_msg_1",
    body: "Bonjour, disponible pour visite demain ?",
    receivedAt: new Date("2026-02-20T14:00:00.000Z"),
    attachments: [],
  },
  {
    externalId: "wa_msg_2",
    body: "Je vous envoie la pièce d'identité",
    receivedAt: new Date("2026-02-21T14:00:00.000Z"),
    attachments: [
      {
        externalId: "wa_att_1",
        fileName: "piece-identite-client.jpg",
        mimeType: "image/jpeg",
        size: 156000,
      },
    ],
  },
];

const calendarEvents: ImportedCalendarEvent[] = [
  {
    externalId: "cal_evt_1",
    title: "Visite Appartement T3",
    startsAt: new Date("2026-02-23T09:00:00.000Z"),
    endsAt: new Date("2026-02-23T09:30:00.000Z"),
    payload: { source: "google" },
  },
  {
    externalId: "cal_evt_2",
    title: "Signature compromis",
    startsAt: new Date("2026-02-24T15:00:00.000Z"),
    endsAt: new Date("2026-02-24T16:00:00.000Z"),
    payload: { source: "google" },
  },
];

export class MockGmailConnector implements GmailConnector {
  async exchangeCodeForTokens(input: ConnectInput): Promise<OAuthTokenSet> {
    return tokenSet("GMAIL", input);
  }

  async syncMessages(input: { cursor?: string; accessToken: string }) {
    const { chunk, nextCursor } = paginate(gmailMessages, input.cursor);
    return {
      nextCursor,
      messages: chunk,
    };
  }
}

export class MockCalendarConnector implements CalendarConnector {
  async exchangeCodeForTokens(input: ConnectInput): Promise<OAuthTokenSet> {
    return tokenSet("GOOGLE_CALENDAR", input);
  }

  async syncEvents(input: { cursor?: string; accessToken: string }) {
    const { chunk, nextCursor } = paginate(calendarEvents, input.cursor);
    return {
      nextCursor,
      events: chunk,
    };
  }
}

export class MockWhatsAppConnector implements WhatsAppConnector {
  async exchangeCodeForTokens(input: ConnectInput): Promise<OAuthTokenSet> {
    return tokenSet("WHATSAPP", input);
  }

  async syncMessages(input: { cursor?: string; accessToken: string }) {
    const { chunk, nextCursor } = paginate(whatsappMessages, input.cursor);
    return {
      nextCursor,
      messages: chunk,
    };
  }
}
