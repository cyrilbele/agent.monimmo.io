import { describe, expect, it } from "bun:test";
import {
  DtoSchemaMap,
  LoginRequestSchema,
  PropertyStatusUpdateRequestSchema,
} from "../src/dto/zod";

describe("DTO Zod schemas", () => {
  it("expose un mapping clair DTO -> schema", () => {
    expect(DtoSchemaMap.LoginRequest).toBe(LoginRequestSchema);
    expect(DtoSchemaMap.PropertyStatusUpdateRequest).toBe(
      PropertyStatusUpdateRequestSchema,
    );
  });

  it("valide un payload LoginRequest conforme", () => {
    const parsed = LoginRequestSchema.safeParse({
      email: "agent@monimmo.fr",
      password: "motdepasse1",
    });

    expect(parsed.success).toBe(true);
  });
});

