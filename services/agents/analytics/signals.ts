import { loadOrchestratorLimits } from "../shared/orchestratorLimits.js";

export type SignalStrength = "STRONG" | "WEAK" | "NONE";

export type SignalRow = {
  entryType: string;
  entryId: string;
  bookingCount: number;
  signal: SignalStrength;
};

export function buildSignal(
  row: { bookingCount: number },
  thresholds = loadOrchestratorLimits()
): SignalStrength {
  if (row.bookingCount >= thresholds.strongThreshold) return "STRONG";
  if (row.bookingCount >= thresholds.weakThreshold) return "WEAK";
  return "NONE";
}

export function buildSignals(
  rows: Array<{ entryType: string; entryId: string; bookingCount: number }>,
  thresholds = loadOrchestratorLimits()
): SignalRow[] {
  return rows.map((row) => ({
    entryType: row.entryType,
    entryId: row.entryId,
    bookingCount: row.bookingCount,
    signal: buildSignal(row, thresholds),
  }));
}

export function summarizeSignals(signals: SignalRow[]): {
  strong: SignalRow[];
  weak: SignalRow[];
  none: SignalRow[];
} {
  const strong: SignalRow[] = [];
  const weak: SignalRow[] = [];
  const none: SignalRow[] = [];
  for (const s of signals) {
    if (s.signal === "STRONG") strong.push(s);
    else if (s.signal === "WEAK") weak.push(s);
    else none.push(s);
  }
  strong.sort((a, b) => b.bookingCount - a.bookingCount);
  weak.sort((a, b) => b.bookingCount - a.bookingCount);
  none.sort((a, b) => b.bookingCount - a.bookingCount);
  return { strong, weak, none };
}

/** `source` в формате `entryType/entryId` (как в marketing action). */
export function findSignalBySource(signals: SignalRow[], source: string): SignalRow | undefined {
  const key = source.trim();
  for (const s of signals) {
    if (`${s.entryType}/${s.entryId}` === key) return s;
  }
  return undefined;
}
