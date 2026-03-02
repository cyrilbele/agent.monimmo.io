export type PropertyCandidate = {
  id: string;
  title: string;
  city: string;
  postalCode: string;
  address?: string | null;
};

export type MatchMessageToPropertyInput = {
  subject?: string | null;
  body: string;
  properties: PropertyCandidate[];
};

export type MatchMessageToPropertyResult = {
  propertyId: string | null;
  confidence: number;
  ambiguousPropertyIds: string[];
  reasoning: string;
};

export type ClassifyFileInput = {
  fileName: string;
  mimeType: string;
};

export type ClassifyFileResult = {
  typeDocument: string | null;
  confidence: number;
  reasoning: string;
};

export type TranscribeVocalInput = {
  fileName: string;
  mimeType: string;
  audioData: Uint8Array;
};

export type TranscribeVocalResult = {
  transcript: string;
  summary: string;
  confidence: number;
};

export type ExtractVocalInsightsInput = {
  transcript: string;
  summary?: string | null;
};

export type ExtractVocalInsightsResult = {
  insights: Record<string, unknown>;
  confidence: number;
};

export type VocalType =
  | "VISITE_INITIALE"
  | "VISITE_SUIVI"
  | "COMPTE_RENDU_VISITE_CLIENT"
  | "ERREUR_TRAITEMENT";

export type DetectVocalTypeInput = {
  transcript: string;
  summary?: string | null;
};

export type DetectVocalTypeResult = {
  vocalType: VocalType | null;
  confidence: number;
  reasoning: string;
};

export type ExtractInitialVisitPropertyParamsInput = {
  transcript: string;
  summary?: string | null;
};

export type ExtractInitialVisitPropertyParamsResult = {
  title?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  price?: number | null;
  details: Record<string, unknown>;
  confidence: number;
};

export type PropertyValuationInput = {
  prompt: string;
};

export type PropertyValuationResult = {
  calculatedValuation: number | null;
  justification: string;
};

export interface AIProvider {
  matchMessageToProperty(
    input: MatchMessageToPropertyInput,
  ): Promise<MatchMessageToPropertyResult>;
  classifyFile(input: ClassifyFileInput): Promise<ClassifyFileResult>;
  transcribeVocal(input: TranscribeVocalInput): Promise<TranscribeVocalResult>;
  extractVocalInsights(
    input: ExtractVocalInsightsInput,
  ): Promise<ExtractVocalInsightsResult>;
  detectVocalType(input: DetectVocalTypeInput): Promise<DetectVocalTypeResult>;
  extractInitialVisitPropertyParams(
    input: ExtractInitialVisitPropertyParamsInput,
  ): Promise<ExtractInitialVisitPropertyParamsResult>;
  computePropertyValuation(input: PropertyValuationInput): Promise<PropertyValuationResult>;
}
