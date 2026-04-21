export type TriggerMode = "manual" | "auto";

export type TransitionActor = {
  actorId: string | null;
  /** Маркер системы, если actorId отсутствует (например system:draft-from-intake). */
  actorMarker?: string | null;
};
