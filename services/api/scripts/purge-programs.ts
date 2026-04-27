import { prisma } from "../src/lib/prisma";

type ProgramRow = {
  id: string;
  title: string;
  organizerName: string | null;
  intakeSource: string | null;
  sourceUrl: string | null;
  publishStatus: string;
  organizer: { displayName: string } | null;
};

const markerRegex = /(\b(e2e|test|demo|seed|synthetic)\b|тест|синтет|cmof|example\.com|localhost)/i;

function hasSyntheticMarker(value: string | null | undefined): boolean {
  return markerRegex.test(String(value ?? "").trim());
}

function parseExplicitIdsFromArgs(): Set<string> {
  const args = process.argv.slice(2);
  const ids = new Set<string>();
  for (const arg of args) {
    for (const chunk of arg.split(",")) {
      const v = chunk.trim();
      if (v) ids.add(v);
    }
  }
  return ids;
}

function shouldDeleteProgram(program: ProgramRow, explicitIds: Set<string>): boolean {
  if (explicitIds.has(program.id)) return true;
  if (hasSyntheticMarker(program.title)) return true;
  if (hasSyntheticMarker(program.organizerName)) return true;
  if (hasSyntheticMarker(program.organizer?.displayName)) return true;
  if (hasSyntheticMarker(program.intakeSource)) return true;
  if (hasSyntheticMarker(program.sourceUrl)) return true;
  return false;
}

async function purgePrograms(programIds: string[]) {
  await prisma.$transaction(async (tx) => {
    await tx.billingStatementLine.deleteMany({ where: { commission: { programId: { in: programIds } } } });
    await tx.review.deleteMany({ where: { programId: { in: programIds } } });
    await tx.refund.deleteMany({ where: { programId: { in: programIds } } });
    await tx.payment.deleteMany({ where: { programId: { in: programIds } } });
    await tx.commission.deleteMany({ where: { programId: { in: programIds } } });
    await tx.reviewRequest.deleteMany({ where: { programId: { in: programIds } } });
    await tx.incident.deleteMany({ where: { programId: { in: programIds } } });
    await tx.booking.deleteMany({ where: { programId: { in: programIds } } });
    await tx.lead.deleteMany({ where: { programId: { in: programIds } } });
    await tx.publishedProgram.deleteMany({ where: { programId: { in: programIds } } });
    await tx.programMedia.deleteMany({ where: { programId: { in: programIds } } });
    await tx.program.deleteMany({ where: { id: { in: programIds } } });
  });
}

async function main() {
  const explicitIds = parseExplicitIdsFromArgs();
  const candidates = await prisma.program.findMany({
    include: { organizer: { select: { displayName: true } } },
    orderBy: { createdAt: "desc" },
  });

  const toDelete = candidates.filter((p) => shouldDeleteProgram(p, explicitIds));

  const preview = {
    explicitIds: Array.from(explicitIds),
    totalPrograms: candidates.length,
    markedForDeletion: toDelete.length,
    sample: toDelete.slice(0, 50).map((p) => ({
      id: p.id,
      title: p.title,
      publishStatus: p.publishStatus,
      organizerName: p.organizerName,
      organizerDisplayName: p.organizer?.displayName ?? null,
      sourceUrl: p.sourceUrl,
      intakeSource: p.intakeSource,
    })),
  };

  const confirm = process.env.CONFIRM_PURGE === "1";
  if (!confirm) {
    console.log(JSON.stringify({ ok: true, mode: "dry-run", ...preview }, null, 2));
    return;
  }

  if (toDelete.length === 0) {
    console.log(JSON.stringify({ ok: true, mode: "apply", message: "nothing_to_delete", ...preview }, null, 2));
    return;
  }

  const ids = toDelete.map((p) => p.id);
  await purgePrograms(ids);
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "apply",
        deletedProgramCount: ids.length,
        deletedProgramIds: ids,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
