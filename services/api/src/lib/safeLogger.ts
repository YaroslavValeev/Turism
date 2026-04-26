const EMAIL_RE = /([a-zA-Z0-9._%+-]{2})[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/g;
const TELEGRAM_RE = /@([a-zA-Z0-9_]{2})[a-zA-Z0-9_]+/g;

function redact(value: string): string {
  return value
    .replace(EMAIL_RE, (_match, start: string, domain: string) => `${start}***@${domain}`)
    .replace(PHONE_RE, "[redacted-phone]")
    .replace(TELEGRAM_RE, (_match, start: string) => `@${start}***`);
}

export function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) return redact(error.message);
  return "unknown_error";
}

export function safeLog(message: string, payload?: unknown): void {
  if (payload === undefined) {
    console.log(message);
    return;
  }
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
  console.log(message, redact(raw));
}

export function safeError(message: string, error?: unknown): void {
  if (error === undefined) {
    console.error(message);
    return;
  }
  console.error(message, toSafeErrorMessage(error));
}
