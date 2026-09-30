const NOT_A_LINK_HINT =
  "Это не ссылка на файл в интернете. Загрузите фото или видео с компьютера через «Редактировать карточку» → «Загрузить файлы», либо вставьте адрес, начинающийся с https://";

/**
 * Приводит вставленный адрес медиа к виду, который принимает API (http(s) или /ingestion-media/).
 * Частые случаи: ссылка без схемы («instagram.com/…»), «//cdn…», путь к файлу на компьютере, data:/blob: из браузера.
 */
export function normalizeMediaUrl(input: string): { ok: true; url: string } | { ok: false; error: string } {
  const value = input.trim();
  if (!value) return { ok: false, error: "Вставьте ссылку на фото или видео." };
  if (value.startsWith("/ingestion-media/")) return { ok: true, url: value };
  if (/^(data|blob|file):/i.test(value) || /^[a-z]:[\\/]/i.test(value) || value.startsWith("\\\\")) {
    return { ok: false, error: NOT_A_LINK_HINT };
  }

  let candidate = value;
  if (candidate.startsWith("//")) candidate = `https:${candidate}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate) && /^[^\s/]+\.[^\s/]+/.test(candidate)) candidate = `https://${candidate}`;

  try {
    const parsed = new URL(candidate);
    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname.includes(".")) {
      return { ok: true, url: parsed.toString() };
    }
  } catch {
    // fallthrough
  }
  return { ok: false, error: NOT_A_LINK_HINT };
}
