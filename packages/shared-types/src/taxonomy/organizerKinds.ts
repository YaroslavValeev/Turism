import { normalizeToken } from "./normalize";

/**
 * Типы организаторов. Свободный текст вида «туроператор/горная школа» раскладывается
 * в несколько типов через resolveOrganizerKinds.
 *
 * aliases — подстроки (основы слов): часть текста относится к типу, если содержит alias;
 * при нескольких совпадениях выигрывает самый длинный alias
 * («организатор активных туров» → tour_operator, а не event_organizer).
 */

export type OrganizerKindDef = {
  id: string;
  labelRu: string;
  aliases: readonly string[];
};

export const ORGANIZER_KINDS = [
  {
    id: "tour_operator",
    labelRu: "Туроператор",
    aliases: ["туроператор", "tour operator", "touroperator", "турфирма", "туристическая компания", "организатор активных туров", "организатор туров"],
  },
  { id: "school", labelRu: "Школа", aliases: ["школа", "school"] },
  { id: "guide_team", labelRu: "Команда гидов", aliases: ["гид", "guide"] },
  { id: "club", labelRu: "Клуб", aliases: ["клуб", "club"] },
  { id: "base", labelRu: "База", aliases: ["база", "турбаза", "base", "lodge"] },
  {
    id: "event_organizer",
    labelRu: "Организатор событий",
    aliases: ["организатор", "event organizer", "организатор соревнований", "организатор мероприятий"],
  },
  { id: "instructor_service", labelRu: "Служба инструкторов", aliases: ["инструктор", "instructor"] },
] as const satisfies readonly OrganizerKindDef[];

export type OrganizerKindId = (typeof ORGANIZER_KINDS)[number]["id"];

export const ORGANIZER_KIND_IDS: readonly OrganizerKindId[] = ORGANIZER_KINDS.map((k) => k.id);

const KIND_SPLIT_RE = /[/,+]/;

function resolveOrganizerKindPart(part: string): OrganizerKindId | null {
  const n = normalizeToken(part);
  if (!n) return null;
  let best: { id: OrganizerKindId; len: number } | null = null;
  for (const kind of ORGANIZER_KINDS) {
    for (const alias of kind.aliases) {
      const a = normalizeToken(alias);
      if (n.includes(a) && (!best || a.length > best.len)) best = { id: kind.id, len: a.length };
    }
  }
  return best?.id ?? null;
}

/** «туроператор/горная школа» → ["tour_operator", "school"]; нераспознанные части пропускаются. */
export function resolveOrganizerKinds(kindText: string | null | undefined): OrganizerKindId[] {
  if (!kindText) return [];
  const out: OrganizerKindId[] = [];
  for (const part of kindText.split(KIND_SPLIT_RE)) {
    const id = resolveOrganizerKindPart(part);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}
