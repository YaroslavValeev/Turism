import "../src/env/loadProcessEnv";
import { prisma } from "../src/lib/prisma";

async function main() {
  const now = new Date();
  const base = {
    status: { in: ["new", "needs_review", "approved"] as const },
    publishedProgram: null,
    finalScore: { gte: 0.62 },
  };
  const withDate = {
    ...base,
    normalizedItem: { OR: [{ startDate: null }, { startDate: { gte: now } }] },
  };
  const [c2, c1] = await Promise.all([
    prisma.eventCandidate.count({ where: base }),
    prisma.eventCandidate.count({ where: withDate }),
  ]);
  const atvCount = await prisma.eventCandidate.count({
    where: {
      status: { in: ["new", "needs_review", "approved"] },
      publishedProgram: null,
      finalScore: { gte: 0.62 },
      normalizedItem: {
        AND: [
          { OR: [{ startDate: null }, { startDate: { gte: now } }] },
          { rawItem: { is: { sourceId: "cmobhx16k000b148s815ke07c" } } },
        ],
      },
    },
  });
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        event: "autopublish_queue_shape",
        candidates_gte_062_unpublished: c2,
        with_future_or_null_startDate_total: c1,
        atv51_candidates_in_autopublish_queue_shape: atvCount,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
