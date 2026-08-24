-- Preserve an athlete's explicit request to rerun an existing submission for administrator review.
-- Requests do not queue processing automatically.
ALTER TYPE "ReportRequestType" ADD VALUE 'REPROCESS';
