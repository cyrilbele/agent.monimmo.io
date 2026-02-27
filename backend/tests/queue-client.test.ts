import { describe, expect, it, mock } from "bun:test";
import {
  enqueueAiDetectVocalType,
  enqueueAiExtractInitialVisitPropertyParams,
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
    const addType = mock(async () => ({ id: "job-5" }));
    const addPropertyExtract = mock(async () => ({ id: "job-6" }));
    const addInsights = mock(async () => ({ id: "job-4" }));

    await enqueueAiTranscribeVocal(
      { transcribeVocal: { add: addTranscribe } },
      { orgId: "org_1", vocalId: "voc_1" },
    );
    await enqueueAiDetectVocalType(
      { detectVocalType: { add: addType } },
      { orgId: "org_1", vocalId: "voc_1" },
    );
    await enqueueAiExtractInitialVisitPropertyParams(
      { extractInitialVisitPropertyParams: { add: addPropertyExtract } },
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
    expect(addType).toHaveBeenCalledWith(
      "detect-vocal-type",
      { orgId: "org_1", vocalId: "voc_1" },
      undefined,
    );
    expect(addPropertyExtract).toHaveBeenCalledWith(
      "extract-initial-visit-property-params",
      { orgId: "org_1", vocalId: "voc_1" },
      undefined,
    );
  });
});
