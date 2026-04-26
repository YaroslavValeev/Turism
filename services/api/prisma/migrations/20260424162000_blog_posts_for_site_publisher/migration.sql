CREATE TABLE "blog_posts" (
  "id" TEXT NOT NULL,
  "contentItemId" TEXT NOT NULL,
  "contentDraftId" TEXT NOT NULL,
  "placement" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "excerpt" TEXT,
  "body" TEXT,
  "sourceUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'published',
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "blog_posts_contentDraftId_placement_key" ON "blog_posts"("contentDraftId","placement");
CREATE INDEX "blog_posts_slug_idx" ON "blog_posts"("slug");

ALTER TABLE "blog_posts"
  ADD CONSTRAINT "blog_posts_contentItemId_fkey"
  FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "blog_posts"
  ADD CONSTRAINT "blog_posts_contentDraftId_fkey"
  FOREIGN KEY ("contentDraftId") REFERENCES "content_drafts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

