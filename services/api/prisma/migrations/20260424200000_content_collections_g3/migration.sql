-- G3.1: тематические подборки
CREATE TABLE "content_collections" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "body" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "collectionType" TEXT NOT NULL DEFAULT 'manual',
    "discipline" TEXT,
    "region" TEXT,
    "country" TEXT,
    "season" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "canonicalUrl" TEXT,
    "ogImage" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "relatedBlogPostIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "relatedProgramIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "relatedOrganizerIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_collections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "content_collections_slug_key" ON "content_collections"("slug");
CREATE INDEX "content_collections_status_idx" ON "content_collections"("status");
CREATE INDEX "content_collections_discipline_idx" ON "content_collections"("discipline");
CREATE INDEX "content_collections_region_idx" ON "content_collections"("region");
CREATE INDEX "content_collections_season_idx" ON "content_collections"("season");
