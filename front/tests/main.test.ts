import { describe, expect, it } from "bun:test";
import { formatAssistantGreeting } from "../src/main";

describe("formatAssistantGreeting", () => {
  it("retourne un message par défaut si le nom est vide", () => {
    expect(formatAssistantGreeting("   ")).toBe("Assistant Monimmo IA prêt.");
  });

  it("retourne un message contextualisé si un nom est présent", () => {
    expect(formatAssistantGreeting("Camille")).toBe(
      "Assistant Monimmo IA prêt pour Camille.",
    );
  });
});

