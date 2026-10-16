import { isOnRequestProgram, onRequestLabel, type ProgramScheduleFields } from "./programSchedule";
import { formatDateRangeRu } from "./programDisplay";

type Schedule = ProgramScheduleFields & { startDate: string; endDate: string };

export function programDateLabel(program: Schedule): string {
  if (isOnRequestProgram(program)) return onRequestLabel(program);
  const start = new Date(program.startDate);
  const end = new Date(program.endDate);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || end < start) return "Даты уточняются";
  return formatDateRangeRu(program.startDate, program.endDate) ?? "Даты уточняются";
}
