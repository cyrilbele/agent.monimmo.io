import { describe, expect, it, mock } from "bun:test";
import { createAiProcessorMap } from "../src/queues/processors";

describe("queue processors", () => {
  it("retourne un résultat placeholder standardisé", async () => {
    const handlers = {
      processMessage: mock(async () => ({ status: "PROCESSED" as const, reason: "ok" })),
      processFile: mock(async () => ({ status: "CLASSIFIED" as const })),
      transcribeVocal: mock(async () => ({ status: "TRANSCRIBED" as const })),
      detectVocalType: mock(
        async () => ({ status: "TYPE_CLASSIFIED" as const, vocalType: "VISITE_INITIALE" as const }),
      ),
      extractInitialVisitPropertyParams: mock(
        async () => ({ status: "UPDATED" as const, propertyId: "property_1" }),
      ),
      extractVocalInsights: mock(async () => ({ status: "INSIGHTS_READY" as const })),
    };
    const processors = createAiProcessorMap(handlers);
    const result = await processors.processMessage({
      id: "job_123",
      data: { orgId: "org_1", messageId: "msg_1" },
    } as never);

    expect(handlers.processMessage).toHaveBeenCalledTimes(1);
    expect(result.queue).toBe("processMessage");
    expect(result.jobId).toBe("job_123");
    expect(typeof result.processedAt).toBe("string");
  });
});
