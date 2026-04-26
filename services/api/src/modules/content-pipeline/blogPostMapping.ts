/**
 * G2: слой сопоставления normalized → blog_post → программы/организаторы.
 * Эвристики без «магического» AI: расширяем по мере появления правил.
 */
export function suggestRelationsFromNormalizedPayload(_payload: unknown): {
  relatedProgramIds: string[];
  relatedOrganizerIds: string[];
} {
  return { relatedProgramIds: [], relatedOrganizerIds: [] };
}
