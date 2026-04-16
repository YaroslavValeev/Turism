import { prisma } from "../src/lib/prisma";
import { cacheExternalProgramMediaForWeb, isRemoteMediaUrl } from "../src/modules/ingestion/mediaCache";

async function main() {
  const mediaItems = await prisma.programMedia.findMany({
    where: {
      mediaType: "image",
    },
    include: {
      program: {
        select: {
          id: true,
          title: true,
          publishStatus: true,
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  let checked = 0;
  let updated = 0;
  let skipped = 0;

  for (const media of mediaItems) {
    checked += 1;
    if (!isRemoteMediaUrl(media.url)) {
      skipped += 1;
      continue;
    }

    const cachedUrl = await cacheExternalProgramMediaForWeb(media.url, `${media.program.title}-${media.program.id}`);
    if (!cachedUrl || cachedUrl === media.url) {
      skipped += 1;
      continue;
    }

    await prisma.programMedia.update({
      where: { id: media.id },
      data: { url: cachedUrl },
    });
    updated += 1;
  }

  console.log(JSON.stringify({ checked, updated, skipped }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
