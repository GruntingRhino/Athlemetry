ALTER TABLE "UserReport"
  ADD COLUMN "disputedFrameIndex" INTEGER,
  ADD COLUMN "accuracyRating" INTEGER,
  ADD COLUMN "usefulnessRating" INTEGER;

ALTER TABLE "UserReport"
  ADD CONSTRAINT "UserReport_accuracyRating_check" CHECK ("accuracyRating" IS NULL OR "accuracyRating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "UserReport_usefulnessRating_check" CHECK ("usefulnessRating" IS NULL OR "usefulnessRating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "UserReport_disputedFrameIndex_check" CHECK ("disputedFrameIndex" IS NULL OR "disputedFrameIndex" >= 0);
