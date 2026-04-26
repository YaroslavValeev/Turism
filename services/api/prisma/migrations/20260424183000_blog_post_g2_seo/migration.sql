-- G2: SEO, классификация, связи для blog_posts

ALTER TABLE "blog_posts" ADD COLUMN "seoTitle" TEXT;
ALTER TABLE "blog_posts" ADD COLUMN "seoDescription" TEXT;
ALTER TABLE "blog_posts" ADD COLUMN "canonicalUrl" TEXT;
ALTER TABLE "blog_posts" ADD COLUMN "ogImage" TEXT;
ALTER TABLE "blog_posts" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "blog_posts" ADD COLUMN "discipline" TEXT;
ALTER TABLE "blog_posts" ADD COLUMN "region" TEXT;
ALTER TABLE "blog_posts" ADD COLUMN "country" TEXT;
ALTER TABLE "blog_posts" ADD COLUMN "relatedProgramIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "blog_posts" ADD COLUMN "relatedOrganizerIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "blog_posts_discipline_idx" ON "blog_posts"("discipline");
CREATE INDEX "blog_posts_region_idx" ON "blog_posts"("region");

CREATE UNIQUE INDEX "blog_posts_slug_placement_key" ON "blog_posts"("slug", "placement");
