import "../src/env/loadProcessEnv";
import fs from "fs/promises";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

type ImportSource = {
  type: string;
  name: string;
  urlOrHandle: string;
  discipline?: string | null;
  country?: string | null;
  region?: string | null;
  language?: string | null;
  priority?: number;
  trustScore?: number;
  parserProfile?: string | null;
  fetchIntervalMinutes?: number;
  isActive?: boolean;
  organizerId?: string | null;
  metaJson?: Prisma.InputJsonValue;
};

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Usage: tsx prisma/import_sources.ts <json-file>");
  }

  const payload = JSON.parse(await fs.readFile(filePath, "utf8")) as ImportSource[];
  if (!Array.isArray(payload)) {
    throw new Error("Import payload must be an array");
  }

  let created = 0;
  let updated = 0;

  for (const item of payload) {
    const existing = await prisma.source.findFirst({
      where: {
        type: item.type,
        urlOrHandle: item.urlOrHandle,
      },
    });

    const data: Prisma.SourceUncheckedCreateInput = {
      type: item.type,
      name: item.name.trim(),
      urlOrHandle: item.urlOrHandle.trim(),
      discipline: toNullableString(item.discipline),
      country: toNullableString(item.country),
      region: toNullableString(item.region),
      language: toNullableString(item.language) ?? "ru",
      priority: Number.isFinite(item.priority) ? Number(item.priority) : 100,
      trustScore: Number.isFinite(item.trustScore) ? Number(item.trustScore) : 0.5,
      parserProfile: toNullableString(item.parserProfile),
      fetchIntervalMinutes:
        Number.isFinite(item.fetchIntervalMinutes) && Number(item.fetchIntervalMinutes) > 0
          ? Number(item.fetchIntervalMinutes)
          : 1440,
      isActive: item.isActive !== false,
      organizerId: toNullableString(item.organizerId),
      metaJson: (item.metaJson ?? {}) as Prisma.InputJsonValue,
    };

    if (existing) {
      await prisma.source.update({
        where: { id: existing.id },
        data: {
          ...data,
          metaJson: {
            ...(existing.metaJson && typeof existing.metaJson === "object" && !Array.isArray(existing.metaJson)
              ? (existing.metaJson as Record<string, unknown>)
              : {}),
            ...(item.metaJson && typeof item.metaJson === "object" && !Array.isArray(item.metaJson)
              ? (item.metaJson as Record<string, unknown>)
              : {}),
          } as Prisma.InputJsonValue,
        },
      });
      updated += 1;
    } else {
      await prisma.source.create({ data });
      created += 1;
    }
  }

  console.log(JSON.stringify({ total: payload.length, created, updated }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
