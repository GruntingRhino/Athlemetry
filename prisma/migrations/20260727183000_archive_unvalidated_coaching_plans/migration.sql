-- Plans created before coachingRecommendations had its own expert-validation gate
-- cannot be treated as validated customer guidance.
UPDATE "CoachingPlan"
SET "status" = 'ARCHIVED'
WHERE "status" = 'ACTIVE';
