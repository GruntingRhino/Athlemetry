import { BASEBALL_LEAGUE_OPTIONS } from "@/lib/constants";

const BASEBALL_DEFAULT_DISTANCE = 60.5;
const BASKETBALL_DEFAULT_DISTANCE = 15;
const SOCCER_SPRINT_DISTANCE = 65.6;
const SOCCER_AGILITY_DISTANCE = 45;
const SOCCER_SHOOTING_DISTANCE = 54;
const SOCCER_SHOOTING_MECHANICS_DISTANCE = 26.2;
const SOCCER_MOVEMENT_EFFICIENCY_DISTANCE = 19.7;
const SOCCER_PASSING_DISTANCE = 32.8;
const SOCCER_FIRST_TOUCH_DISTANCE = 16.4;
const SOCCER_DRIBBLE_DISTANCE = 30;
const SOCCER_SHUTTLE_DISTANCE = 60;
const BASEBALL_THROWING_MECHANICS_DISTANCE = 32.8;

function approx(value: number, target: number, tolerance = 0.75) {
  return Math.abs(value - target) <= tolerance;
}

function roundDistance(value: number) {
  return Math.round(value * 10) / 10;
}

export function getDrillCaptureProfile(drill?: { slug: string; sport: string }, _baseballLeague?: string | null) {
  void _baseballLeague;
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
    case "baseball-throwing-mechanics":
      return {
        cameraAngle: "open-side",
        distanceLabel: "Throwing lane distance (ft)",
        distanceHelp: "Default assumes an independently measured 10 m throwing lane with the ball, full body, home-plate marker, and numbered target visible. Adjust only to match the measured lane.",
        measurementDistanceFeet: BASEBALL_THROWING_MECHANICS_DISTANCE,
        distanceMinFeet: 15,
        distanceMaxFeet: 50,
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
    case "basketball-free-throw":
      return {
        cameraAngle: "diagonal",
        distanceLabel: "Free-throw line distance (ft)",
        distanceHelp: "Use the measured 15 ft line. Keep the line, full body, rim, backboard, and ball in frame without panning.",
        measurementDistanceFeet: BASKETBALL_DEFAULT_DISTANCE,
        distanceMinFeet: 14,
        distanceMaxFeet: 16,
        distanceStep: 0.25,
      };
    case "basketball-lane-agility":
      return {
        cameraAngle: "diagonal",
        distanceLabel: "Lane-agility route distance (ft)",
        distanceHelp: "Use the measured 47 ft lane route. Keep all turn lines, start, finish, and the full body in frame without panning.",
        measurementDistanceFeet: 47,
        distanceMinFeet: 45,
        distanceMaxFeet: 49,
        distanceStep: 0.5,
      };
    case "basketball-spot-shooting":
      return {
        cameraAngle: "diagonal",
        distanceLabel: "Spot-shooting court reference (ft)",
        distanceHelp: "Use the measured court line for each marked spot. Keep the spot, full body, rim, backboard, and ball in frame without panning.",
        measurementDistanceFeet: BASKETBALL_DEFAULT_DISTANCE,
        distanceMinFeet: 10,
        distanceMaxFeet: 26,
        distanceStep: 0.25,
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
    case "shooting-mechanics":
      return {
        cameraAngle: "diagonal",
        distanceLabel: "Mechanics lane distance (ft)",
        distanceHelp: "Default assumes an independently measured 8 m mechanics lane with the ball, plant marker cone, full body, goal frame, and target grid visible. Adjust only to match the measured lane.",
        measurementDistanceFeet: SOCCER_SHOOTING_MECHANICS_DISTANCE,
        distanceMinFeet: 15,
        distanceMaxFeet: 50,
        distanceStep: 0.5,
      };
    case "movement-efficiency":
      return {
        cameraAngle: "diagonal",
        distanceLabel: "Movement route distance (ft)",
        distanceHelp: "Default assumes a measured 6 m movement route with every cone, the numbered finish target, and the full body visible. Adjust only to match the independently measured route.",
        measurementDistanceFeet: SOCCER_MOVEMENT_EFFICIENCY_DISTANCE,
        distanceMinFeet: 12,
        distanceMaxFeet: 40,
        distanceStep: 0.5,
      };
    case "passing-accuracy":
      return {
        cameraAngle: "side",
        distanceLabel: "Passing lane distance (ft)",
        distanceHelp: "Default assumes a measured 10 m passing lane with the full target visible. Adjust only to match the independently measured lane.",
        measurementDistanceFeet: SOCCER_PASSING_DISTANCE,
        distanceMinFeet: 15,
        distanceMaxFeet: 60,
        distanceStep: 1,
      };
    case "first-touch-control":
      return {
        cameraAngle: "diagonal",
        distanceLabel: "First-touch service lane (ft)",
        distanceHelp: "Default assumes a measured 5 m ground-service lane with both control-square cones and the target visible. Adjust only to match the independently measured lane.",
        measurementDistanceFeet: SOCCER_FIRST_TOUCH_DISTANCE,
        distanceMinFeet: 10,
        distanceMaxFeet: 40,
        distanceStep: 0.5,
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

export function getDefaultMeasurementDistanceFeet(drillSlug: string, baseballLeague?: string | null) {
  if (drillSlug.startsWith("baseball") && baseballLeague) {
    const league = BASEBALL_LEAGUE_OPTIONS.find((option) => option.key === baseballLeague);
    if (league) return league.distanceFeet;
  }
  return getDrillCaptureProfile({ slug: drillSlug, sport: "" }).measurementDistanceFeet;
}

export function describeReferenceDistance(drillSlug: string, measurementDistanceFeet?: number | null) {
  const feet = roundDistance(
    measurementDistanceFeet ?? getDefaultMeasurementDistanceFeet(drillSlug),
  );

  if (drillSlug === "baseball-throwing-mechanics") {
    return `${feet.toFixed(1)} ft throwing mechanics lane reference`;
  }

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

  if (drillSlug === "shooting-mechanics") {
    return `${feet.toFixed(1)} ft shooting mechanics lane reference`;
  }

  if (drillSlug === "movement-efficiency") {
    return `${feet.toFixed(1)} ft movement route reference`;
  }

  if (drillSlug === "passing-accuracy") {
    return `${feet.toFixed(1)} ft passing lane reference`;
  }

  if (drillSlug === "first-touch-control") {
    return `${feet.toFixed(1)} ft first-touch service lane reference`;
  }

  if (drillSlug === "cone-dribble") {
    return `${feet.toFixed(1)} ft cone route spacing`;
  }

  if (drillSlug === "shuttle-endurance") {
    return `${feet.toFixed(1)} ft shuttle route spacing`;
  }

  return `${feet.toFixed(1)} ft sprint reference`;
}
