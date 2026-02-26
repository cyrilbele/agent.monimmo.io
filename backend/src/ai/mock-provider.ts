import type {
  AIProvider,
  ClassifyFileInput,
  ClassifyFileResult,
  ExtractVocalInsightsInput,
  ExtractVocalInsightsResult,
  MatchMessageToPropertyInput,
  MatchMessageToPropertyResult,
  TranscribeVocalInput,
  TranscribeVocalResult,
} from "./provider";

const normalize = (value: string | null | undefined): string =>
  (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const classifyRules: Array<{ pattern: RegExp; typeDocument: string; confidence: number }> = [
  { pattern: /dpe/, typeDocument: "DPE", confidence: 0.94 },
  { pattern: /amiante/, typeDocument: "AMIANTE", confidence: 0.92 },
  { pattern: /plomb/, typeDocument: "PLOMB", confidence: 0.91 },
  { pattern: /electri|electricite/, typeDocument: "ELECTRICITE", confidence: 0.9 },
  { pattern: /gaz/, typeDocument: "GAZ", confidence: 0.9 },
  { pattern: /taxe.fonciere/, typeDocument: "TAXE_FONCIERE", confidence: 0.89 },
  { pattern: /titre.propriete/, typeDocument: "TITRE_PROPRIETE", confidence: 0.9 },
  { pattern: /mandat/, typeDocument: "MANDAT_VENTE_SIGNE", confidence: 0.88 },
  { pattern: /piece.identite|cni|passport/, typeDocument: "PIECE_IDENTITE", confidence: 0.9 },
  { pattern: /compromis|promesse/, typeDocument: "COMPROMIS_OU_PROMESSE", confidence: 0.87 },
  { pattern: /carrez/, typeDocument: "LOI_CARREZ", confidence: 0.9 },
  { pattern: /charges|copropriete/, typeDocument: "MONTANT_CHARGES", confidence: 0.81 },
];

const classifyByFilename = (input: ClassifyFileInput): ClassifyFileResult => {
  const haystack = normalize(`${input.fileName} ${input.mimeType}`);

  for (const rule of classifyRules) {
    if (rule.pattern.test(haystack)) {
      return {
        typeDocument: rule.typeDocument,
        confidence: rule.confidence,
        reasoning: `Motif '${rule.pattern.source}' détecté dans le nom/mime`,
      };
    }
  }

  return {
    typeDocument: null,
    confidence: 0.35,
    reasoning: "Aucun motif documentaire détecté",
  };
};

const findPropertyMatch = (
  input: MatchMessageToPropertyInput,
): MatchMessageToPropertyResult => {
  const haystack = normalize(`${input.subject ?? ""} ${input.body}`);

  const scored = input.properties
    .map((property) => {
      const title = normalize(property.title);
      const city = normalize(property.city);
      const postalCode = normalize(property.postalCode);
      const address = normalize(property.address);

      let score = 0;
      if (title && haystack.includes(title)) {
        score += 0.7;
      }
      if (city && haystack.includes(city)) {
        score += 0.45;
      }
      if (postalCode && haystack.includes(postalCode)) {
        score += 0.3;
      }
      if (address && haystack.includes(address)) {
        score += 0.2;
      }

      return { propertyId: property.id, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];

  if (!best || best.score < 0.45) {
    return {
      propertyId: null,
      confidence: 0.2,
      ambiguousPropertyIds: [],
      reasoning: "Aucun signal fort de rattachement détecté",
    };
  }

  if (second && second.score >= 0.45 && Math.abs(best.score - second.score) < 0.2) {
    return {
      propertyId: null,
      confidence: 0.48,
      ambiguousPropertyIds: [best.propertyId, second.propertyId],
      reasoning: "Plusieurs biens semblent plausibles",
    };
  }

  return {
    propertyId: best.propertyId,
    confidence: Math.min(0.95, best.score),
    ambiguousPropertyIds: [],
    reasoning: "Rattachement déterminé par similarité texte/bien",
  };
};

const transcribe = (input: TranscribeVocalInput): TranscribeVocalResult => {
  const fileName = normalize(input.fileName);

  if (fileName.includes("silence") || fileName.includes("vide")) {
    return {
      transcript: "",
      summary: "",
      confidence: 0.1,
    };
  }

  return {
    transcript: `Transcription simulée: le client souhaite visiter rapidement et discuter du prix pour ${input.fileName}.`,
    summary: "Client motivé, demande de visite et discussion prix.",
    confidence: 0.83,
  };
};

const extractInsights = (
  input: ExtractVocalInsightsInput,
): ExtractVocalInsightsResult => {
  const transcript = input.transcript.trim();
  if (!transcript) {
    return {
      insights: {},
      confidence: 0.2,
    };
  }

  const priceMatch = transcript.match(/(\d{2,3}(?:[ .]?\d{3})+)/);
  const budget = priceMatch ? Number(priceMatch[1].replace(/[ .]/g, "")) : null;

  return {
    insights: {
      nextAction: "Rappeler le client pour caler une visite",
      sentiment: "positif",
      budget,
      hasBudgetSignal: budget !== null,
    },
    confidence: 0.8,
  };
};

export class MockAIProvider implements AIProvider {
  async matchMessageToProperty(
    input: MatchMessageToPropertyInput,
  ): Promise<MatchMessageToPropertyResult> {
    return findPropertyMatch(input);
  }

  async classifyFile(input: ClassifyFileInput): Promise<ClassifyFileResult> {
    return classifyByFilename(input);
  }

  async transcribeVocal(input: TranscribeVocalInput): Promise<TranscribeVocalResult> {
    return transcribe(input);
  }

  async extractVocalInsights(
    input: ExtractVocalInsightsInput,
  ): Promise<ExtractVocalInsightsResult> {
    return extractInsights(input);
  }
}
