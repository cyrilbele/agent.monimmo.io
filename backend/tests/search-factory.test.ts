import { describe, expect, it } from "bun:test";
import { createSearchEngine, resolveSearchEngineKind } from "../src/search/factory";

describe("search factory", () => {
  it("sélectionne qmd par défaut", () => {
    const kind = resolveSearchEngineKind({});
    expect(kind).toBe("qmd");
  });

  it("ignore une valeur inconnue et retombe sur qmd", () => {
    const kind = resolveSearchEngineKind({ SEARCH_ENGINE: "unknown" });
    expect(kind).toBe("qmd");
  });

  it("sélectionne meilisearch via env", () => {
    const kind = resolveSearchEngineKind({ SEARCH_ENGINE: "meilisearch" });
    expect(kind).toBe("meilisearch");
  });

  it("instancie le moteur qmd", () => {
    const engine = createSearchEngine({ SEARCH_ENGINE: "qmd" });
    expect(engine.kind).toBe("qmd");
  });

  it("instancie le moteur meilisearch avec fallback lexical", async () => {
    const engine = createSearchEngine({ SEARCH_ENGINE: "meilisearch" });
    expect(engine.kind).toBe("meilisearch");

    const propertyIds = await engine.searchPropertyIds({
      query: "test",
      limit: 10,
      orgId: "org_demo",
    });
    expect(propertyIds).toBeNull();

    const userIds = await engine.searchUserIds({
      query: "test",
      limit: 10,
      orgId: "org_demo",
    });
    expect(userIds).toBeNull();
  });
});
