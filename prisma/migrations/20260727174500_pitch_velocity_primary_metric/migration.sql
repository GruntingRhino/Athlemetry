UPDATE "DrillDefinition"
SET
  "description" = 'Measure release-to-target timing; velocity is withheld unless calibrated speed clears validation.',
  "guidelines" = 'Use synchronized calibrated radar or optical tracking with a 120 FPS open-side or behind-catcher recording. User-marked frames and entered distance do not authorize velocity or RPM output.',
  "metricPrimaryKey" = 'speed',
  "lowerIsBetter" = false,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'baseball-pitch-velocity';
