import { describe, expect, it } from "bun:test";
import {
  createAIProviderForKind,
  resolveAIProviderKind,
  resolveAppAIProvider,
} from "../src/ai/factory";
import { MockAIProvider } from "../src/ai/mock-provider";

describe("ai factory", () => {
  it("sélectionne openai par défaut", () => {
    const kind = resolveAIProviderKind({});
    expect(kind).toBe("openai");
  });

  it("retombe sur openai pour une valeur inconnue", () => {
    const kind = resolveAIProviderKind({ AI_PROVIDER: "unknown" });
    expect(kind).toBe("openai");
  });

  it("permet de forcer mock via environnement", () => {
    const kind = resolveAIProviderKind({ AI_PROVIDER: "mock" });
    expect(kind).toBe("mock");
  });

  it("normalise le provider applicatif", () => {
    expect(resolveAppAIProvider("anthropic")).toBe("anthropic");
    expect(resolveAppAIProvider("openai")).toBe("openai");
    expect(resolveAppAIProvider("invalid")).toBe("openai");
  });

  it("instancie le provider mock sans dépendance externe", () => {
    const provider = createAIProviderForKind("mock");
    expect(provider instanceof MockAIProvider).toBe(true);
  });
});

