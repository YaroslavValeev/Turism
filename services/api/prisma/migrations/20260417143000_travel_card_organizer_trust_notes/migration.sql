-- Optional travel-card fields (organizer) + platform tips; organizer trust summaries (subset on public program page).

ALTER TABLE "programs" ADD COLUMN "packingListNotes" TEXT;
ALTER TABLE "programs" ADD COLUMN "accommodationNotes" TEXT;
ALTER TABLE "programs" ADD COLUMN "transportNotes" TEXT;
ALTER TABLE "programs" ADD COLUMN "sightsNotes" TEXT;
ALTER TABLE "programs" ADD COLUMN "planBWeatherNotes" TEXT;
ALTER TABLE "programs" ADD COLUMN "platformTravelTips" TEXT;

ALTER TABLE "organizers" ADD COLUMN "certificatesSummary" TEXT;
ALTER TABLE "organizers" ADD COLUMN "insuranceSummary" TEXT;
ALTER TABLE "organizers" ADD COLUMN "emergencyPlanSummary" TEXT;
ALTER TABLE "organizers" ADD COLUMN "equipmentSummary" TEXT;
