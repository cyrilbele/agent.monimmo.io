import { describe, expect, it, mock } from "bun:test";
import {
  enqueueAiExtractVocalInsights,
  enqueueAiProcessFile,
  enqueueAiProcessMessage,
  enqueueAiTranscribeVocal,
} from "../src/queues/client";

describe("queue client helpers", () => {
  it("envoie process-message avec le bon nom de job", async () => {
    const add = mock(async () => ({ id: "job-1" }));

    await enqueueAiProcessMessage(
      { processMessage: { add } },
      { orgId: "org_1", messageId: "msg_1" },
    );

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      "process-message",
      { orgId: "org_1", messageId: "msg_1" },
      undefined,
    );
  });

  it("transmet les options BullMQ optionnelles", async () => {
    const add = mock(async () => ({ id: "job-2" }));

    await enqueueAiProcessFile(
      { processFile: { add } },
      { orgId: "org_1", fileId: "file_1" },
      { jobId: "file_1" },
    );

    expect(add).toHaveBeenCalledWith(
      "process-file",
      { orgId: "org_1", fileId: "file_1" },
      { jobId: "file_1" },
    );
  });

  it("couvre aussi les jobs vocaux", async () => {
    const addTranscribe = mock(async () => ({ id: "job-3" }));
    const addInsights = mock(async () => ({ id: "job-4" }));

    await enqueueAiTranscribeVocal(
      { transcribeVocal: { add: addTranscribe } },
      { orgId: "org_1", vocalId: "voc_1" },
    );
    await enqueueAiExtractVocalInsights(
      { extractVocalInsights: { add: addInsights } },
      { orgId: "org_1", vocalId: "voc_1" },
    );

    expect(addTranscribe).toHaveBeenCalledWith(
      "transcribe-vocal",
      { orgId: "org_1", vocalId: "voc_1" },
      undefined,
    );
    expect(addInsights).toHaveBeenCalledWith(
      "extract-vocal-insights",
      { orgId: "org_1", vocalId: "voc_1" },
      undefined,
    );
  });
});
