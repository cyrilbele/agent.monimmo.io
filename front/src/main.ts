import {
  MIN_PASSWORD_LENGTH,
  isEmailValid,
  normalizeApiBaseUrl,
  renderAuthContent,
  validateRegisterForm,
  validateResetForm,
  type RegisterFormData,
  type ResetFormData,
} from "./auth";

type FeedbackTone = "info" | "success" | "error";
type AppPage = "kanban" | "property-create" | "property-detail" | "config";

type RouteState =
  | {
      scope: "auth";
      hash: string;
    }
  | {
      scope: "app";
      page: AppPage;
      propertyId?: string;
    };

interface ErrorResponse {
  message?: string;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user?: {
    email?: string;
  };
}

interface ApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

interface PropertyResponse {
  id: string;
  title: string;
  city: string;
  postalCode: string;
  address?: string | null;
  price?: number | null;
  status: PropertyStatus;
  createdAt: string;
  updatedAt: string;
}

interface PropertyListResponse {
  items: PropertyResponse[];
  nextCursor?: string | null;
}

interface MessageResponse {
  id: string;
  channel: "GMAIL" | "WHATSAPP" | "TELEGRAM";
  propertyId?: string | null;
  subject?: string | null;
  body: string;
  fileIds?: string[];
  aiStatus: "PENDING" | "PROCESSED" | "REVIEW_REQUIRED";
  receivedAt: string;
}

interface MessageListResponse {
  items: MessageResponse[];
  nextCursor?: string | null;
}

interface FileResponse {
  id: string;
  propertyId?: string | null;
  typeDocument?: string | null;
  fileName: string;
  mimeType: string;
  size: number;
  status: string;
  storageKey: string;
  createdAt: string;
}

interface FileListResponse {
  items: FileResponse[];
  nextCursor?: string | null;
}

interface PropertyParticipantResponse {
  id: string;
  propertyId: string;
  contactId: string;
  role: ParticipantRole;
  createdAt: string;
}

interface IntegrationResponse {
  provider: "GMAIL" | "GOOGLE_CALENDAR" | "WHATSAPP";
  status: "CONNECTED" | "SYNC_QUEUED";
  connectedAt?: string | null;
  lastSyncedAt?: string | null;
}

interface TimelineItem {
  at: string;
  title: string;
  description: string;
}

type PropertyStatus =
  | "PROSPECTION"
  | "MANDAT_SIGNE"
  | "EN_DIFFUSION"
  | "VISITES"
  | "OFFRES"
  | "COMPROMIS"
  | "VENDU"
  | "ARCHIVE";

type ParticipantRole =
  | "VENDEUR"
  | "ACHETEUR"
  | "LOCATAIRE"
  | "NOTAIRE"
  | "ARTISAN"
  | "AUTRE";

const TYPE_DOCUMENT_OPTIONS = [
  "PIECE_IDENTITE",
  "LIVRET_FAMILLE",
  "CONTRAT_MARIAGE_PACS",
  "JUGEMENT_DIVORCE",
  "TITRE_PROPRIETE",
  "ATTESTATION_NOTARIALE",
  "TAXE_FONCIERE",
  "REFERENCE_CADASTRALE",
  "MANDAT_VENTE_SIGNE",
  "BON_VISITE",
  "OFFRE_ACHAT_SIGNEE",
  "DPE",
  "AMIANTE",
  "PLOMB",
  "ELECTRICITE",
  "GAZ",
  "TERMITES",
  "ERP_ETAT_RISQUES",
  "ASSAINISSEMENT",
  "LOI_CARREZ",
  "REGLEMENT_COPROPRIETE",
  "ETAT_DESCRIPTIF_DIVISION",
  "PV_AG_3_DERNIERES_ANNEES",
  "MONTANT_CHARGES",
  "CARNET_ENTRETIEN",
  "FICHE_SYNTHETIQUE",
  "PRE_ETAT_DATE",
  "ETAT_DATE",
  "PHOTOS_HD",
  "VIDEO_VISITE",
  "PLAN_BIEN",
  "ANNONCE_IMMOBILIERE",
  "AFFICHE_VITRINE",
  "REPORTING_VENDEUR",
  "SIMULATION_FINANCEMENT",
  "ATTESTATION_CAPACITE_EMPRUNT",
  "ACCORD_PRINCIPE_BANCAIRE",
  "COMPROMIS_OU_PROMESSE",
  "ANNEXES_COMPROMIS",
  "PREUVE_SEQUESTRE",
  "COURRIER_RETRACTATION",
  "LEVEE_CONDITIONS_SUSPENSIVES",
  "ACTE_AUTHENTIQUE",
  "DECOMPTE_NOTAIRE",
] as const;

type TypeDocument = (typeof TYPE_DOCUMENT_OPTIONS)[number];

const PROPERTY_STATUS_ORDER: PropertyStatus[] = [
  "PROSPECTION",
  "MANDAT_SIGNE",
  "EN_DIFFUSION",
  "VISITES",
  "OFFRES",
  "COMPROMIS",
  "VENDU",
  "ARCHIVE",
];

const PROPERTY_FLOW_STATUSES: PropertyStatus[] = [
  "PROSPECTION",
  "MANDAT_SIGNE",
  "EN_DIFFUSION",
  "VISITES",
  "OFFRES",
  "COMPROMIS",
  "VENDU",
];

const PARTICIPANT_ROLE_OPTIONS: ParticipantRole[] = [
  "VENDEUR",
  "ACHETEUR",
  "LOCATAIRE",
  "NOTAIRE",
  "ARTISAN",
  "AUTRE",
];

const STATUS_LABELS: Record<PropertyStatus, string> = {
  PROSPECTION: "Prospection",
  MANDAT_SIGNE: "Mandat signé",
  EN_DIFFUSION: "En diffusion",
  VISITES: "Visites",
  OFFRES: "Offres",
  COMPROMIS: "Compromis",
  VENDU: "Vendu",
  ARCHIVE: "Archivé",
};

const PARTICIPANT_LABELS: Record<ParticipantRole, string> = {
  VENDEUR: "Vendeur",
  ACHETEUR: "Acheteur",
  LOCATAIRE: "Locataire",
  NOTAIRE: "Notaire",
  ARTISAN: "Artisan",
  AUTRE: "Autre",
};

const API_BASE_URL = normalizeApiBaseUrl(
  (globalThis as { MONIMMO_API_BASE_URL?: string }).MONIMMO_API_BASE_URL,
);

const ACCESS_TOKEN_STORAGE_KEY = "monimmo.accessToken";
const REFRESH_TOKEN_STORAGE_KEY = "monimmo.refreshToken";
const SESSION_EMAIL_STORAGE_KEY = "monimmo.userEmail";
const PARTICIPANTS_PREFIX = "monimmo.participants.";

let renderSequence = 0;

const APP_STYLE = `
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Fraunces:wght@500;700&family=Space+Grotesk:wght@400;500;700&display=swap");

    :root {
      --bg-1: #f6f3e6;
      --bg-2: #f3b57a;
      --bg-3: #e7f1de;
      --ink: #1f2933;
      --muted: #51606f;
      --card: #fffdf8;
      --line: #d2d8cc;
      --accent: #d54f2f;
      --accent-hover: #b63f25;
      --success: #127c56;
      --error: #a52d2d;
      --shadow: 0 20px 40px rgba(17, 24, 39, 0.12);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: "Space Grotesk", "Avenir Next", "Segoe UI", sans-serif;
      color: var(--ink);
      min-height: 100vh;
      background:
        radial-gradient(90rem 60rem at 0% 0%, #ffe8d3 0%, transparent 60%),
        radial-gradient(90rem 60rem at 100% 100%, #d7f0de 0%, transparent 55%),
        linear-gradient(130deg, var(--bg-1), var(--bg-2) 45%, var(--bg-3));
      animation: fade-in 500ms ease-out;
    }

    #app {
      min-height: 100vh;
    }

    .auth-shell {
      width: min(1060px, 94vw);
      margin: 0 auto;
      min-height: 100vh;
      display: grid;
      gap: 1.25rem;
      padding: 2rem 0;
      grid-template-columns: 1.05fr 1fr;
      align-items: center;
    }

    .hero {
      padding: 2rem;
      animation: slide-up 450ms ease-out;
    }

    .eyebrow {
      margin: 0 0 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      color: var(--muted);
      font-size: 0.72rem;
      font-weight: 700;
    }

    .hero h1 {
      font-family: "Fraunces", "Times New Roman", serif;
      margin: 0;
      font-size: clamp(2rem, 4vw, 3.6rem);
      line-height: 1.05;
      max-width: 16ch;
    }

    .panel {
      background: color-mix(in srgb, var(--card) 90%, white);
      border: 1px solid var(--line);
      border-radius: 24px;
      box-shadow: var(--shadow);
      padding: 1.5rem;
      animation: slide-up 540ms ease-out;
    }

    .auth-form {
      display: grid;
      gap: 0.85rem;
      margin-top: 0.75rem;
    }

    .auth-form h2,
    .card-title,
    .section-title {
      margin: 0;
      font-family: "Fraunces", "Times New Roman", serif;
    }

    .auth-form h2 {
      font-size: 1.55rem;
    }

    .auth-form p,
    .muted {
      margin: 0;
      color: var(--muted);
      line-height: 1.45;
    }

    .field {
      display: grid;
      gap: 0.4rem;
    }

    .field label {
      font-size: 0.82rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
      color: var(--muted);
    }

    input,
    select,
    textarea {
      width: 100%;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.84);
      padding: 0.78rem 0.9rem;
      font-size: 1rem;
      font: inherit;
      transition: border-color 160ms ease, box-shadow 160ms ease;
    }

    input:focus,
    select:focus,
    textarea:focus {
      border-color: color-mix(in srgb, var(--accent) 55%, black);
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent);
      outline: none;
    }

    .double-field {
      display: grid;
      gap: 0.75rem;
      grid-template-columns: 1fr 1fr;
    }

    .actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-top: 0.4rem;
      flex-wrap: wrap;
    }

    button,
    .button-link {
      border: 0;
      cursor: pointer;
      border-radius: 12px;
      padding: 0.66rem 0.95rem;
      font: inherit;
      font-weight: 700;
      background: var(--accent);
      color: white;
      text-decoration: none;
      transition: background 150ms ease, transform 150ms ease;
    }

    button:hover:enabled,
    .button-link:hover {
      background: var(--accent-hover);
      transform: translateY(-1px);
    }

    button:disabled {
      opacity: 0.75;
      cursor: wait;
      transform: none;
    }

    .button-ghost {
      background: white;
      color: var(--ink);
      border: 1px solid var(--line);
    }

    .button-ghost:hover {
      background: #f7f9fb;
      border-color: color-mix(in srgb, var(--ink) 12%, var(--line));
    }

    .inline-link {
      color: var(--accent);
      font-weight: 700;
      text-decoration: none;
    }

    .inline-link:hover {
      text-decoration: underline;
    }

    .feedback {
      min-height: 1.4rem;
      margin: 0.2rem 0 0;
      font-weight: 600;
      color: var(--muted);
    }

    .feedback.success {
      color: var(--success);
    }

    .feedback.error {
      color: var(--error);
    }

    .stack {
      display: grid;
      gap: 1rem;
    }

    .app-shell {
      width: min(1240px, 95vw);
      margin: 0 auto;
      min-height: 100vh;
      padding: 1.2rem 0 2.2rem;
      display: grid;
      gap: 0.95rem;
      align-content: start;
    }

    .app-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.75rem;
      padding: 0.8rem 0.95rem;
      background: rgba(255, 255, 255, 0.72);
      border: 1px solid var(--line);
      border-radius: 18px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(8px);
    }

    .app-brand {
      display: grid;
      gap: 0.12rem;
    }

    .app-brand h2 {
      margin: 0;
      font-family: "Fraunces", "Times New Roman", serif;
      font-size: 1.2rem;
    }

    .app-brand p {
      margin: 0;
      color: var(--muted);
      font-size: 0.86rem;
    }

    .app-controls {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      flex-wrap: wrap;
    }

    .app-nav {
      display: flex;
      gap: 0.45rem;
      flex-wrap: wrap;
    }

    .app-nav a {
      text-decoration: none;
      color: var(--muted);
      font-weight: 700;
      border-radius: 999px;
      border: 1px solid transparent;
      padding: 0.46rem 0.86rem;
      transition: all 160ms ease;
      background: rgba(255, 255, 255, 0.5);
    }

    .app-nav a:hover {
      border-color: var(--line);
      color: var(--ink);
    }

    .app-nav a.is-active {
      color: var(--accent);
      border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
      background: color-mix(in srgb, var(--accent) 9%, white);
    }

    .app-content {
      background: color-mix(in srgb, var(--card) 90%, white);
      border: 1px solid var(--line);
      border-radius: 22px;
      box-shadow: var(--shadow);
      padding: 1.2rem;
      animation: slide-up 450ms ease-out;
    }

    .page-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.7rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }

    .page-head h2 {
      margin: 0;
      font-family: "Fraunces", "Times New Roman", serif;
      font-size: 1.5rem;
    }

    .kanban-grid {
      display: grid;
      gap: 0.75rem;
      grid-template-columns: repeat(4, minmax(240px, 1fr));
      overflow-x: auto;
      padding-bottom: 0.4rem;
    }

    .kanban-column {
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.7);
      border-radius: 16px;
      padding: 0.7rem;
      min-height: 220px;
      display: grid;
      gap: 0.55rem;
      align-content: start;
    }

    .kanban-column.drop-active {
      border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
      box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent);
    }

    .kanban-column h3 {
      margin: 0;
      font-size: 0.98rem;
      font-family: "Fraunces", "Times New Roman", serif;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.4rem;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1.7rem;
      height: 1.7rem;
      border-radius: 999px;
      font-size: 0.78rem;
      background: rgba(0, 0, 0, 0.07);
      color: var(--muted);
      font-weight: 700;
      padding: 0 0.45rem;
    }

    .property-card {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: white;
      padding: 0.65rem;
      display: grid;
      gap: 0.45rem;
      cursor: grab;
    }

    .property-card:active {
      cursor: grabbing;
    }

    .property-card.is-dragging {
      opacity: 0.55;
    }

    .property-card a {
      color: inherit;
      text-decoration: none;
      font-weight: 700;
    }

    .property-card a:hover {
      color: var(--accent);
    }

    .meta {
      color: var(--muted);
      font-size: 0.84rem;
    }

    .drag-hint {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: fit-content;
      font-size: 0.75rem;
      padding: 0.16rem 0.5rem;
      border-radius: 999px;
      color: var(--muted);
      background: color-mix(in srgb, var(--line) 40%, white);
    }

    .status-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }

    .status-actions-feedback {
      min-height: 1.3rem;
      margin-top: 0.2rem;
      color: var(--muted);
      font-weight: 600;
    }

    .status-actions-feedback.success {
      color: var(--success);
    }

    .status-actions-feedback.error {
      color: var(--error);
    }

    .button-success {
      background: #147a4b;
    }

    .button-success:hover:enabled {
      background: #0f663e;
    }

    .button-warning {
      background: #d47d1a;
    }

    .button-warning:hover:enabled {
      background: #b56710;
    }

    .button-neutral {
      background: #6c7680;
    }

    .button-neutral:hover:enabled {
      background: #5a646d;
    }

    .split {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 0.9fr);
      gap: 1rem;
    }

    .card {
      border: 1px solid var(--line);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.74);
      padding: 0.9rem;
      display: grid;
      gap: 0.65rem;
      align-content: start;
    }

    .card-title {
      font-size: 1.2rem;
    }

    .timeline {
      display: grid;
      gap: 0.52rem;
    }

    .timeline-item {
      border-left: 3px solid color-mix(in srgb, var(--accent) 40%, var(--line));
      background: white;
      border-radius: 0 12px 12px 0;
      padding: 0.55rem 0.65rem;
      display: grid;
      gap: 0.18rem;
    }

    .timeline-item strong {
      font-size: 0.94rem;
    }

    .participants,
    .documents,
    .integration-grid {
      display: grid;
      gap: 0.6rem;
    }

    .participant-item,
    .document-item {
      border: 1px solid var(--line);
      border-radius: 12px;
      background: white;
      padding: 0.55rem 0.65rem;
      font-size: 0.9rem;
      display: grid;
      gap: 0.2rem;
    }

    .integration-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .integration-card {
      border: 1px solid var(--line);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.8);
      padding: 0.85rem;
      display: grid;
      gap: 0.75rem;
      align-content: start;
    }

    .integration-card h3 {
      margin: 0;
      font-family: "Fraunces", "Times New Roman", serif;
      font-size: 1.1rem;
    }

    .integration-card form {
      display: grid;
      gap: 0.45rem;
    }

    .empty-state {
      border: 1px dashed var(--line);
      border-radius: 12px;
      padding: 0.8rem;
      color: var(--muted);
      font-size: 0.9rem;
      background: rgba(255, 255, 255, 0.54);
    }

    .top-actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    @media (max-width: 1060px) {
      .kanban-grid {
        grid-template-columns: repeat(2, minmax(220px, 1fr));
      }

      .integration-grid {
        grid-template-columns: 1fr;
      }

      .split {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 900px) {
      .auth-shell {
        grid-template-columns: 1fr;
        padding: 1.3rem 0;
      }

      .hero {
        padding: 1rem 0.8rem 0.2rem;
      }

      .panel,
      .app-content {
        padding: 1rem;
      }

      .double-field {
        grid-template-columns: 1fr;
      }

      .kanban-grid {
        grid-template-columns: 1fr;
      }
    }

    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slide-up {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
`;

const parseRoute = (hash: string): RouteState => {
  const cleaned = hash.trim().split("?")[0].toLowerCase();

  if (cleaned === "#/app" || cleaned === "#/app/kanban") {
    return { scope: "app", page: "kanban" };
  }

  if (cleaned === "#/app/bien/nouveau") {
    return { scope: "app", page: "property-create" };
  }

  if (cleaned.startsWith("#/app/bien/")) {
    const propertyId = decodeURIComponent(hash.slice("#/app/bien/".length).split("?")[0]);
    return { scope: "app", page: "property-detail", propertyId };
  }

  if (cleaned === "#/app/configuration") {
    return { scope: "app", page: "config" };
  }

  return { scope: "auth", hash };
};

const formatDate = (isoDate: string): string => {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return "Date inconnue";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
};

const formatPrice = (price?: number | null): string => {
  if (price === null || price === undefined) {
    return "Prix non renseigné";
  }

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
};

const isErrorResponse = (value: unknown): value is ErrorResponse => {
  return Boolean(
    value &&
      typeof value === "object" &&
      "message" in value &&
      typeof (value as { message?: unknown }).message === "string",
  );
};

const isAuthResponse = (value: unknown): value is AuthResponse => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { accessToken?: unknown; refreshToken?: unknown };
  return (
    typeof candidate.accessToken === "string" &&
    typeof candidate.refreshToken === "string"
  );
};

const getAccessToken = (): string | null => {
  if (typeof localStorage === "undefined") {
    return null;
  }

  return localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
};

const getSessionEmail = (): string => {
  if (typeof localStorage === "undefined") {
    return "Session locale";
  }

  return localStorage.getItem(SESSION_EMAIL_STORAGE_KEY) ?? "Session locale";
};

const saveAuthSession = (payload: AuthResponse): void => {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, payload.accessToken);
  localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, payload.refreshToken);

  if (payload.user?.email) {
    localStorage.setItem(SESSION_EMAIL_STORAGE_KEY, payload.user.email);
  }
};

const clearAuthSession = (): void => {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  localStorage.removeItem(SESSION_EMAIL_STORAGE_KEY);
};

const participantsStorageKey = (propertyId: string): string =>
  `${PARTICIPANTS_PREFIX}${propertyId}`;

const readPersistedList = <T>(key: string): T[] => {
  if (typeof localStorage === "undefined") {
    return [];
  }

  const raw = localStorage.getItem(key);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
};

const writePersistedList = <T>(key: string, values: T[]): void => {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(key, JSON.stringify(values));
};

const appendPersistedItem = <T extends { id: string }>(key: string, item: T): T[] => {
  const existing = readPersistedList<T>(key);
  const deduplicated = [item, ...existing.filter((entry) => entry.id !== item.id)];
  writePersistedList(key, deduplicated);
  return deduplicated;
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatTypeDocumentLabel = (typeDocument: string): string => {
  return typeDocument
    .split("_")
    .map((chunk) => {
      const lowered = chunk.toLowerCase();
      return lowered.charAt(0).toUpperCase() + lowered.slice(1);
    })
    .join(" ");
};

const getPreviousStatus = (status: PropertyStatus): PropertyStatus | null => {
  if (status === "ARCHIVE") {
    return "VENDU";
  }

  const index = PROPERTY_FLOW_STATUSES.indexOf(status);
  if (index <= 0) {
    return null;
  }

  return PROPERTY_FLOW_STATUSES[index - 1] ?? null;
};

const getNextStatus = (status: PropertyStatus): PropertyStatus | null => {
  if (status === "ARCHIVE") {
    return null;
  }

  const index = PROPERTY_FLOW_STATUSES.indexOf(status);
  if (index < 0 || index >= PROPERTY_FLOW_STATUSES.length - 1) {
    return null;
  }

  return PROPERTY_FLOW_STATUSES[index + 1] ?? null;
};

const fileToBase64 = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";

  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const apiRequest = async <T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  payload?: Record<string, unknown>,
  options?: { auth?: boolean },
): Promise<ApiResult<T>> => {
  const requiresAuth = options?.auth !== false;
  const headers: Record<string, string> = {};

  if (payload !== undefined) {
    headers["content-type"] = "application/json";
  }

  if (requiresAuth) {
    const token = getAccessToken();
    if (!token) {
      return {
        ok: false,
        status: 401,
        error: "Session expirée. Reconnectez-vous.",
      };
    }

    headers.authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
    });

    const contentType = response.headers.get("content-type") ?? "";
    const hasJson = contentType.includes("application/json");
    let data: unknown;

    if (hasJson) {
      data = await response.json();
    }

    if (!response.ok) {
      if (response.status === 401 && requiresAuth) {
        clearAuthSession();
      }

      const message = isErrorResponse(data)
        ? data.message ?? "Une erreur est survenue."
        : `Requête refusée (${response.status}).`;

      return {
        ok: false,
        status: response.status,
        error: message,
      };
    }

    return {
      ok: true,
      status: response.status,
      data: data as T | undefined,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      error:
        "Impossible de joindre l'API. Vérifiez que le backend est démarré sur http://localhost:3000.",
    };
  }
};

const setFeedback = (
  form: HTMLFormElement,
  message: string,
  tone: FeedbackTone,
): void => {
  const feedback = form.querySelector<HTMLElement>("[data-feedback]");
  if (!feedback) {
    return;
  }

  feedback.textContent = message;
  feedback.classList.remove("success", "error");

  if (tone === "success") {
    feedback.classList.add("success");
  } else if (tone === "error") {
    feedback.classList.add("error");
  }
};

const setFormLoading = (form: HTMLFormElement, isLoading: boolean): void => {
  const submitButton = form.querySelector<HTMLButtonElement>("button[type='submit']");
  if (!submitButton) {
    return;
  }

  if (!submitButton.dataset.defaultLabel) {
    submitButton.dataset.defaultLabel = submitButton.textContent ?? "";
  }

  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading
    ? "Traitement..."
    : submitButton.dataset.defaultLabel;
};

const authLayout = (hash: string): string => `${APP_STYLE}
  <main class="auth-shell">
    <section class="hero">
      <p class="eyebrow">Monimmo · assistant des agents immobiliers</p>
      <h1>Pilotez prospection, suivi et vente depuis un seul espace.</h1>
    </section>
    <section class="panel">${renderAuthContent(hash)}</section>
  </main>
`;

const appLayout = (content: string, activePage: AppPage): string => {
  const email = getSessionEmail();

  return `${APP_STYLE}
    <main class="app-shell">
      <header class="app-header">
        <div class="app-brand">
          <h2>Monimmo · espace métier</h2>
          <p>Session: ${email}</p>
        </div>
        <div class="app-controls">
          <nav class="app-nav" aria-label="Navigation métier">
            <a href="#/app/kanban" class="${activePage === "kanban" ? "is-active" : ""}">Kanban</a>
            <a href="#/app/bien/nouveau" class="${activePage === "property-create" ? "is-active" : ""}">Créer un bien</a>
            <a href="#/app/configuration" class="${activePage === "config" ? "is-active" : ""}">Configuration</a>
          </nav>
          <button id="app-logout" type="button" class="button-ghost">Déconnexion</button>
        </div>
      </header>
      <section class="app-content">${content}</section>
    </main>
  `;
};

const loadingContent = (title: string): string => `
  <section class="stack">
    <div class="page-head">
      <h2>${title}</h2>
    </div>
    <p class="muted">Chargement en cours...</p>
  </section>
`;

const propertyCard = (property: PropertyResponse): string => `
  <article
    class="property-card"
    draggable="true"
    data-property-id="${property.id}"
    data-current-status="${property.status}"
  >
    <a href="#/app/bien/${encodeURIComponent(property.id)}">${escapeHtml(property.title)}</a>
    <p class="meta">${escapeHtml(property.city)} · ${escapeHtml(property.postalCode)}</p>
    <p class="meta">${escapeHtml(property.address ?? "Adresse non renseignée")}</p>
    <span class="drag-hint">Glisser vers une autre colonne</span>
  </article>
`;

const kanbanContent = (properties: PropertyResponse[]): string => {
  const grouped = new Map<PropertyStatus, PropertyResponse[]>();
  for (const status of PROPERTY_STATUS_ORDER) {
    grouped.set(status, []);
  }

  for (const property of properties) {
    const bucket = grouped.get(property.status as PropertyStatus);
    if (bucket) {
      bucket.push(property);
    }
  }

  const columns = PROPERTY_STATUS_ORDER.map((status) => {
    const items = grouped.get(status) ?? [];

    return `
      <section class="kanban-column" data-drop-status="${status}">
        <h3>${STATUS_LABELS[status]} <span class="pill">${items.length}</span></h3>
        <p class="meta" data-drop-feedback></p>
        ${
          items.length > 0
            ? items.map(propertyCard).join("")
            : `<div class="empty-state">Aucun bien dans cette colonne.</div>`
        }
      </section>
    `;
  }).join("");

  return `
    <section class="stack">
      <div class="page-head">
        <h2>Kanban des biens</h2>
        <div class="top-actions">
          <a class="button-link" href="#/app/bien/nouveau">Nouveau bien</a>
        </div>
      </div>
      <div class="kanban-grid">${columns}</div>
    </section>
  `;
};

const propertyCreateContent = (): string => `
  <section class="stack">
    <div class="page-head">
      <h2>Création d'un bien</h2>
      <a class="button-link button-ghost" href="#/app/kanban">Retour kanban</a>
    </div>
    <form id="property-create-form" class="card" novalidate>
      <div class="field">
        <label for="property-title">Titre</label>
        <input id="property-title" name="title" type="text" placeholder="Appartement T3 centre-ville" required />
      </div>
      <div class="double-field">
        <div class="field">
          <label for="property-city">Ville</label>
          <input id="property-city" name="city" type="text" placeholder="Bordeaux" required />
        </div>
        <div class="field">
          <label for="property-postal-code">Code postal</label>
          <input id="property-postal-code" name="postalCode" type="text" placeholder="33000" required />
        </div>
      </div>
      <div class="field">
        <label for="property-address">Adresse</label>
        <input id="property-address" name="address" type="text" placeholder="12 rue de la République" required />
      </div>
      <h3 class="section-title">Propriétaire</h3>
      <div class="double-field">
        <div class="field">
          <label for="owner-first-name">Prénom</label>
          <input id="owner-first-name" name="ownerFirstName" type="text" placeholder="Claire" required />
        </div>
        <div class="field">
          <label for="owner-last-name">Nom</label>
          <input id="owner-last-name" name="ownerLastName" type="text" placeholder="Dupont" required />
        </div>
      </div>
      <div class="double-field">
        <div class="field">
          <label for="owner-phone">Téléphone</label>
          <input id="owner-phone" name="ownerPhone" type="tel" placeholder="0612345678" required />
        </div>
        <div class="field">
          <label for="owner-email">Email</label>
          <input id="owner-email" name="ownerEmail" type="email" placeholder="proprietaire@email.fr" required />
        </div>
      </div>
      <p class="feedback" data-feedback role="status" aria-live="polite"></p>
      <div class="actions">
        <button type="submit">Créer le bien</button>
      </div>
    </form>
  </section>
`;

const buildTimeline = (
  property: PropertyResponse,
  messages: MessageResponse[],
): TimelineItem[] => {
  const events: TimelineItem[] = [
    {
      at: property.createdAt,
      title: "Bien créé",
      description: `${property.title} · ${property.city}`,
    },
  ];

  if (property.updatedAt !== property.createdAt) {
    events.push({
      at: property.updatedAt,
      title: "Bien mis à jour",
      description: `Statut actuel: ${STATUS_LABELS[property.status as PropertyStatus]}`,
    });
  }

  for (const message of messages) {
    events.push({
      at: message.receivedAt,
      title: `Message ${message.channel}`,
      description: message.subject?.trim() || message.body.slice(0, 120),
    });
  }

  return events.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
};

const propertyDetailContent = (
  property: PropertyResponse,
  messages: MessageResponse[],
  participants: PropertyParticipantResponse[],
  files: FileResponse[],
): string => {
  const previousStatus = getPreviousStatus(property.status);
  const nextStatus = getNextStatus(property.status);

  const timelineItems = buildTimeline(property, messages)
    .map(
      (item) => `
        <div class="timeline-item">
          <strong>${item.title}</strong>
          <span class="meta">${formatDate(item.at)}</span>
          <span>${item.description}</span>
        </div>
      `,
    )
    .join("");

  const participantsMarkup =
    participants.length > 0
      ? participants
          .map(
            (participant) => `
              <article class="participant-item">
                <strong>${PARTICIPANT_LABELS[participant.role]}</strong>
                <span>Contact: ${participant.contactId}</span>
                <span class="meta">Ajouté le ${formatDate(participant.createdAt)}</span>
              </article>
            `,
          )
          .join("")
      : `<div class="empty-state">Aucun participant ajouté dans cette session.</div>`;

  const filesMarkup =
    files.length > 0
      ? files
          .map(
            (file) => `
              <article class="document-item">
                <strong>${escapeHtml(file.fileName)}</strong>
                <span>Catégorie: ${formatTypeDocumentLabel(file.typeDocument ?? "NON_CLASSE")}</span>
                <span>Statut: ${file.status}</span>
                <span class="meta">Ajouté le ${formatDate(file.createdAt)}</span>
              </article>
            `,
          )
          .join("")
      : `<div class="empty-state">Aucun document pour ce bien.</div>`;

  const typeDocumentOptions = TYPE_DOCUMENT_OPTIONS.map(
    (typeDocument) =>
      `<option value="${typeDocument}">${formatTypeDocumentLabel(typeDocument)}</option>`,
  ).join("");

  return `
    <section class="stack">
      <div class="page-head">
        <h2>Détail du bien</h2>
        <div class="top-actions">
          <a class="button-link button-ghost" href="#/app/kanban">Retour kanban</a>
        </div>
      </div>

      <section class="card">
        <h3 class="card-title">${escapeHtml(property.title)}</h3>
        <p class="muted">Statut actuel: ${STATUS_LABELS[property.status]}</p>
        <div class="status-actions" data-property-id="${property.id}">
          <button
            type="button"
            class="status-action button-warning"
            data-target-status="${previousStatus ?? ""}"
            ${previousStatus ? "" : "disabled"}
          >
            ${previousStatus ? `Statut précédent (${STATUS_LABELS[previousStatus]})` : "Pas de statut précédent"}
          </button>
          <button
            type="button"
            class="status-action button-success"
            data-target-status="${nextStatus ?? ""}"
            ${nextStatus ? "" : "disabled"}
          >
            ${nextStatus ? `Statut suivant (${STATUS_LABELS[nextStatus]})` : "Dernier statut atteint"}
          </button>
          <button
            type="button"
            class="status-action button-neutral"
            data-target-status="ARCHIVE"
            ${property.status === "ARCHIVE" ? "disabled" : ""}
          >
            Archiver
          </button>
        </div>
        <p class="status-actions-feedback" data-status-feedback role="status" aria-live="polite"></p>
      </section>

      <section class="card">
        <h3 class="card-title">Modifier le bien</h3>
        <form id="property-edit-form" class="stack" data-property-id="${property.id}" novalidate>
          <div class="field">
            <label for="property-edit-title">Titre</label>
            <input id="property-edit-title" name="title" type="text" required value="${escapeHtml(property.title)}" />
          </div>
          <div class="double-field">
            <div class="field">
              <label for="property-edit-city">Ville</label>
              <input id="property-edit-city" name="city" type="text" required value="${escapeHtml(property.city)}" />
            </div>
            <div class="field">
              <label for="property-edit-postal-code">Code postal</label>
              <input id="property-edit-postal-code" name="postalCode" type="text" required value="${escapeHtml(property.postalCode)}" />
            </div>
          </div>
          <div class="field">
            <label for="property-edit-address">Adresse</label>
            <input id="property-edit-address" name="address" type="text" required value="${escapeHtml(property.address ?? "")}" />
          </div>
          <button type="submit" class="button-ghost">Enregistrer les modifications</button>
          <p class="feedback" data-feedback role="status" aria-live="polite"></p>
        </form>
      </section>

      <section class="split">
        <article class="card">
          <h3 class="card-title">Timeline</h3>
          <div class="timeline">${timelineItems || '<div class="empty-state">Aucun événement.</div>'}</div>
        </article>

        <article class="card">
          <h3 class="card-title">Participants</h3>
          <form id="participant-form" data-property-id="${property.id}" class="stack" novalidate>
            <div class="field">
              <label for="participant-contact">Contact ID</label>
              <input id="participant-contact" name="contactId" type="text" placeholder="contact_123" required />
            </div>
            <div class="field">
              <label for="participant-role">Rôle</label>
              <select id="participant-role" name="role">
                ${PARTICIPANT_ROLE_OPTIONS.map(
                  (role) => `<option value="${role}">${PARTICIPANT_LABELS[role]}</option>`,
                ).join("")}
              </select>
            </div>
            <button type="submit" class="button-ghost">Ajouter participant</button>
            <p class="feedback" data-feedback role="status" aria-live="polite"></p>
          </form>
          <div class="participants">${participantsMarkup}</div>
        </article>
      </section>

      <section class="split">
        <article class="card">
          <h3 class="card-title">Documents</h3>
          <form id="file-upload-form" data-property-id="${property.id}" class="stack" novalidate>
            <div class="field">
              <label for="file-upload-input">Fichier</label>
              <input id="file-upload-input" name="file" type="file" required />
            </div>
            <div class="field">
              <label for="file-upload-category">Catégorie</label>
              <select id="file-upload-category" name="typeDocument" required>
                ${typeDocumentOptions}
              </select>
            </div>
            <button type="submit" class="button-ghost">Ajouter le fichier</button>
            <p class="feedback" data-feedback role="status" aria-live="polite"></p>
          </form>
          <div class="documents">${filesMarkup}</div>
        </article>

        <article class="card">
          <h3 class="card-title">Messages liés</h3>
          <div class="timeline">
            ${
              messages.length > 0
                ? messages
                    .map(
                      (message) => `
                        <div class="timeline-item">
                          <strong>${message.channel} · ${message.aiStatus}</strong>
                          <span class="meta">${formatDate(message.receivedAt)}</span>
                          <span>${message.subject?.trim() || message.body.slice(0, 140)}</span>
                        </div>
                      `,
                    )
                    .join("")
                : '<div class="empty-state">Aucun message rattaché à ce bien.</div>'
            }
          </div>
        </article>
      </section>
    </section>
  `;
};

const integrationCard = (
  provider: IntegrationResponse["provider"],
  label: string,
): string => {
  const providerPath =
    provider === "GOOGLE_CALENDAR"
      ? "google-calendar"
      : provider.toLowerCase();

  return `
    <article class="integration-card">
      <h3>${label}</h3>
      <form class="integration-connect-form" data-provider-path="${providerPath}">
        <div class="field">
          <label>Code OAuth (optionnel)</label>
          <input name="code" type="text" placeholder="code_${providerPath}" />
        </div>
        <div class="field">
          <label>Redirect URI (optionnel)</label>
          <input name="redirectUri" type="url" placeholder="https://example.com/callback" />
        </div>
        <button type="submit" class="button-ghost">Connecter</button>
        <p class="feedback" data-feedback role="status" aria-live="polite"></p>
      </form>
      <form class="integration-sync-form" data-provider-path="${providerPath}">
        <div class="field">
          <label>Cursor sync (optionnel)</label>
          <input name="cursor" type="text" placeholder="cursor_1" />
        </div>
        <button type="submit" class="button-ghost">Synchroniser</button>
        <p class="feedback" data-feedback role="status" aria-live="polite"></p>
      </form>
    </article>
  `;
};

const configContent = (): string => `
  <section class="stack">
    <div class="page-head">
      <h2>Configuration des connecteurs</h2>
    </div>
    <div class="integration-grid">
      ${integrationCard("GMAIL", "Gmail")}
      ${integrationCard("GOOGLE_CALENDAR", "Google Calendar")}
      ${integrationCard("WHATSAPP", "WhatsApp")}
    </div>
  </section>
`;

const unauthorizedContent = (): string => `
  <section class="stack">
    <div class="page-head">
      <h2>Session requise</h2>
    </div>
    <p class="muted">Connectez-vous pour accéder aux pages métier.</p>
    <div class="top-actions">
      <a class="button-link" href="#/login">Aller à la connexion</a>
    </div>
  </section>
`;

const errorContent = (title: string, message: string): string => `
  <section class="stack">
    <div class="page-head"><h2>${title}</h2></div>
    <div class="empty-state">${message}</div>
  </section>
`;

const bindAppCommon = (): void => {
  const logoutButton = document.querySelector<HTMLButtonElement>("#app-logout");
  logoutButton?.addEventListener("click", () => {
    clearAuthSession();
    window.location.hash = "#/login";
  });
};

const refreshRoute = (): void => {
  window.dispatchEvent(new HashChangeEvent("hashchange"));
};

const bindKanbanPage = (): void => {
  let draggingPropertyId = "";
  let draggingStatus = "" as PropertyStatus | "";

  const cards = document.querySelectorAll<HTMLElement>(".property-card[data-property-id]");
  for (const card of cards) {
    card.addEventListener("dragstart", (event) => {
      const propertyId = card.dataset.propertyId ?? "";
      const currentStatus = (card.dataset.currentStatus ?? "") as PropertyStatus | "";
      if (!propertyId || !currentStatus) {
        return;
      }

      draggingPropertyId = propertyId;
      draggingStatus = currentStatus;
      card.classList.add("is-dragging");

      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", propertyId);
      }
    });

    card.addEventListener("dragend", () => {
      draggingPropertyId = "";
      draggingStatus = "";
      card.classList.remove("is-dragging");

      const columns = document.querySelectorAll<HTMLElement>(".kanban-column.drop-active");
      columns.forEach((column) => column.classList.remove("drop-active"));
    });
  }

  const columns = document.querySelectorAll<HTMLElement>(".kanban-column[data-drop-status]");
  for (const column of columns) {
    column.addEventListener("dragover", (event) => {
      if (!draggingPropertyId) {
        return;
      }
      event.preventDefault();
      column.classList.add("drop-active");
    });

    column.addEventListener("dragleave", () => {
      column.classList.remove("drop-active");
    });

    column.addEventListener("drop", async (event) => {
      event.preventDefault();
      column.classList.remove("drop-active");

      const targetStatus = (column.dataset.dropStatus ?? "") as PropertyStatus | "";
      if (!targetStatus || !draggingPropertyId || !draggingStatus || targetStatus === draggingStatus) {
        return;
      }

      const feedback = column.querySelector<HTMLElement>("[data-drop-feedback]");
      if (feedback) {
        feedback.textContent = "Mise à jour en cours...";
      }

      const result = await apiRequest<PropertyResponse>(
        "PATCH",
        `/properties/${encodeURIComponent(draggingPropertyId)}/status`,
        { status: targetStatus },
      );

      if (!result.ok) {
        if (feedback) {
          feedback.textContent = result.error ?? "Impossible de changer le statut.";
        }
        return;
      }

      refreshRoute();
    });
  }
};

const bindPropertyCreatePage = (): void => {
  const form = document.querySelector<HTMLFormElement>("#property-create-form");
  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentForm = event.currentTarget;

    if (!(currentForm instanceof HTMLFormElement)) {
      return;
    }

    const formData = new FormData(currentForm);
    const title = String(formData.get("title") ?? "").trim();
    const city = String(formData.get("city") ?? "").trim();
    const postalCode = String(formData.get("postalCode") ?? "").trim();
    const address = String(formData.get("address") ?? "").trim();
    const ownerFirstName = String(formData.get("ownerFirstName") ?? "").trim();
    const ownerLastName = String(formData.get("ownerLastName") ?? "").trim();
    const ownerPhone = String(formData.get("ownerPhone") ?? "").trim();
    const ownerEmail = String(formData.get("ownerEmail") ?? "").trim().toLowerCase();

    if (!title || !city || !postalCode || !address) {
      setFeedback(
        currentForm,
        "Titre, ville, code postal et adresse sont obligatoires.",
        "error",
      );
      return;
    }

    if (!ownerFirstName || !ownerLastName || !ownerPhone || !ownerEmail) {
      setFeedback(currentForm, "Les informations du propriétaire sont obligatoires.", "error");
      return;
    }

    if (!isEmailValid(ownerEmail)) {
      setFeedback(currentForm, "L'email du propriétaire est invalide.", "error");
      return;
    }

    setFeedback(currentForm, "Création du bien...", "info");
    setFormLoading(currentForm, true);

    const payload = {
      title,
      city,
      postalCode,
      address,
      owner: {
        firstName: ownerFirstName,
        lastName: ownerLastName,
        phone: ownerPhone,
        email: ownerEmail,
      },
    } satisfies Record<string, unknown>;

    const result = await apiRequest<PropertyResponse>("POST", "/properties", payload);

    setFormLoading(currentForm, false);

    if (!result.ok || !result.data) {
      setFeedback(currentForm, result.error ?? "Création impossible", "error");
      return;
    }

    window.location.hash = `#/app/bien/${encodeURIComponent(result.data.id)}`;
  });
};

const bindPropertyDetailPage = (propertyId: string): void => {
  const statusFeedback = document.querySelector<HTMLElement>("[data-status-feedback]");
  const statusButtons = document.querySelectorAll<HTMLButtonElement>(".status-action[data-target-status]");
  for (const button of statusButtons) {
    button.dataset.initialDisabled = button.disabled ? "1" : "0";

    button.addEventListener("click", async () => {
      const targetStatus = (button.dataset.targetStatus ?? "") as PropertyStatus | "";
      if (!targetStatus) {
        return;
      }

      statusButtons.forEach((item) => {
        item.disabled = true;
      });

      if (statusFeedback) {
        statusFeedback.textContent = "Mise à jour du statut...";
        statusFeedback.classList.remove("success", "error");
      }

      const result = await apiRequest<PropertyResponse>(
        "PATCH",
        `/properties/${encodeURIComponent(propertyId)}/status`,
        { status: targetStatus },
      );

      if (!result.ok) {
        if (statusFeedback) {
          statusFeedback.textContent = result.error ?? "Erreur lors du changement de statut.";
          statusFeedback.classList.remove("success");
          statusFeedback.classList.add("error");
        }
        statusButtons.forEach((item) => {
          item.disabled = item.dataset.initialDisabled === "1";
        });
        return;
      }

      refreshRoute();
    });
  }

  const propertyEditForm = document.querySelector<HTMLFormElement>("#property-edit-form");
  propertyEditForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    const formData = new FormData(form);
    const title = String(formData.get("title") ?? "").trim();
    const city = String(formData.get("city") ?? "").trim();
    const postalCode = String(formData.get("postalCode") ?? "").trim();
    const address = String(formData.get("address") ?? "").trim();

    if (!title || !city || !postalCode || !address) {
      setFeedback(form, "Tous les champs du bien sont obligatoires.", "error");
      return;
    }

    setFeedback(form, "Mise à jour du bien...", "info");
    setFormLoading(form, true);

    const result = await apiRequest<PropertyResponse>(
      "PATCH",
      `/properties/${encodeURIComponent(propertyId)}`,
      {
        title,
        city,
        postalCode,
        address,
      },
    );

    setFormLoading(form, false);

    if (!result.ok) {
      setFeedback(form, result.error ?? "Impossible de modifier le bien.", "error");
      return;
    }

    setFeedback(form, "Bien mis à jour.", "success");
    refreshRoute();
  });

  const participantForm = document.querySelector<HTMLFormElement>("#participant-form");
  participantForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    const formData = new FormData(form);
    const contactId = String(formData.get("contactId") ?? "").trim();
    const role = String(formData.get("role") ?? "AUTRE") as ParticipantRole;

    if (!contactId) {
      setFeedback(form, "Le contactId est obligatoire.", "error");
      return;
    }

    setFeedback(form, "Ajout du participant...", "info");
    setFormLoading(form, true);

    const result = await apiRequest<PropertyParticipantResponse>(
      "POST",
      `/properties/${encodeURIComponent(propertyId)}/participants`,
      {
        contactId,
        role,
      },
    );

    setFormLoading(form, false);

    if (!result.ok || !result.data) {
      setFeedback(form, result.error ?? "Ajout impossible", "error");
      return;
    }

    appendPersistedItem(participantsStorageKey(propertyId), result.data);
    setFeedback(form, "Participant ajouté.", "success");
    refreshRoute();
  });

  const fileUploadForm = document.querySelector<HTMLFormElement>("#file-upload-form");
  fileUploadForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    const formData = new FormData(form);
    const selectedFile = formData.get("file");
    const typeDocument = String(formData.get("typeDocument") ?? "") as TypeDocument;

    if (!(selectedFile instanceof File) || selectedFile.size <= 0) {
      setFeedback(form, "Veuillez sélectionner un fichier.", "error");
      return;
    }

    if (!TYPE_DOCUMENT_OPTIONS.includes(typeDocument)) {
      setFeedback(form, "Veuillez sélectionner une catégorie valide.", "error");
      return;
    }

    setFeedback(form, "Upload du document en cours...", "info");
    setFormLoading(form, true);

    const contentBase64 = await fileToBase64(selectedFile);
    const result = await apiRequest<FileResponse>("POST", "/files/upload", {
      propertyId,
      typeDocument,
      fileName: selectedFile.name,
      mimeType: selectedFile.type || "application/octet-stream",
      size: selectedFile.size,
      contentBase64,
    });

    setFormLoading(form, false);

    if (!result.ok || !result.data) {
      setFeedback(form, result.error ?? "Upload impossible", "error");
      return;
    }

    setFeedback(form, "Document ajouté.", "success");
    refreshRoute();
  });
};

const bindConfigPage = (): void => {
  const connectForms = document.querySelectorAll<HTMLFormElement>(".integration-connect-form");
  for (const form of connectForms) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const currentForm = event.currentTarget;
      if (!(currentForm instanceof HTMLFormElement)) {
        return;
      }

      const providerPath = currentForm.dataset.providerPath;
      if (!providerPath) {
        return;
      }

      const formData = new FormData(currentForm);
      const code = String(formData.get("code") ?? "").trim();
      const redirectUri = String(formData.get("redirectUri") ?? "").trim();

      const payload: Record<string, unknown> = {};
      if (code) {
        payload.code = code;
      }
      if (redirectUri) {
        payload.redirectUri = redirectUri;
      }

      setFeedback(currentForm, "Connexion en cours...", "info");
      setFormLoading(currentForm, true);

      const result = await apiRequest<IntegrationResponse>(
        "POST",
        `/integrations/${providerPath}/connect`,
        payload,
      );

      setFormLoading(currentForm, false);

      if (!result.ok || !result.data) {
        setFeedback(currentForm, result.error ?? "Échec de connexion", "error");
        return;
      }

      setFeedback(
        currentForm,
        `Connecté (${result.data.status}).`,
        "success",
      );
    });
  }

  const syncForms = document.querySelectorAll<HTMLFormElement>(".integration-sync-form");
  for (const form of syncForms) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const currentForm = event.currentTarget;
      if (!(currentForm instanceof HTMLFormElement)) {
        return;
      }

      const providerPath = currentForm.dataset.providerPath;
      if (!providerPath) {
        return;
      }

      const formData = new FormData(currentForm);
      const cursor = String(formData.get("cursor") ?? "").trim();
      const payload: Record<string, unknown> = {};
      if (cursor) {
        payload.cursor = cursor;
      }

      setFeedback(currentForm, "Synchronisation en cours...", "info");
      setFormLoading(currentForm, true);

      const result = await apiRequest<IntegrationResponse>(
        "POST",
        `/integrations/${providerPath}/sync`,
        payload,
      );

      setFormLoading(currentForm, false);

      if (!result.ok || !result.data) {
        setFeedback(currentForm, result.error ?? "Échec de synchronisation", "error");
        return;
      }

      setFeedback(
        currentForm,
        `Synchronisation lancée (${result.data.status}).`,
        "success",
      );
    });
  }
};

const loginHandler = async (event: SubmitEvent): Promise<void> => {
  event.preventDefault();
  const form = event.currentTarget;

  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const formData = new FormData(form);
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!isEmailValid(email)) {
    setFeedback(form, "Veuillez renseigner un email valide.", "error");
    return;
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    setFeedback(
      form,
      `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`,
      "error",
    );
    return;
  }

  setFeedback(form, "Connexion en cours...", "info");
  setFormLoading(form, true);

  const result = await apiRequest<AuthResponse>(
    "POST",
    "/auth/login",
    { email, password },
    { auth: false },
  );

  setFormLoading(form, false);

  if (!result.ok || !result.data || !isAuthResponse(result.data)) {
    setFeedback(form, result.error ?? "Connexion impossible", "error");
    return;
  }

  saveAuthSession(result.data);
  window.location.hash = "#/app/kanban";
};

const registerHandler = async (event: SubmitEvent): Promise<void> => {
  event.preventDefault();
  const form = event.currentTarget;

  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const formData = new FormData(form);
  const payload: RegisterFormData = {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
    firstName: String(formData.get("firstName") ?? "").trim(),
    lastName: String(formData.get("lastName") ?? "").trim(),
  };

  const validationError = validateRegisterForm(payload);
  if (validationError) {
    setFeedback(form, validationError, "error");
    return;
  }

  setFeedback(form, "Création de compte en cours...", "info");
  setFormLoading(form, true);

  const result = await apiRequest<AuthResponse>(
    "POST",
    "/auth/register",
    {
      email: payload.email,
      password: payload.password,
      firstName: payload.firstName,
      lastName: payload.lastName,
    },
    { auth: false },
  );

  setFormLoading(form, false);

  if (!result.ok || !result.data || !isAuthResponse(result.data)) {
    setFeedback(form, result.error ?? "Création impossible", "error");
    return;
  }

  saveAuthSession(result.data);
  window.location.hash = "#/app/kanban";
};

const forgotPasswordHandler = async (event: SubmitEvent): Promise<void> => {
  event.preventDefault();
  const form = event.currentTarget;

  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const formData = new FormData(form);
  const email = String(formData.get("email") ?? "").trim();

  if (!isEmailValid(email)) {
    setFeedback(form, "Veuillez renseigner un email valide.", "error");
    return;
  }

  setFeedback(form, "Envoi de la demande en cours...", "info");
  setFormLoading(form, true);

  const result = await apiRequest<never>(
    "POST",
    "/auth/forgot-password",
    { email },
    { auth: false },
  );

  setFormLoading(form, false);

  if (!result.ok) {
    setFeedback(form, result.error ?? "Envoi impossible", "error");
    return;
  }

  window.location.hash = "#/mot-de-passe/reset";
};

const resetPasswordHandler = async (event: SubmitEvent): Promise<void> => {
  event.preventDefault();
  const form = event.currentTarget;

  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const formData = new FormData(form);
  const payload: ResetFormData = {
    token: String(formData.get("token") ?? "").trim(),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  };

  const validationError = validateResetForm(payload);
  if (validationError) {
    setFeedback(form, validationError, "error");
    return;
  }

  setFeedback(form, "Réinitialisation en cours...", "info");
  setFormLoading(form, true);

  const result = await apiRequest<never>(
    "POST",
    "/auth/reset-password",
    {
      token: payload.token,
      newPassword: payload.newPassword,
    },
    { auth: false },
  );

  setFormLoading(form, false);

  if (!result.ok) {
    setFeedback(form, result.error ?? "Réinitialisation impossible", "error");
    return;
  }

  setFeedback(
    form,
    "Mot de passe mis à jour. Vous pouvez maintenant vous connecter.",
    "success",
  );
};

const bindAuthForms = (): void => {
  const loginForm = document.querySelector<HTMLFormElement>("#login-form");
  loginForm?.addEventListener("submit", loginHandler);

  const registerForm = document.querySelector<HTMLFormElement>("#register-form");
  registerForm?.addEventListener("submit", registerHandler);

  const forgotForm = document.querySelector<HTMLFormElement>("#forgot-form");
  forgotForm?.addEventListener("submit", forgotPasswordHandler);

  const resetForm = document.querySelector<HTMLFormElement>("#reset-form");
  resetForm?.addEventListener("submit", resetPasswordHandler);
};

const renderAppPage = async (
  root: HTMLElement,
  route: Extract<RouteState, { scope: "app" }>,
  currentSequence: number,
): Promise<void> => {
  if (!getAccessToken()) {
    root.innerHTML = appLayout(unauthorizedContent(), route.page);
    bindAppCommon();
    return;
  }

  if (route.page === "kanban") {
    root.innerHTML = appLayout(loadingContent("Kanban des biens"), "kanban");
    bindAppCommon();

    const response = await apiRequest<PropertyListResponse>(
      "GET",
      "/properties?limit=100",
    );

    if (currentSequence !== renderSequence) {
      return;
    }

    if (!response.ok || !response.data) {
      root.innerHTML = appLayout(
        errorContent("Kanban des biens", response.error ?? "Chargement impossible."),
        "kanban",
      );
      bindAppCommon();
      return;
    }

    root.innerHTML = appLayout(kanbanContent(response.data.items), "kanban");
    bindAppCommon();
    bindKanbanPage();
    return;
  }

  if (route.page === "property-create") {
    root.innerHTML = appLayout(propertyCreateContent(), "property-create");
    bindAppCommon();
    bindPropertyCreatePage();
    return;
  }

  if (route.page === "property-detail") {
    const propertyId = route.propertyId;
    if (!propertyId) {
      root.innerHTML = appLayout(
        errorContent("Détail du bien", "Identifiant de bien manquant."),
        "kanban",
      );
      bindAppCommon();
      return;
    }

    root.innerHTML = appLayout(loadingContent("Détail du bien"), "kanban");
    bindAppCommon();

    const [propertyResult, messagesResult, filesResult] = await Promise.all([
      apiRequest<PropertyResponse>("GET", `/properties/${encodeURIComponent(propertyId)}`),
      apiRequest<MessageListResponse>(
        "GET",
        `/messages?propertyId=${encodeURIComponent(propertyId)}&limit=100`,
      ),
      apiRequest<FileListResponse>(
        "GET",
        `/files?propertyId=${encodeURIComponent(propertyId)}&limit=100`,
      ),
    ]);

    if (currentSequence !== renderSequence) {
      return;
    }

    if (!propertyResult.ok || !propertyResult.data) {
      root.innerHTML = appLayout(
        errorContent("Détail du bien", propertyResult.error ?? "Bien introuvable."),
        "kanban",
      );
      bindAppCommon();
      return;
    }

    const participants = readPersistedList<PropertyParticipantResponse>(
      participantsStorageKey(propertyId),
    );

    root.innerHTML = appLayout(
      propertyDetailContent(
        propertyResult.data,
        messagesResult.data?.items ?? [],
        participants,
        filesResult.data?.items ?? [],
      ),
      "kanban",
    );

    bindAppCommon();
    bindPropertyDetailPage(propertyId);
    return;
  }

  root.innerHTML = appLayout(configContent(), "config");
  bindAppCommon();
  bindConfigPage();
};

const renderInto = async (root: HTMLElement, hash: string): Promise<void> => {
  const currentSequence = ++renderSequence;
  const route = parseRoute(hash);

  if (route.scope === "auth") {
    root.innerHTML = authLayout(route.hash);
    bindAuthForms();
    return;
  }

  await renderAppPage(root, route, currentSequence);
};

const bootstrap = (): void => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) {
    return;
  }

  const renderCurrentRoute = (): void => {
    void renderInto(root, window.location.hash);
  };

  if (!window.location.hash || window.location.hash === "#") {
    window.location.hash = "#/login";
  }

  renderCurrentRoute();
  window.addEventListener("hashchange", renderCurrentRoute);
};

if (typeof window !== "undefined" && typeof document !== "undefined") {
  bootstrap();
}
