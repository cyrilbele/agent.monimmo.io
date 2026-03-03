const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?<!\w)(?:\+?\d[\d .\-()]{7,}\d)(?!\w)/g;
const STREET_PATTERN =
  /\b\d{1,4}\s*(?:bis|ter)?\s*(?:rue|avenue|av\.?|boulevard|bd|chemin|impasse|allee|allée|place|quai|route|faubourg)\b[^\n,;]*/gi;
const POSTAL_CITY_PATTERN = /\b\d{5}\s+[A-Za-zÀ-ÿ' -]{2,}\b/g;

const collapseRepeatedSpace = (value: string): string => value.replace(/[ \t]{2,}/g, " ");

export const redactSensitiveText = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  const redacted = trimmed
    .replace(EMAIL_PATTERN, "[EMAIL_REDACTED]")
    .replace(PHONE_PATTERN, "[PHONE_REDACTED]")
    .replace(STREET_PATTERN, "[ADDRESS_REDACTED]")
    .replace(POSTAL_CITY_PATTERN, "[ADDRESS_REDACTED]");

  return collapseRepeatedSpace(redacted);
};
