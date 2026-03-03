const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  "flac",
  "m4a",
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "oga",
  "ogg",
  "wav",
  "webm",
]);

const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  "audio/flac",
  "audio/x-flac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/mpga",
  "audio/oga",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "video/mp4",
  "video/webm",
  "application/octet-stream",
]);

const extractFileExtension = (fileName: string): string | null => {
  const normalized = fileName.trim();
  if (!normalized) {
    return null;
  }

  const lastDotIndex = normalized.lastIndexOf(".");
  if (lastDotIndex <= 0 || lastDotIndex === normalized.length - 1) {
    return null;
  }

  return normalized.slice(lastDotIndex + 1).toLowerCase();
};

const normalizeMimeType = (mimeType: string): string =>
  mimeType
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase() ?? "";

export const validateVocalAudioFormat = (input: {
  fileName: string;
  mimeType: string;
}): { valid: true } | { valid: false; message: string } => {
  const extension = extractFileExtension(input.fileName);
  if (!extension) {
    return {
      valid: false,
      message:
        "Le nom du fichier vocal doit inclure une extension audio supportée (flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm).",
    };
  }

  if (!SUPPORTED_AUDIO_EXTENSIONS.has(extension)) {
    return {
      valid: false,
      message: `Extension vocale non supportée (.${extension}).`,
    };
  }

  const normalizedMimeType = normalizeMimeType(input.mimeType);
  if (!normalizedMimeType) {
    return {
      valid: false,
      message: "Le type MIME du vocal est requis.",
    };
  }

  if (
    SUPPORTED_AUDIO_MIME_TYPES.has(normalizedMimeType) ||
    normalizedMimeType.startsWith("audio/")
  ) {
    return { valid: true };
  }

  return {
    valid: false,
    message: `Type MIME vocal non supporté (${normalizedMimeType}).`,
  };
};
