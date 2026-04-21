import { getApiEnv } from "../analytics/runtimeEnv";
import { prisma } from "../../lib/prisma";
import { processOneProgramConversion } from "./processProgramConversion";

/** Вызывается после успешного перехода программы в `published`. */
export async function initProgramConversionFunnelOnPublish(programId: string): Promise<void> {
  const env = getApiEnv();
  if (!env.CONVERSION_FUNNEL_ENABLED) return;

  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { organizerId: true, publishStatus: true },
  });
  if (!program || program.publishStatus !== "published") return;

  const existing = await prisma.programConversionState.findUnique({ where: { programId } });
  if (existing) {
    await processOneProgramConversion(prisma, env, programId);
    return;
  }

  await prisma.programConversionState.create({
    data: {
      programId,
      organizerId: program.organizerId,
      firstPublishedAt: new Date(),
    },
  });
  await processOneProgramConversion(prisma, env, programId);
}
