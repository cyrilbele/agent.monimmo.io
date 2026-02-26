import { describe, expect, it } from "bun:test";
import { decryptToken, encryptToken } from "../src/integrations/crypto";

describe("integration token crypto", () => {
  it("chiffre puis déchiffre un token OAuth", () => {
    const env = { INTEGRATION_TOKEN_SECRET: "secret_test_crypto" };
    const plain = "access_token_123";
    const encrypted = encryptToken(plain, env);

    expect(encrypted).not.toBe(plain);
    expect(encrypted.includes(plain)).toBeFalse();

    const decrypted = decryptToken(encrypted, env);
    expect(decrypted).toBe(plain);
  });
});
