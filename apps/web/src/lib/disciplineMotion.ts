// One discipline passes the centre every four seconds, without a dwell or snap.
export const DISCIPLINE_STEP_MS = 4000;

export const wrapDisciplinePosition = (position: number, count: number) => count > 0
  ? ((position % count) + count) % count
  : 0;

export function advanceDisciplinePosition(position: number, elapsedMs: number, count: number) {
  return wrapDisciplinePosition(position + Math.max(0, elapsedMs) / DISCIPLINE_STEP_MS, count);
}

export function disciplinePose(index: number, position: number, count: number, gap: number, angleStep: number, visibleSteps: number) {
  const distance = wrapDisciplinePosition(index - position + count / 2, count) - count / 2;
  const angle = Math.max(-visibleSteps - 1, Math.min(visibleSteps + 1, distance)) * angleStep;
  const depth = 1 - Math.cos(angle);
  // The wrap seam is completely hidden; figures fade in at the edge of the scene.
  const opacity = Math.max(0, Math.min(1, (visibleSteps + 0.5 - Math.abs(distance)) / 0.6));
  return {
    x: Math.sin(angle) * gap / Math.sin(angleStep),
    z: 60 - depth * 120,
    scale: Math.max(0.66, 1 - depth * 0.75),
    turn: -distance * 6,
    inkOpacity: Math.max(0.64, 1 - depth * 0.65),
    opacity,
    zIndex: Math.round(100 - Math.abs(distance) * 10),
  };
}
