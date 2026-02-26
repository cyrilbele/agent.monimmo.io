import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestampColumns = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ...timestampColumns,
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  email: text("email").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  role: text("role").notNull(),
  passwordHash: text("password_hash").notNull(),
  ...timestampColumns,
});

export const properties = sqliteTable("properties", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  title: text("title").notNull(),
  city: text("city").notNull(),
  postalCode: text("postal_code").notNull(),
  address: text("address"),
  price: integer("price"),
  status: text("status").notNull(),
  ...timestampColumns,
});

export const propertyTimelineEvents = sqliteTable("property_timeline_events", {
  id: text("id").primaryKey(),
  propertyId: text("property_id")
    .notNull()
    .references(() => properties.id),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  eventType: text("event_type").notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const propertyUserLinks = sqliteTable(
  "property_user_links",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    propertyId: text("property_id")
      .notNull()
      .references(() => properties.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    propertyUserUnique: uniqueIndex("property_user_links_property_user_unique").on(
      table.propertyId,
      table.userId,
    ),
  }),
);

export const propertyParties = sqliteTable("property_parties", {
  id: text("id").primaryKey(),
  propertyId: text("property_id")
    .notNull()
    .references(() => properties.id),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  contactId: text("contact_id").notNull(),
  role: text("role").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const files = sqliteTable("files", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  propertyId: text("property_id").references(() => properties.id),
  typeDocument: text("type_document"),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  status: text("status").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  sourceProvider: text("source_provider"),
  externalId: text("external_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
},
(table) => ({
  externalProviderIdx: uniqueIndex("files_org_provider_external_unique").on(
    table.orgId,
    table.sourceProvider,
    table.externalId,
  ),
}));

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    propertyId: text("property_id").references(() => properties.id),
    channel: text("channel").notNull(),
    sourceProvider: text("source_provider"),
    externalId: text("external_id"),
    subject: text("subject"),
    body: text("body").notNull(),
    aiStatus: text("ai_status").notNull(),
    receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    externalProviderIdx: uniqueIndex("messages_org_channel_external_unique").on(
      table.orgId,
      table.channel,
      table.externalId,
    ),
  }),
);

export const messageFileLinks = sqliteTable(
  "message_file_links",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id),
    fileId: text("file_id")
      .notNull()
      .references(() => files.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    messageFileUnique: uniqueIndex("message_file_links_message_file_unique").on(
      table.messageId,
      table.fileId,
    ),
  }),
);

export const vocals = sqliteTable("vocals", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  propertyId: text("property_id").references(() => properties.id),
  fileId: text("file_id")
    .notNull()
    .references(() => files.id),
  status: text("status").notNull(),
  transcript: text("transcript"),
  summary: text("summary"),
  insights: text("insights"),
  confidence: real("confidence"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const reviewQueueItems = sqliteTable("review_queue_items", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  itemType: text("item_type").notNull(),
  itemId: text("item_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull(),
  payload: text("payload"),
  resolution: text("resolution"),
  note: text("note"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
});

export const integrations = sqliteTable(
  "integrations",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    provider: text("provider").notNull(),
    status: text("status").notNull(),
    accessTokenEnc: text("access_token_enc"),
    refreshTokenEnc: text("refresh_token_enc"),
    tokenExpiryAt: integer("token_expiry_at", { mode: "timestamp_ms" }),
    connectedAt: integer("connected_at", { mode: "timestamp_ms" }),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
    cursor: text("cursor"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    orgProviderUnique: uniqueIndex("integrations_org_provider_unique").on(
      table.orgId,
      table.provider,
    ),
  }),
);

export const calendarEvents = sqliteTable(
  "calendar_events",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
    endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
    payload: text("payload"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    orgProviderExternalUnique: uniqueIndex("calendar_events_org_provider_external_unique").on(
      table.orgId,
      table.provider,
      table.externalId,
    ),
  }),
);
