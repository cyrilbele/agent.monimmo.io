import type {
  AIProvider,
  ClassifyFileInput,
  ClassifyFileResult,
  DetectVocalTypeInput,
  DetectVocalTypeResult,
  ExtractVocalInsightsInput,
  ExtractVocalInsightsResult,
  ExtractInitialVisitPropertyParamsInput,
  ExtractInitialVisitPropertyParamsResult,
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
  const audioSize = input.audioData.byteLength;

  if (fileName.includes("silence") || fileName.includes("vide") || audioSize === 0) {
    return {
      transcript: "",
      summary: "",
      confidence: 0.1,
    };
  }

  if (fileName.includes("initiale")) {
    return {
      transcript:
        "Transcription simulée: visite initiale de l'appartement à Lyon 69003, prix estimé 350000 euros.",
      summary: "Visite initiale, paramètres principaux du bien identifiés.",
      confidence: 0.88,
    };
  }

  return {
    transcript: `Transcription simulée: le client souhaite visiter rapidement et discuter du prix pour ${input.fileName}.`,
    summary: "Client motivé, demande de visite et discussion prix.",
    confidence: 0.83,
  };
};

const detectVocalType = (input: DetectVocalTypeInput): DetectVocalTypeResult => {
  const transcript = normalize(input.transcript);

  if (
    transcript.includes("visite initiale") ||
    transcript.includes("premiere visite") ||
    transcript.includes("prise de mandat")
  ) {
    return {
      vocalType: "VISITE_INITIALE",
      confidence: 0.87,
      reasoning: "Indices textuels d'une première visite détectés",
    };
  }

  if (
    transcript.includes("visite de suivi") ||
    transcript.includes("deuxieme visite") ||
    transcript.includes("revisite")
  ) {
    return {
      vocalType: "VISITE_SUIVI",
      confidence: 0.84,
      reasoning: "Indices textuels d'une visite de suivi détectés",
    };
  }

  if (
    transcript.includes("compte rendu") ||
    transcript.includes("retour client") ||
    transcript.includes("avis client")
  ) {
    return {
      vocalType: "COMPTE_RENDU_VISITE_CLIENT",
      confidence: 0.86,
      reasoning: "Indices textuels de compte rendu client détectés",
    };
  }

  return {
    vocalType: null,
    confidence: 0.35,
    reasoning: "Aucun type vocal déterminant n'a été détecté",
  };
};

const extractInitialVisitPropertyParams = (
  input: ExtractInitialVisitPropertyParamsInput,
): ExtractInitialVisitPropertyParamsResult => {
  const transcript = input.transcript.trim();
  const normalized = normalize(transcript);
  const priceMatch = transcript.match(/(\d{2,3}(?:[ .]?\d{3})+)/);
  const postalCodeMatch = transcript.match(/\b\d{5}\b/);

  let city: string | null = null;
  for (const candidate of ["Lyon", "Paris", "Marseille", "Toulouse", "Nantes", "Bordeaux"]) {
    if (normalized.includes(normalize(candidate))) {
      city = candidate;
      break;
    }
  }

  const price = priceMatch ? Number(priceMatch[1].replace(/[ .]/g, "")) : null;
  const postalCode = postalCodeMatch ? postalCodeMatch[0] : null;

  const confidenceSignals = [price, postalCode, city].filter((value) => value !== null).length;
  const confidence = confidenceSignals === 0 ? 0.35 : Math.min(0.9, 0.5 + confidenceSignals * 0.15);

  return {
    title: normalized.includes("appartement")
      ? "Appartement"
      : normalized.includes("maison")
        ? "Maison"
        : null,
    address: null,
    city,
    postalCode,
    price,
    details: {
      source: "mock_initial_visit",
      summary: input.summary ?? null,
      rawTranscriptPreview: transcript.slice(0, 240),
    },
    confidence,
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

  async detectVocalType(input: DetectVocalTypeInput): Promise<DetectVocalTypeResult> {
    return detectVocalType(input);
  }

  async extractInitialVisitPropertyParams(
    input: ExtractInitialVisitPropertyParamsInput,
  ): Promise<ExtractInitialVisitPropertyParamsResult> {
    return extractInitialVisitPropertyParams(input);
  }
}
