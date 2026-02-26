import { and, eq } from "drizzle-orm";
import { getAIProvider } from ".";
import { db } from "../db/client";
import { files, messages, properties } from "../db/schema";
import { filesService } from "../files/service";
import { HttpError } from "../http/errors";
import { messagesService } from "../messages/service";
import { reviewQueueService } from "../review-queue/service";
import { vocalsService } from "../vocals/service";

const MIN_MESSAGE_MATCH_CONFIDENCE = 0.6;
const MIN_FILE_CLASSIFICATION_CONFIDENCE = 0.65;
const MIN_TRANSCRIPT_CONFIDENCE = 0.6;
const MIN_INSIGHTS_CONFIDENCE = 0.5;

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

    const transcription = await provider.transcribeVocal({
      fileName: vocal.fileName,
      mimeType: vocal.mimeType,
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

    return { status };
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
