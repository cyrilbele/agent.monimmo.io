import { beforeEach, describe, expect, it } from "bun:test";
import { getQueueMetrics, resetQueueMetrics } from "../src/queues/metrics";
import { bindWorkerInstrumentation } from "../src/queues/workers";

describe("queue metrics", () => {
  beforeEach(() => {
    resetQueueMetrics();
  });

  it("incrémente les compteurs start/done/fail via l'instrumentation", () => {
    const handlers: Record<string, (...args: any[]) => void> = {};
    const worker = {
      on(event: string, handler: (...args: any[]) => void) {
        handlers[event] = handler;
        return this;
      },
    };

    bindWorkerInstrumentation(worker as never, "processMessage", "ai.process-message");

    handlers.active?.({ id: "job_1" });
    handlers.completed?.({ id: "job_1" });
    handlers.failed?.({ id: "job_2" }, new Error("boom"));

    const metrics = getQueueMetrics();
    expect(metrics.processMessage.started).toBe(1);
    expect(metrics.processMessage.completed).toBe(1);
    expect(metrics.processMessage.failed).toBe(1);
  });
});
