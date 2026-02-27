import { and, eq } from "drizzle-orm";
import { getAIProvider } from ".";
import { db } from "../db/client";
import { files, messages, properties } from "../db/schema";
import { filesService } from "../files/service";
import { HttpError } from "../http/errors";
import { messagesService } from "../messages/service";
import { propertiesService } from "../properties/service";
import {
  enqueueAiDetectVocalType,
  enqueueAiExtractInitialVisitPropertyParams,
  getAiQueueClient,
} from "../queues/client";
import { reviewQueueService } from "../review-queue/service";
import { getStorageProvider } from "../storage";
import { vocalsService } from "../vocals/service";

const MIN_MESSAGE_MATCH_CONFIDENCE = 0.6;
const MIN_FILE_CLASSIFICATION_CONFIDENCE = 0.65;
const MIN_TRANSCRIPT_CONFIDENCE = 0.6;
const MIN_INSIGHTS_CONFIDENCE = 0.5;
const MIN_VOCAL_TYPE_CONFIDENCE = 0.55;
const MIN_INITIAL_VISIT_EXTRACTION_CONFIDENCE = 0.55;

const isQueueEnabled = (): boolean => process.env.ENABLE_QUEUE === "true";
const toJobIdPart = (value: string): string => value.replaceAll(":", "_");
const buildJobId = (...parts: string[]): string => parts.map(toJobIdPart).join("__");

const listPropertyCandidates = async (orgId: string) => {
  const rows = await db
    .select({
      id: properties.id,
      title: properties.title,
      city: properties.city,
      postalCode: properties.postalCode,
      address: properties.address,
    })
    .from(properties)
    .where(eq(properties.orgId, orgId));

  return rows;
};

export const aiJobsService = {
  async processMessage(input: { orgId: string; messageId: string }) {
    const provider = getAIProvider();
    const message = await db.query.messages.findFirst({
      where: and(eq(messages.id, input.messageId), eq(messages.orgId, input.orgId)),
    });

    if (!message) {
      throw new HttpError(404, "MESSAGE_NOT_FOUND", "Message introuvable");
    }

    if (message.propertyId) {
      await messagesService.setAiStatus({
        orgId: input.orgId,
        id: message.id,
        aiStatus: "PROCESSED",
        propertyId: message.propertyId,
      });
      return { status: "PROCESSED" as const, reason: "property_already_set" };
    }

    const candidates = await listPropertyCandidates(input.orgId);
    if (candidates.length === 0) {
      await messagesService.setAiStatus({
        orgId: input.orgId,
        id: message.id,
        aiStatus: "REVIEW_REQUIRED",
      });
      await reviewQueueService.createOpenItem({
        orgId: input.orgId,
        itemType: "MESSAGE",
        itemId: message.id,
        reason: "MESSAGE_NO_PROPERTY_CANDIDATE",
      });
      return { status: "REVIEW_REQUIRED" as const, reason: "no_property_candidate" };
    }

    const match = await provider.matchMessageToProperty({
      subject: message.subject,
      body: message.body,
      properties: candidates,
    });

    if (
      match.propertyId &&
      match.confidence >= MIN_MESSAGE_MATCH_CONFIDENCE &&
      match.ambiguousPropertyIds.length === 0
    ) {
      await messagesService.setAiStatus({
        orgId: input.orgId,
        id: message.id,
        aiStatus: "PROCESSED",
        propertyId: match.propertyId,
      });
      return { status: "PROCESSED" as const, reason: "matched" };
    }

    await messagesService.setAiStatus({
      orgId: input.orgId,
      id: message.id,
      aiStatus: "REVIEW_REQUIRED",
    });
    await reviewQueueService.createOpenItem({
      orgId: input.orgId,
      itemType: "MESSAGE",
      itemId: message.id,
      reason:
        match.ambiguousPropertyIds.length > 0
          ? "MESSAGE_PROPERTY_AMBIGUOUS"
          : "MESSAGE_PROPERTY_NOT_FOUND",
      payload: {
        confidence: match.confidence,
        ambiguousPropertyIds: match.ambiguousPropertyIds,
        reasoning: match.reasoning,
      },
    });

    return { status: "REVIEW_REQUIRED" as const, reason: "needs_review" };
  },

  async processFile(input: { orgId: string; fileId: string }) {
    const provider = getAIProvider();
    const file = await db.query.files.findFirst({
      where: and(eq(files.id, input.fileId), eq(files.orgId, input.orgId)),
    });

    if (!file) {
      throw new HttpError(404, "FILE_NOT_FOUND", "Fichier introuvable");
    }

    const classification = await provider.classifyFile({
      fileName: file.fileName,
      mimeType: file.mimeType,
    });

    if (
      classification.typeDocument &&
      classification.confidence >= MIN_FILE_CLASSIFICATION_CONFIDENCE
    ) {
      await filesService.setClassification({
        orgId: input.orgId,
        id: file.id,
        typeDocument: classification.typeDocument,
        status: "CLASSIFIED",
      });

      return { status: "CLASSIFIED" as const };
    }

    await filesService.setClassification({
      orgId: input.orgId,
      id: file.id,
      status: "REVIEW_REQUIRED",
      typeDocument: classification.typeDocument,
    });
    await reviewQueueService.createOpenItem({
      orgId: input.orgId,
      itemType: "FILE",
      itemId: file.id,
      reason: "FILE_CLASSIFICATION_REVIEW_REQUIRED",
      payload: {
        confidence: classification.confidence,
        proposedTypeDocument: classification.typeDocument,
        reasoning: classification.reasoning,
      },
    });

    return { status: "REVIEW_REQUIRED" as const };
  },

  async transcribeVocal(input: { orgId: string; vocalId: string }) {
    const provider = getAIProvider();
    const vocal = await vocalsService.getByIdForProcessing({
      orgId: input.orgId,
      id: input.vocalId,
    });
    const storage = getStorageProvider();
    const audioObject = await storage.getObject(vocal.storageKey);

    const transcription = await provider.transcribeVocal({
      fileName: vocal.fileName,
      mimeType: vocal.mimeType,
      audioData: audioObject.data,
    });

    const reasons: string[] = [];
    if (!transcription.transcript.trim()) {
      reasons.push("VOCAL_EMPTY_TRANSCRIPT");
    }
    if (transcription.confidence < MIN_TRANSCRIPT_CONFIDENCE) {
      reasons.push("VOCAL_LOW_CONFIDENCE");
    }

    let matchedPropertyId: string | null = null;
    if (!vocal.propertyId && transcription.transcript.trim()) {
      const match = await provider.matchMessageToProperty({
        body: transcription.transcript,
        properties: await listPropertyCandidates(input.orgId),
      });

      if (
        match.propertyId &&
        match.confidence >= MIN_MESSAGE_MATCH_CONFIDENCE &&
        match.ambiguousPropertyIds.length === 0
      ) {
        matchedPropertyId = match.propertyId;
      } else {
        reasons.push("VOCAL_PROPERTY_AMBIGUOUS");
        await reviewQueueService.createOpenItem({
          orgId: input.orgId,
          itemType: "VOCAL",
          itemId: vocal.id,
          reason: "VOCAL_PROPERTY_AMBIGUOUS",
          payload: {
            confidence: match.confidence,
            ambiguousPropertyIds: match.ambiguousPropertyIds,
            reasoning: match.reasoning,
          },
        });
      }
    }

    const status = reasons.length > 0 ? "REVIEW_REQUIRED" : "TRANSCRIBED";
    await vocalsService.setTranscription({
      orgId: input.orgId,
      id: vocal.id,
      transcript: transcription.transcript,
      summary: transcription.summary,
      confidence: transcription.confidence,
      status,
      propertyId: matchedPropertyId ? matchedPropertyId : undefined,
    });

    for (const reason of reasons) {
      if (reason === "VOCAL_PROPERTY_AMBIGUOUS") {
        continue;
      }

      await reviewQueueService.createOpenItem({
        orgId: input.orgId,
        itemType: "VOCAL",
        itemId: vocal.id,
        reason,
        payload: {
          confidence: transcription.confidence,
        },
      });
    }

    if (transcription.transcript.trim() && isQueueEnabled()) {
      try {
        await enqueueAiDetectVocalType(
          getAiQueueClient(),
          {
            orgId: input.orgId,
            vocalId: vocal.id,
          },
          {
            jobId: buildJobId("vocal", "type", input.orgId, vocal.id),
          },
        );
      } catch (error) {
        console.warn("[BullMQ] enqueue detect vocal type fallback:", error);
      }
    }

    return { status };
  },

  async detectVocalType(input: { orgId: string; vocalId: string }) {
    const provider = getAIProvider();
    const vocal = await vocalsService.getByIdForProcessing({
      orgId: input.orgId,
      id: input.vocalId,
    });

    if (!vocal.transcript || !vocal.transcript.trim()) {
      await vocalsService.setVocalType({
        orgId: input.orgId,
        id: vocal.id,
        vocalType: null,
        status: "REVIEW_REQUIRED",
      });
      await reviewQueueService.createOpenItem({
        orgId: input.orgId,
        itemType: "VOCAL",
        itemId: vocal.id,
        reason: "VOCAL_NO_TRANSCRIPT_FOR_TYPE",
      });
      return { status: "REVIEW_REQUIRED" as const, reason: "missing_transcript" };
    }

    const result = await provider.detectVocalType({
      transcript: vocal.transcript,
      summary: vocal.summary,
    });

    if (!result.vocalType || result.confidence < MIN_VOCAL_TYPE_CONFIDENCE) {
      await vocalsService.setVocalType({
        orgId: input.orgId,
        id: vocal.id,
        vocalType: null,
        status: "REVIEW_REQUIRED",
      });
      await reviewQueueService.createOpenItem({
        orgId: input.orgId,
        itemType: "VOCAL",
        itemId: vocal.id,
        reason: "VOCAL_TYPE_REVIEW_REQUIRED",
        payload: {
          confidence: result.confidence,
          reasoning: result.reasoning,
          proposedType: result.vocalType,
        },
      });
      return { status: "REVIEW_REQUIRED" as const, reason: "low_confidence" };
    }

    await vocalsService.setVocalType({
      orgId: input.orgId,
      id: vocal.id,
      vocalType: result.vocalType,
    });

    if (result.vocalType === "VISITE_INITIALE") {
      if (!vocal.propertyId) {
        await reviewQueueService.createOpenItem({
          orgId: input.orgId,
          itemType: "VOCAL",
          itemId: vocal.id,
          reason: "VOCAL_INITIAL_VISIT_NO_PROPERTY",
        });
        return {
          status: "REVIEW_REQUIRED" as const,
          reason: "initial_visit_missing_property",
        };
      }

      if (isQueueEnabled()) {
        try {
          await enqueueAiExtractInitialVisitPropertyParams(
            getAiQueueClient(),
            {
              orgId: input.orgId,
              vocalId: vocal.id,
            },
            {
              jobId: buildJobId("vocal", "property", input.orgId, vocal.id),
            },
          );
        } catch (error) {
          console.warn("[BullMQ] enqueue extract initial-visit params fallback:", error);
        }
      }
    }

    return { status: "TYPE_CLASSIFIED" as const, vocalType: result.vocalType };
  },

  async extractInitialVisitPropertyParams(input: { orgId: string; vocalId: string }) {
    const provider = getAIProvider();
    const vocal = await vocalsService.getByIdForProcessing({
      orgId: input.orgId,
      id: input.vocalId,
    });

    if (vocal.vocalType !== "VISITE_INITIALE") {
      return { status: "SKIPPED" as const, reason: "not_initial_visit" };
    }

    if (!vocal.propertyId) {
      await reviewQueueService.createOpenItem({
        orgId: input.orgId,
        itemType: "VOCAL",
        itemId: vocal.id,
        reason: "VOCAL_INITIAL_VISIT_NO_PROPERTY",
      });
      return { status: "REVIEW_REQUIRED" as const, reason: "missing_property" };
    }

    if (!vocal.transcript || !vocal.transcript.trim()) {
      await reviewQueueService.createOpenItem({
        orgId: input.orgId,
        itemType: "VOCAL",
        itemId: vocal.id,
        reason: "VOCAL_NO_TRANSCRIPT",
      });
      return { status: "REVIEW_REQUIRED" as const, reason: "missing_transcript" };
    }

    const extracted = await provider.extractInitialVisitPropertyParams({
      transcript: vocal.transcript,
      summary: vocal.summary,
    });

    if (extracted.confidence < MIN_INITIAL_VISIT_EXTRACTION_CONFIDENCE) {
      await reviewQueueService.createOpenItem({
        orgId: input.orgId,
        itemType: "VOCAL",
        itemId: vocal.id,
        reason: "VOCAL_INITIAL_VISIT_LOW_CONFIDENCE",
        payload: {
          confidence: extracted.confidence,
        },
      });
      return { status: "REVIEW_REQUIRED" as const, reason: "low_confidence" };
    }

    const patchPayload: {
      title?: string;
      address?: string;
      city?: string;
      postalCode?: string;
      price?: number;
      details?: Record<string, unknown>;
    } = {};

    if (extracted.title && extracted.title.trim()) {
      patchPayload.title = extracted.title.trim();
    }
    if (extracted.address && extracted.address.trim()) {
      patchPayload.address = extracted.address.trim();
    }
    if (extracted.city && extracted.city.trim()) {
      patchPayload.city = extracted.city.trim();
    }
    if (extracted.postalCode && extracted.postalCode.trim()) {
      patchPayload.postalCode = extracted.postalCode.trim();
    }
    if (
      typeof extracted.price === "number" &&
      Number.isFinite(extracted.price) &&
      extracted.price > 0
    ) {
      patchPayload.price = Math.round(extracted.price);
    }

    patchPayload.details = {
      aiInitialVisit: extracted.details,
      aiInitialVisitMeta: {
        vocalId: vocal.id,
        confidence: extracted.confidence,
        processedAt: new Date().toISOString(),
      },
    };

    await propertiesService.patchById({
      orgId: input.orgId,
      id: vocal.propertyId,
      data: patchPayload,
    });

    return { status: "UPDATED" as const, propertyId: vocal.propertyId };
  },

  async extractVocalInsights(input: { orgId: string; vocalId: string }) {
    const provider = getAIProvider();
    const vocal = await vocalsService.getByIdForProcessing({
      orgId: input.orgId,
      id: input.vocalId,
    });

    if (!vocal.transcript || !vocal.transcript.trim()) {
      await reviewQueueService.createOpenItem({
        orgId: input.orgId,
        itemType: "VOCAL",
        itemId: vocal.id,
        reason: "VOCAL_NO_TRANSCRIPT",
      });
      await vocalsService.setInsights({
        orgId: input.orgId,
        id: vocal.id,
        insights: {},
        status: "REVIEW_REQUIRED",
      });
      return { status: "REVIEW_REQUIRED" as const, reason: "missing_transcript" };
    }

    const extracted = await provider.extractVocalInsights({
      transcript: vocal.transcript,
      summary: vocal.summary,
    });

    const hasInsights = Object.keys(extracted.insights).length > 0;
    const targetStatus =
      hasInsights && extracted.confidence >= MIN_INSIGHTS_CONFIDENCE
        ? vocal.status === "REVIEW_REQUIRED"
          ? "REVIEW_REQUIRED"
          : "INSIGHTS_READY"
        : "REVIEW_REQUIRED";

    await vocalsService.setInsights({
      orgId: input.orgId,
      id: vocal.id,
      insights: extracted.insights,
      status: targetStatus,
    });

    if (targetStatus === "REVIEW_REQUIRED") {
      await reviewQueueService.createOpenItem({
        orgId: input.orgId,
        itemType: "VOCAL",
        itemId: vocal.id,
        reason: "VOCAL_INSIGHTS_LOW_CONFIDENCE",
        payload: {
          confidence: extracted.confidence,
        },
      });
    }

    return { status: targetStatus };
  },
};
