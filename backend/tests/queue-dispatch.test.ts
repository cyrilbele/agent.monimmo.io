import { afterEach, describe, expect, it } from "bun:test";
import { closeAiQueueClient } from "../src/queues/client";
import { closeQueueRedisConnection } from "../src/queues/connection";
import {
  enqueueFileAiJob,
  enqueueInitialVisitPropertyExtractionJob,
  enqueueMessageAiJob,
  enqueueVocalInsightsJob,
  enqueueVocalTranscriptionJob,
  enqueueVocalTypeDetectionJob,
} from "../src/queues/dispatch";

const previousEnableQueue = process.env.ENABLE_QUEUE;
const previousRedisUrl = process.env.REDIS_URL;

afterEach(() => {
  process.env.ENABLE_QUEUE = previousEnableQueue;
  if (previousRedisUrl === undefined) {
    delete process.env.REDIS_URL;
  } else {
    process.env.REDIS_URL = previousRedisUrl;
  }
});

describe("queue dispatch fallback", () => {
  it("retourne un job fallback pour message/file/vocal quand la queue est désactivée", async () => {
    process.env.ENABLE_QUEUE = "false";

    const messageResult = await enqueueMessageAiJob({
      orgId: "org_demo",
      messageId: "msg:1",
    });
    const fileResult = await enqueueFileAiJob({
      orgId: "org_demo",
      fileId: "file:1",
    });
    const transcribeResult = await enqueueVocalTranscriptionJob({
      orgId: "org_demo",
      vocalId: "vocal:1",
    });
    const insightsResult = await enqueueVocalInsightsJob({
      orgId: "org_demo",
      vocalId: "vocal:1",
    });
    const typeResult = await enqueueVocalTypeDetectionJob({
      orgId: "org_demo",
      vocalId: "vocal:1",
    });
    const propertyResult = await enqueueInitialVisitPropertyExtractionJob({
      orgId: "org_demo",
      vocalId: "vocal:1",
    });

    expect(messageResult.status).toBe("QUEUED");
    expect(messageResult.jobId.startsWith("msg_")).toBe(true);

    expect(fileResult.status).toBe("QUEUED");
    expect(fileResult.jobId.startsWith("file_")).toBe(true);

    expect(transcribeResult.status).toBe("QUEUED");
    expect(transcribeResult.jobId.startsWith("vocal_transcribe_")).toBe(true);

    expect(insightsResult.status).toBe("QUEUED");
    expect(insightsResult.jobId.startsWith("vocal_insights_")).toBe(true);

    expect(typeResult.status).toBe("QUEUED");
    expect(typeResult.jobId.startsWith("vocal_type_")).toBe(true);

    expect(propertyResult.status).toBe("QUEUED");
    expect(propertyResult.jobId.startsWith("vocal_property_extract_")).toBe(true);
  });

  it("retombe en fallback si la queue est activée mais Redis indisponible", async () => {
    process.env.ENABLE_QUEUE = "true";
    process.env.REDIS_URL = "redis://127.0.0.1:6397";

    try {
      const result = await enqueueMessageAiJob({
        orgId: "org_demo",
        messageId: "msg:redis-offline",
      });

      expect(result.status).toBe("QUEUED");
      expect(result.jobId.startsWith("msg_")).toBe(true);
    } finally {
      await closeAiQueueClient();
      await closeQueueRedisConnection();
      if (previousRedisUrl === undefined) {
        delete process.env.REDIS_URL;
      } else {
        process.env.REDIS_URL = previousRedisUrl;
      }
    }
  });
});
