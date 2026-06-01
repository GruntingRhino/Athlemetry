const BASEBALL_DEFAULT_DISTANCE = 60.5;
const BASKETBALL_DEFAULT_DISTANCE = 15;
const SOCCER_SPRINT_DISTANCE = 65.6;
const SOCCER_AGILITY_DISTANCE = 45;
const SOCCER_SHOOTING_DISTANCE = 54;
const SOCCER_DRIBBLE_DISTANCE = 30;
const SOCCER_SHUTTLE_DISTANCE = 60;

function approx(value: number, target: number, tolerance = 0.75) {
  return Math.abs(value - target) <= tolerance;
}

function roundDistance(value: number) {
  return Math.round(value * 10) / 10;
}

export function getDrillCaptureProfile(drill?: { slug: string; sport: string }) {
  switch (drill?.slug) {
    case "baseball-pitch-velocity":
      return {
        cameraAngle: "open-side",
        distanceLabel: "Batting / plate distance (ft)",
        distanceHelp: "Default assumes a regulation 60.5 ft pitch distance. Drag the slider if the cage, mound, or bullpen setup differs.",
        measurementDistanceFeet: BASEBALL_DEFAULT_DISTANCE,
        distanceMinFeet: 40,
        distanceMaxFeet: 90,
        distanceStep: 0.5,
      };
    case "baseball-pitch-command":
      return {
        cameraAngle: "behind-catcher",
        distanceLabel: "Pitching distance (ft)",
        distanceHelp: "Use the visible mound-to-plate distance. The default assumes regulation spacing unless you move the slider.",
        measurementDistanceFeet: BASEBALL_DEFAULT_DISTANCE,
        distanceMinFeet: 40,
        distanceMaxFeet: 90,
        distanceStep: 0.5,
      };
    case "baseball-swing-timing":
      return {
        cameraAngle: "open-side",
        distanceLabel: "Batting / plate distance (ft)",
        distanceHelp: "Default assumes a regulation 60.5 ft reference. Adjust it for a cage or indoor lane if needed.",
        measurementDistanceFeet: BASEBALL_DEFAULT_DISTANCE,
        distanceMinFeet: 40,
        distanceMaxFeet: 90,
        distanceStep: 0.5,
      };
    case "basketball-form-capture":
      return {
        cameraAngle: "side",
        distanceLabel: "Court reference distance (ft)",
        distanceHelp: "Default uses the free-throw line (15 ft). If the clip is framed around the three-point line, move the slider to the visible mark.",
        measurementDistanceFeet: BASKETBALL_DEFAULT_DISTANCE,
        distanceMinFeet: 10,
        distanceMaxFeet: 26,
        distanceStep: 0.25,
      };
    case "agility-5-10-5":
      return {
        cameraAngle: "side",
        distanceLabel: "Shuttle spacing (ft)",
        distanceHelp: "Default assumes a 5-10-5 route at 45 ft total spacing. Adjust if your field markings differ.",
        measurementDistanceFeet: SOCCER_AGILITY_DISTANCE,
        distanceMinFeet: 20,
        distanceMaxFeet: 80,
        distanceStep: 1,
      };
    case "shooting-accuracy":
      return {
        cameraAngle: "behind-goal",
        distanceLabel: "Goal / target distance (ft)",
        distanceHelp: "Default assumes a visible goal line and shooting lane. Use the slider if the camera sits closer or farther than expected.",
        measurementDistanceFeet: SOCCER_SHOOTING_DISTANCE,
        distanceMinFeet: 20,
        distanceMaxFeet: 90,
        distanceStep: 1,
      };
    case "cone-dribble":
      return {
        cameraAngle: "diagonal",
        distanceLabel: "Dribble route spacing (ft)",
        distanceHelp: "Default assumes a compact cone route. Move the slider to match the visible cone spacing if your setup is wider.",
        measurementDistanceFeet: SOCCER_DRIBBLE_DISTANCE,
        distanceMinFeet: 15,
        distanceMaxFeet: 60,
        distanceStep: 1,
      };
    case "shuttle-endurance":
      return {
        cameraAngle: "side",
        distanceLabel: "Shuttle distance (ft)",
        distanceHelp: "Default assumes a full-field shuttle with visible rep markers. Adjust the slider to the real line spacing in your clip.",
        measurementDistanceFeet: SOCCER_SHUTTLE_DISTANCE,
        distanceMinFeet: 30,
        distanceMaxFeet: 120,
        distanceStep: 1,
      };
    case "sprint-20m":
    default:
      return {
        cameraAngle: "side",
        distanceLabel: "Sprint distance (ft)",
        distanceHelp: "Default assumes a 20m sprint line (65.6 ft). Move the slider if your lane or field spacing differs.",
        measurementDistanceFeet: SOCCER_SPRINT_DISTANCE,
        distanceMinFeet: 20,
        distanceMaxFeet: 100,
        distanceStep: 1,
      };
  }
}

export function getDefaultMeasurementDistanceFeet(drillSlug: string) {
  return getDrillCaptureProfile({ slug: drillSlug, sport: "" }).measurementDistanceFeet;
}

export function describeReferenceDistance(drillSlug: string, measurementDistanceFeet?: number | null) {
  const feet = roundDistance(
    measurementDistanceFeet ?? getDefaultMeasurementDistanceFeet(drillSlug),
  );

  if (drillSlug.startsWith("baseball")) {
    if (approx(feet, BASEBALL_DEFAULT_DISTANCE, 0.6) || approx(feet, 60, 0.6)) {
      return `Regulation pitching distance (${BASEBALL_DEFAULT_DISTANCE.toFixed(1)} ft)`;
    }

    return `${feet.toFixed(1)} ft custom batting / mound reference`;
  }

  if (drillSlug === "basketball-form-capture") {
    if (approx(feet, 15, 0.5)) {
      return "Free-throw line (15 ft)";
    }

    if (approx(feet, 22, 0.5)) {
      return "Three-point corner (22 ft)";
    }

    if (approx(feet, 23.75, 0.5)) {
      return "Three-point arc (23.75 ft)";
    }

    return `${feet.toFixed(1)} ft custom court reference`;
  }

  if (drillSlug === "sprint-20m") {
    if (approx(feet, SOCCER_SPRINT_DISTANCE, 0.6)) {
      return `20m sprint line (${SOCCER_SPRINT_DISTANCE.toFixed(1)} ft)`;
    }

    return `${feet.toFixed(1)} ft sprint reference`;
  }

  if (drillSlug === "agility-5-10-5") {
    return `${feet.toFixed(1)} ft 5-10-5 shuttle spacing`;
  }

  if (drillSlug === "shooting-accuracy") {
    return `${feet.toFixed(1)} ft shooting lane reference`;
  }

  if (drillSlug === "cone-dribble") {
    return `${feet.toFixed(1)} ft cone route spacing`;
  }

  if (drillSlug === "shuttle-endurance") {
    return `${feet.toFixed(1)} ft shuttle route spacing`;
  }

  return `${feet.toFixed(1)} ft sprint reference`;
}
