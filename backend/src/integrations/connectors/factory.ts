import {
  MockCalendarConnector,
  MockGmailConnector,
  MockWhatsAppConnector,
} from "./mock-connectors";
import type { CalendarConnector, GmailConnector, WhatsAppConnector } from "./types";

type EnvLike = Record<string, string | undefined>;

export type ConnectorRuntime = "mock";

export const resolveConnectorRuntime = (env: EnvLike): ConnectorRuntime => {
  const runtime = env.CONNECTOR_RUNTIME?.toLowerCase();
  if (runtime === "mock") {
    return "mock";
  }

  return "mock";
};

export const createGmailConnector = (env: EnvLike = process.env): GmailConnector => {
  const runtime = resolveConnectorRuntime(env);
  if (runtime === "mock") {
    return new MockGmailConnector();
  }

  return new MockGmailConnector();
};

export const createCalendarConnector = (env: EnvLike = process.env): CalendarConnector => {
  const runtime = resolveConnectorRuntime(env);
  if (runtime === "mock") {
    return new MockCalendarConnector();
  }

  return new MockCalendarConnector();
};

export const createWhatsAppConnector = (env: EnvLike = process.env): WhatsAppConnector => {
  const runtime = resolveConnectorRuntime(env);
  if (runtime === "mock") {
    return new MockWhatsAppConnector();
  }

  return new MockWhatsAppConnector();
};

let gmailConnectorSingleton: GmailConnector | null = null;
let calendarConnectorSingleton: CalendarConnector | null = null;
let whatsappConnectorSingleton: WhatsAppConnector | null = null;

export const getGmailConnector = (): GmailConnector => {
  gmailConnectorSingleton ??= createGmailConnector(process.env);
  return gmailConnectorSingleton;
};

export const getCalendarConnector = (): CalendarConnector => {
  calendarConnectorSingleton ??= createCalendarConnector(process.env);
  return calendarConnectorSingleton;
};

export const getWhatsAppConnector = (): WhatsAppConnector => {
  whatsappConnectorSingleton ??= createWhatsAppConnector(process.env);
  return whatsappConnectorSingleton;
};
