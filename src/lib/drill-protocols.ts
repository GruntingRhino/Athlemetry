import type { SportOption } from "@/lib/constants";

export type MetricValidationEvidence = {
  status: "DRAFT" | "COLLECTING" | "VALIDATED" | "REJECTED";
  sampleSize: number;
  p90Error: number;
  failureRate: number;
  confidenceCalibrationError: number;
  expertAgreement: number;
  independentlyReviewedAt: Date | null;
};

type ProtocolMetric = {
  key: string;
  unit: string;
  maximumP90Error: number;
  minimumSampleSize?: number;
};

export type DrillProtocol = {
  version: string;
  sport: SportOption;
  setup: string[];
  execution: string[];
  recordingErrors: {
    issue: string;
    correction: string;
  }[];
  camera: {
    acceptedAngles: string[];
    minimumFps: number;
    fullBodyRequired: boolean;
    referenceInFrame: string;
  };
  groundTruth: {
    equipment: string[];
    expertReviewers: number;
    synchronizedCaptureRequired: boolean;
  };
  minimumValidationSampleSize: number;
  maximumFailureRate: number;
  maximumConfidenceCalibrationError: number;
  minimumExpertAgreement: number;
  metrics: ProtocolMetric[];
};

const VERSION = "1.1.0";
const SPRINT_PROTOCOL_VERSION = "1.1.0";
const PLANAR_MARKER_SETUP = "Print planar marker IDs 10, 11, 12, and 13 and place their centers on four independently surveyed coplanar control points; record the marker-to-world coordinate map in the reviewed calibration evidence.";
const BASE_GATES = {
  minimumValidationSampleSize: 100,
  maximumFailureRate: 0.1,
  maximumConfidenceCalibrationError: 0.1,
  minimumExpertAgreement: 0.8,
} as const;
const COACHING_RECOMMENDATION_GATE = {
  key: "coachingRecommendations",
  unit: "expert_consensus",
  maximumP90Error: 0,
  minimumSampleSize: 100,
} as const;

const DRILL_PROTOCOLS_WITHOUT_PLANAR_MARKERS = {
  "sprint-20m": {
    version: SPRINT_PROTOCOL_VERSION,
    sport: "soccer",
    setup: ["Independently measure a straight 20.00 m lane with a calibrated steel tape; visual markers do not establish physical distance.", "Print marker ID 0 and place its center on the measured start line.", "Print marker ID 1 and place its center on the measured finish line.", "Keep both complete marker borders visible in the stationary camera view for at least four analyzed frames.", "Use a non-slip, level surface and record conditions."],
    execution: ["Use a stationary two-point start with no rocking start.", "Begin on an audible cue synchronized to the timing system.", "Sprint through the finish marker at maximum effort.", "Record three trials with at least three minutes rest."],
    recordingErrors: [
      { issue: "Start or finish marker border is cropped or blurred.", correction: "Move the stationary camera back and record a four-frame still check with both complete marker borders visible." },
      { issue: "The camera pans or follows the runner.", correction: "Lock the phone on a tripod; the complete 20 m lane must remain in one stationary shot." },
      { issue: "The runner stops at the finish instead of running through it.", correction: "Repeat after instructing the runner to accelerate through the finish marker without decelerating early." },
    ],
    camera: { acceptedAngles: ["side", "diagonal"], minimumFps: 60, fullBodyRequired: true, referenceInFrame: "Both measured lane endpoints" },
    groundTruth: { equipment: ["Dual-beam electronic timing gates", "Calibrated steel distance tape"], expertReviewers: 2, synchronizedCaptureRequired: true },
    ...BASE_GATES,
    metrics: [
      { key: "sprintTime", unit: "s", maximumP90Error: 0.15 },
      { key: "speed", unit: "m/s", maximumP90Error: 0.25 },
      { key: "acceleration", unit: "m/s²", maximumP90Error: 0.5 },
      { key: "techniqueScore", unit: "score_0_100", maximumP90Error: 8 },
      COACHING_RECOMMENDATION_GATE,
    ],
  },
  "agility-5-10-5": {
    version: VERSION,
    sport: "soccer",
    setup: ["Measure center and turn lines at 5.00 m spacing.", "Use flat high-contrast lines rather than movable cones.", "Confirm a dry, level, non-slip surface."],
    execution: ["Start straddling the center line.", "Touch each outside line with the prescribed hand.", "Complete left-first and right-first trials.", "Record three valid trials per direction."],
    recordingErrors: [
      { issue: "One or more measured touch lines are outside the frame.", correction: "Use a wider stationary angle that shows all three lines before starting the recording." },
      { issue: "Cones are substituted for the required touch lines.", correction: "Lay down flat, high-contrast measured lines so every hand-touch event can be reviewed." },
      { issue: "The athlete misses a prescribed line touch.", correction: "Mark the attempt invalid and repeat from the stationary center-line start." },
    ],
    camera: { acceptedAngles: ["side", "diagonal", "overhead"], minimumFps: 60, fullBodyRequired: true, referenceInFrame: "All three measured touch lines" },
    groundTruth: { equipment: ["Electronic timing gates", "Force plates or instrumented insoles for turn events"], expertReviewers: 2, synchronizedCaptureRequired: true },
    ...BASE_GATES,
    metrics: [
      { key: "changeOfDirectionMeasurement", unit: "s", maximumP90Error: 0.2 },
      { key: "agilityScore", unit: "score_0_100", maximumP90Error: 8 },
      { key: "techniqueScore", unit: "score_0_100", maximumP90Error: 8 },
      COACHING_RECOMMENDATION_GATE,
    ],
  },
  "shooting-accuracy": {
    version: VERSION,
    sport: "soccer",
    setup: ["Mark a fixed 11.00 m shooting point.", "Divide the regulation goal into six numbered target zones.", "Use identical regulation balls at the same pressure."],
    execution: ["Take ten shots in a randomized target order.", "Reset the ball at the marked point for every attempt.", "Record target intent before each shot.", "Count only clearly adjudicated first contacts."],
    recordingErrors: [
      { issue: "The goal frame, target grid, or shooting mark is not continuously visible.", correction: "Reposition the camera diagonally or behind goal until all three references remain visible throughout a trial." },
      { issue: "The target zone is not recorded before the shot.", correction: "Pause briefly on the numbered target or state it on camera before resetting the ball." },
      { issue: "A rebound or second contact is treated as the attempt result.", correction: "Record the first clearly adjudicated contact only; restart any ambiguous attempt." },
    ],
    camera: { acceptedAngles: ["behind-goal", "diagonal"], minimumFps: 60, fullBodyRequired: true, referenceInFrame: "Goal frame, target grid, and shooting mark" },
    groundTruth: { equipment: ["Instrumented target net or synchronized goal cameras", "Radar gun for ball speed"], expertReviewers: 2, synchronizedCaptureRequired: true },
    ...BASE_GATES,
    metrics: [
      { key: "accuracyScore", unit: "score_0_100", maximumP90Error: 5 },
      { key: "shotTiming", unit: "s", maximumP90Error: 0.15 },
      { key: "techniqueScore", unit: "score_0_100", maximumP90Error: 8 },
      { key: "powerScore", unit: "score_0_100", maximumP90Error: 10 },
      COACHING_RECOMMENDATION_GATE,
    ],
  },
  "shooting-mechanics": {
    version: VERSION,
    sport: "soccer",
    setup: ["Independently measure and mark a fixed 8.00 m mechanics lane with a calibrated steel tape.", "Place one high-contrast plant marker cone beside the ball at the declared plant-foot location.", "Place a numbered target grid within the visible regulation goal frame; it is a visual reference only, not an outcome score.", "Use the same regulation ball, plant marker, lane, goal, and target-grid layout for every attempt."],
    execution: ["Start with the ball stationary at the marked point and the declared plant foot beside the visible cone reference.", "Complete ten single-contact strikes using the declared foot with the full body and plant marker visible.", "Record the target-grid reference before each attempt without recording a make/miss result.", "Repeat any attempt where the plant frame or first ball-strike frame cannot be independently reviewed."],
    recordingErrors: [
      { issue: "The ball, plant marker cone, full body, goal frame, or target grid leaves the frame.", correction: "Move the fixed diagonal or side camera back until every required reference remains visible from plant through first ball strike." },
      { issue: "The plant marker is moved or hidden between attempts.", correction: "Reset the same high-contrast cone beside the marked ball location and record a replacement attempt from the stationary setup." },
      { issue: "A make, miss, or target contact is recorded as the result of this mechanics capture.", correction: "Record only the plant and first-strike evidence; do not assign an outcome result, and repeat any attempt with an unclear first strike." },
    ],
    camera: { acceptedAngles: ["diagonal", "side"], minimumFps: 60, fullBodyRequired: true, referenceInFrame: "Ball, plant marker cone, full body, goal frame, and target grid" },
    groundTruth: { equipment: ["Synchronized side and goal-plane cameras", "Calibrated steel distance tape"], expertReviewers: 2, synchronizedCaptureRequired: true },
    ...BASE_GATES,
    metrics: [
      { key: "techniqueScore", unit: "score_0_100", maximumP90Error: 8 },
      { key: "consistencyScore", unit: "score_0_100", maximumP90Error: 8 },
      COACHING_RECOMMENDATION_GATE,
    ],
  },
  "movement-efficiency": {
    version: VERSION,
    sport: "soccer",
    setup: ["Independently measure a 6.00 m change-of-direction route with a calibrated steel tape.", "Place four high-contrast cones at the declared route turns and a numbered finish target at the measured endpoint.", "Record the cone-to-world coordinate map in the reviewed planar calibration evidence.", "Use the same measured route, cones, finish target, and surface for every attempt."],
    execution: ["Start stationary behind the marked route line.", "Complete the declared route through every cone turn and cross the numbered finish target.", "Perform three route attempts with the complete body and route visible.", "Repeat any attempt where a turn or finish-target crossing cannot be independently reviewed."],
    recordingErrors: [
      { issue: "A route cone, numbered finish target, or part of the athlete's body leaves the frame.", correction: "Move the fixed diagonal or overhead camera back until the entire measured route, every cone, finish target, and full body remain visible." },
      { issue: "A cone or finish target moves from its measured position between attempts.", correction: "Reset every route reference to its measured location and record a replacement attempt from the stationary start." },
      { issue: "The route is described as an efficiency result without a reviewable turn or target crossing.", correction: "Record only the visible route evidence and repeat the attempt when a required turn or finish-target crossing is unclear." },
    ],
    camera: { acceptedAngles: ["diagonal", "overhead"], minimumFps: 60, fullBodyRequired: true, referenceInFrame: "Complete measured route, four cones, and numbered finish target" },
    groundTruth: { equipment: ["Synchronized overhead route camera", "Calibrated steel distance tape"], expertReviewers: 2, synchronizedCaptureRequired: true },
    ...BASE_GATES,
    metrics: [
      { key: "consistencyScore", unit: "score_0_100", maximumP90Error: 8 },
      { key: "techniqueScore", unit: "score_0_100", maximumP90Error: 8 },
      COACHING_RECOMMENDATION_GATE,
    ],
  },
  "passing-accuracy": {
    version: VERSION,
    sport: "soccer",
    setup: ["Measure and mark a fixed 10.00 m passing lane.", "Place a numbered ground-pass target centered at the end of the lane.", "Use the same regulation ball and target dimensions for the full session."],
    execution: ["Start every pass with the ball stationary behind the marked line.", "Complete ten ground passes to the numbered target using the declared foot.", "Record the intended target before each pass.", "Count only the first ball contact with the target area."],
    recordingErrors: [
      { issue: "The passing start line, full lane, or target leaves the frame.", correction: "Move the stationary camera to a side or diagonal position where the complete measured lane and target remain visible." },
      { issue: "The numbered target is not declared before the pass.", correction: "Show the numbered target on camera before resetting the stationary ball for the next attempt." },
      { issue: "A rebound or second target contact is counted as the outcome.", correction: "Record only the first contact with the target area and repeat the attempt if that contact cannot be reviewed clearly." },
    ],
    camera: { acceptedAngles: ["side", "diagonal"], minimumFps: 60, fullBodyRequired: true, referenceInFrame: "Marked start line, full passing lane, and numbered target" },
    groundTruth: { equipment: ["Instrumented passing target or synchronized target cameras", "Calibrated steel distance tape"], expertReviewers: 2, synchronizedCaptureRequired: true },
    ...BASE_GATES,
    metrics: [
      { key: "accuracyScore", unit: "score_0_100", maximumP90Error: 5 },
      { key: "techniqueScore", unit: "score_0_100", maximumP90Error: 8 },
      { key: "consistencyScore", unit: "score_0_100", maximumP90Error: 8 },
      COACHING_RECOMMENDATION_GATE,
    ],
  },
  "first-touch-control": {
    version: VERSION,
    sport: "soccer",
    setup: ["Measure and mark a fixed 5.00 m ground-service lane.", "Mark a 2.00 m control square with two visible cones and place a numbered target inside it.", "Use the same regulation ball, service lane, control square, and target dimensions for the full session."],
    execution: ["Receive ten ground services from behind the measured line using the declared foot.", "Bring the first touch into the marked control square before any second contact.", "Record the intended numbered target before each service.", "Count only a first touch whose ball position is independently adjudicated inside the control square."],
    recordingErrors: [
      { issue: "The service line, control-square cones, or numbered target leaves the frame.", correction: "Move the fixed diagonal camera back until the full 5 m lane, both cones, and target remain visible through every first touch." },
      { issue: "The incoming ground service is started from an unmarked or changing position.", correction: "Reset the ball behind the same measured service line and record a replacement attempt from the stationary setup." },
      { issue: "A second touch or a ball leaving the control square is counted as a successful reception.", correction: "Count only the first contact that is clearly inside the marked square; repeat any attempt where the first touch cannot be independently reviewed." },
    ],
    camera: { acceptedAngles: ["diagonal", "side"], minimumFps: 60, fullBodyRequired: true, referenceInFrame: "Measured service line, both control-square cones, and numbered target" },
    groundTruth: { equipment: ["Synchronized overhead control-square camera or instrumented target", "Calibrated steel distance tape"], expertReviewers: 2, synchronizedCaptureRequired: true },
    ...BASE_GATES,
    metrics: [
      { key: "accuracyScore", unit: "score_0_100", maximumP90Error: 5 },
      { key: "techniqueScore", unit: "score_0_100", maximumP90Error: 8 },
      { key: "consistencyScore", unit: "score_0_100", maximumP90Error: 8 },
      COACHING_RECOMMENDATION_GATE,
    ],
  },
  "cone-dribble": {
    version: VERSION,
    sport: "soccer",
    setup: ["Place six cones 2.00 m apart on a straight measured line.", "Mark start and finish lines 1.00 m beyond the end cones.", "Use the same ball size and pressure for all trials."],
    execution: ["Start with the ball stationary behind the line.", "Weave through every gate without moving a cone.", "Use both feet during each valid repetition.", "Record three valid repetitions."],
    recordingErrors: [
      { issue: "The start, finish, or part of the cone route is hidden.", correction: "Use an overhead, side, or diagonal placement that keeps the full measured route in frame." },
      { issue: "A cone moves during the repetition.", correction: "Mark the repetition invalid, reset the cone to its measured position, and record a new attempt." },
      { issue: "The ball begins moving before the marked start.", correction: "Reset with the ball stationary behind the line before recording the next repetition." },
    ],
    camera: { acceptedAngles: ["side", "diagonal", "overhead"], minimumFps: 60, fullBodyRequired: true, referenceInFrame: "Full measured cone route" },
    groundTruth: { equipment: ["Electronic timing gates", "Overhead calibrated tracking camera"], expertReviewers: 2, synchronizedCaptureRequired: true },
    ...BASE_GATES,
    metrics: [
      { key: "consistencyScore", unit: "score_0_100", maximumP90Error: 8 },
      { key: "agilityScore", unit: "score_0_100", maximumP90Error: 8 },
      { key: "techniqueScore", unit: "score_0_100", maximumP90Error: 8 },
      COACHING_RECOMMENDATION_GATE,
    ],
  },
  "shuttle-endurance": {
    version: VERSION,
    sport: "soccer",
    setup: ["Measure two lines exactly 20.00 m apart.", "Use the published 20 m shuttle audio track.", "Provide a level non-slip lane for each athlete."],
    execution: ["Start on or behind one line.", "Reach the opposite line before each audio cue.", "Issue one warning for a missed line and stop after the second miss.", "Record completed shuttles and terminal stage."],
    recordingErrors: [
      { issue: "The recording does not include both measured shuttle lines.", correction: "Move to a side or diagonal position that shows both line contacts in the same shot." },
      { issue: "The official shuttle audio cannot be heard or synchronized.", correction: "Replay the official track from a nearby speaker and make a short audio check before the attempt." },
      { issue: "A missed line is not visible or recorded.", correction: "Stop the attempt after the second missed line and capture the terminal stage with the line contacts visible." },
    ],
    camera: { acceptedAngles: ["side", "diagonal"], minimumFps: 30, fullBodyRequired: true, referenceInFrame: "Both measured shuttle lines" },
    groundTruth: { equipment: ["Official synchronized shuttle audio", "Dual line judges with event timestamps"], expertReviewers: 2, synchronizedCaptureRequired: true },
    ...BASE_GATES,
    metrics: [
      { key: "repetitionCount", unit: "count", maximumP90Error: 1 },
      { key: "consistencyScore", unit: "score_0_100", maximumP90Error: 8 },
      COACHING_RECOMMENDATION_GATE,
    ],
  },
  "baseball-pitch-velocity": {
    version: VERSION,
    sport: "baseball",
    setup: ["Measure the rubber-to-plate distance for the athlete league.", "Place a regulation strike-zone target at home plate.", "Record ball type and mound configuration."],
    execution: ["Complete a standardized warm-up.", "Throw ten full-intent fastballs from the same set position.", "Record radar and video for every pitch.", "Exclude pitches with tracking or radar acquisition failure."],
    recordingErrors: [
      { issue: "Rubber, plate, or the measured pitch span is not visible.", correction: "Use the behind-catcher or open-side camera angle and widen the framing before beginning the set." },
      { issue: "Video is captured below the required 120 fps.", correction: "Enable the device's high-frame-rate mode and confirm the exported clip frame rate before uploading." },
      { issue: "Radar or tracking does not acquire a pitch.", correction: "Mark that pitch unavailable rather than estimating speed; correct the equipment placement and repeat a new pitch." },
    ],
    camera: { acceptedAngles: ["behind-catcher", "open-side"], minimumFps: 120, fullBodyRequired: true, referenceInFrame: "Rubber, plate, and measured pitch distance" },
    groundTruth: { equipment: ["Calibrated Doppler radar or optical pitch-tracking system", "Synchronized high-speed camera"], expertReviewers: 2, synchronizedCaptureRequired: true },
    ...BASE_GATES,
    metrics: [
      { key: "speed", unit: "m/s", maximumP90Error: 0.67 },
      { key: "frameBasedDuration", unit: "s", maximumP90Error: 0.02 },
      { key: "techniqueScore", unit: "score_0_100", maximumP90Error: 8 },
      COACHING_RECOMMENDATION_GATE,
    ],
  },
  "baseball-pitch-command": {
    version: VERSION,
    sport: "baseball",
    setup: ["Use a regulation plate and age-appropriate pitching distance.", "Display a fixed nine-zone strike target.", "Record intended zone before each pitch."],
    execution: ["Throw three pitches to each randomized target zone.", "Maintain the same pitch type for the session.", "Record every attempt including misses.", "Have two reviewers adjudicate boundary pitches."],
    recordingErrors: [
      { issue: "The strike-zone target is partially blocked or not calibrated in frame.", correction: "Center the complete target in the behind-catcher or behind-pitcher view before recording." },
      { issue: "The intended zone is not captured before the pitch.", correction: "Show or state the randomized target zone on camera before each delivery." },
      { issue: "A boundary pitch has no independent adjudication.", correction: "Keep the pitch in the record as unresolved until two reviewers can adjudicate it; do not assign a zone." },
    ],
    camera: { acceptedAngles: ["behind-catcher", "behind-pitcher"], minimumFps: 60, fullBodyRequired: true, referenceInFrame: "Complete calibrated strike-zone target" },
    groundTruth: { equipment: ["Optical pitch-location system or instrumented target", "Synchronized plate camera"], expertReviewers: 2, synchronizedCaptureRequired: true },
    ...BASE_GATES,
    metrics: [
      { key: "accuracyScore", unit: "score_0_100", maximumP90Error: 5 },
      { key: "consistencyScore", unit: "score_0_100", maximumP90Error: 8 },
      { key: "techniqueScore", unit: "score_0_100", maximumP90Error: 8 },
      COACHING_RECOMMENDATION_GATE,
    ],
  },
  "baseball-throwing-mechanics": {
    version: VERSION,
    sport: "baseball",
    setup: ["Independently measure and mark a fixed 10.00 m throwing lane with a calibrated steel tape.", "Place a regulation home-plate marker beneath a high-contrast numbered target at the measured endpoint.", "Use the same ball, plate marker, throwing lane, and target layout for every attempt."],
    execution: ["Start from the declared stationary throwing position with the ball, full body, plate marker, and target visible.", "Complete ten single throws through the measured lane without recording a result at the target.", "Record the numbered target reference before each attempt as a visual marker only.", "Repeat any attempt where the release or visible target-reference frame cannot be independently reviewed."],
    recordingErrors: [
      { issue: "The ball, full body, home-plate marker, or numbered target leaves the frame.", correction: "Move the fixed open-side or diagonal camera back until every required reference remains visible from the stationary start through the target-reference frame." },
      { issue: "The home-plate marker or numbered target moves between attempts.", correction: "Reset the same plate marker and target at the measured endpoint before recording a replacement attempt." },
      { issue: "A target contact or throw result is recorded as the result of this mechanics capture.", correction: "Record only the visible throwing and reference evidence; do not assign a target outcome, and repeat any attempt with an unclear release or reference frame." },
    ],
    camera: { acceptedAngles: ["open-side", "diagonal"], minimumFps: 60, fullBodyRequired: true, referenceInFrame: "Ball, full body, home-plate marker, and numbered target" },
    groundTruth: { equipment: ["Synchronized open-side and target-reference cameras", "Calibrated steel distance tape"], expertReviewers: 2, synchronizedCaptureRequired: true },
    ...BASE_GATES,
    metrics: [
      { key: "techniqueScore", unit: "score_0_100", maximumP90Error: 8 },
      { key: "consistencyScore", unit: "score_0_100", maximumP90Error: 8 },
      COACHING_RECOMMENDATION_GATE,
    ],
  },
  "baseball-swing-timing": {
    version: VERSION,
    sport: "baseball",
    setup: ["Use a fixed tee or repeatable pitching machine setting.", "Mark the batter box and contact location.", "Record bat length, ball type, and camera distance."],
    execution: ["Complete ten swings at the same target location.", "Reset feet to the marked stance for each swing.", "Record contact quality for every attempt.", "Exclude obstructed swings before analysis."],
    recordingErrors: [
      { issue: "Bat, contact location, or calibration reference is obscured.", correction: "Use an open-side or side view with the whole bat and reference plane visible through contact." },
      { issue: "Video is captured below the required 120 fps.", correction: "Enable high-frame-rate recording and verify the saved clip's frame rate before the swing set." },
      { issue: "The tee, machine setting, or stance changes between swings.", correction: "Reset the marked stance and fixed target setup, then record a replacement swing." },
    ],
    camera: { acceptedAngles: ["open-side", "side"], minimumFps: 120, fullBodyRequired: true, referenceInFrame: "Known bat length or calibrated reference plane" },
    groundTruth: { equipment: ["Instrumented bat sensor or optical bat tracking", "Synchronized high-speed camera"], expertReviewers: 2, synchronizedCaptureRequired: true },
    ...BASE_GATES,
    metrics: [
      { key: "frameBasedDuration", unit: "s", maximumP90Error: 0.03 },
      { key: "techniqueScore", unit: "score_0_100", maximumP90Error: 8 },
      { key: "powerScore", unit: "score_0_100", maximumP90Error: 10 },
      { key: "consistencyScore", unit: "score_0_100", maximumP90Error: 8 },
      COACHING_RECOMMENDATION_GATE,
    ],
  },
  "basketball-spot-shooting": {
    version: VERSION,
    sport: "basketball",
    setup: ["Mark five fixed shooting spots using measured court lines and record the spot order.", "Use a fixed diagonal camera with every selected spot, hoop, backboard, ball, and athlete visible.", "Use the same regulation ball and court for all attempts."],
    execution: ["Take five stationary shots from each declared spot.", "Record only attempts with visible release, first rim outcome, and marked spot.", "Repeat any attempt with obscured ball flight, rim, or spot."],
    recordingErrors: [{ issue: "The selected spot or court line is not visible.", correction: "Reframe the fixed diagonal camera so the marked spot and hoop remain visible." }, { issue: "The first outcome is hidden or ambiguous.", correction: "Withhold the attempt and repeat with an unobstructed rim view." }, { issue: "The camera pans between spots.", correction: "Use one stationary framing or record separate protocol-compliant spot clips." }],
    camera: { acceptedAngles: ["diagonal"], minimumFps: 60, fullBodyRequired: true, referenceInFrame: "Marked shooting spot, hoop, backboard, athlete, and ball" },
    groundTruth: { equipment: ["Synchronized rim/goal camera", "Calibrated court tape"], expertReviewers: 2, synchronizedCaptureRequired: true },
    ...BASE_GATES,
    metrics: [{ key: "accuracyScore", unit: "score_0_100", maximumP90Error: 5 }, { key: "consistencyScore", unit: "score_0_100", maximumP90Error: 8 }, COACHING_RECOMMENDATION_GATE],
  },
  "basketball-lane-agility": {
    version: VERSION,
    sport: "basketball",
    setup: ["Mark a regulation 47.00 ft lane-agility route with high-contrast boundary lines.", "Keep every turn line, start, finish, and athlete visible from a fixed diagonal camera.", "Use the same dry, level, non-slip court surface for every attempt."],
    execution: ["Start stationary behind the marked start line.", "Complete the declared route touching each required line in order.", "Record three valid attempts with the full body and all turn events visible."],
    recordingErrors: [{ issue: "A required lane boundary, turn, or finish leaves the frame.", correction: "Move the fixed diagonal camera back until the complete route remains visible." }, { issue: "A line touch is blocked or ambiguous.", correction: "Mark the attempt invalid and repeat from the stationary start with an unobstructed view." }, { issue: "The camera pans or follows the athlete.", correction: "Lock the camera on a tripod and repeat with the complete lane in one frame." }],
    camera: { acceptedAngles: ["diagonal"], minimumFps: 60, fullBodyRequired: true, referenceInFrame: "Complete measured lane route, all turn lines, start, and finish" },
    groundTruth: { equipment: ["Electronic timing gates", "Calibrated steel distance tape"], expertReviewers: 2, synchronizedCaptureRequired: true },
    ...BASE_GATES,
    metrics: [{ key: "changeOfDirectionMeasurement", unit: "s", maximumP90Error: 0.2 }, { key: "agilityScore", unit: "score_0_100", maximumP90Error: 8 }, COACHING_RECOMMENDATION_GATE],
  },
  "basketball-free-throw": {
    version: VERSION,
    sport: "basketball",
    setup: ["Use a regulation hoop and independently measured 15 ft free-throw line.", "Keep the free-throw line, rim, backboard, and full body visible from a fixed diagonal camera.", "Use the same regulation ball and marked shooting position for all ten attempts."],
    execution: ["Take ten stationary free throws from behind the marked line.", "Record only attempts where release, ball flight toward the rim, and first outcome are visible.", "Repeat any attempt with an obscured ball, rim, or line."],
    recordingErrors: [{ issue: "The line, rim, backboard, ball, or full body leaves frame.", correction: "Move the fixed diagonal camera back; do not pan or use an obscured attempt." }, { issue: "The first outcome is hidden or ambiguous.", correction: "Withhold the attempt outcome and repeat with an unobstructed rim view." }, { issue: "The shot starts in front of the measured line or the athlete steps over it before release.", correction: "Mark the attempt invalid, reset behind the line, and record a replacement shot from the stationary position." }],
    camera: { acceptedAngles: ["diagonal"], minimumFps: 60, fullBodyRequired: true, referenceInFrame: "Measured free-throw line, rim, backboard, athlete, and ball" },
    groundTruth: { equipment: ["Synchronized rim/goal camera", "Calibrated steel distance tape"], expertReviewers: 2, synchronizedCaptureRequired: true },
    ...BASE_GATES,
    metrics: [{ key: "accuracyScore", unit: "score_0_100", maximumP90Error: 5 }, { key: "consistencyScore", unit: "score_0_100", maximumP90Error: 8 }, COACHING_RECOMMENDATION_GATE],
  },
  "basketball-form-capture": {
    version: VERSION,
    sport: "basketball",
    setup: ["Use a regulation hoop and measured free-throw line.", "Mark both foot positions and the camera location.", "Use the same regulation ball for the session."],
    execution: ["Take twenty free throws from the marked setup.", "Hold the finish until the ball reaches the rim.", "Record make or miss for every attempt.", "Have reviewers score mechanics using the locked rubric."],
    recordingErrors: [
      { issue: "The free-throw line, rim, or backboard leaves the frame.", correction: "Move to a side, diagonal, or open-side view that keeps all three references visible." },
      { issue: "The athlete's full body or release path is blocked.", correction: "Clear people and equipment from the camera lane, then retake the attempt with the full body visible." },
      { issue: "The finish is dropped before the ball reaches the rim.", correction: "Repeat the shot and hold the follow-through until the result is visible." },
    ],
    camera: { acceptedAngles: ["side", "diagonal", "open-side"], minimumFps: 60, fullBodyRequired: true, referenceInFrame: "Free-throw line, rim, and backboard" },
    groundTruth: { equipment: ["Instrumented ball or optical ball tracker", "Calibrated multi-camera motion capture"], expertReviewers: 2, synchronizedCaptureRequired: true },
    ...BASE_GATES,
    metrics: [
      { key: "accuracyScore", unit: "score_0_100", maximumP90Error: 5 },
      { key: "shotTiming", unit: "s", maximumP90Error: 0.05 },
      { key: "techniqueScore", unit: "score_0_100", maximumP90Error: 8 },
      { key: "consistencyScore", unit: "score_0_100", maximumP90Error: 8 },
      { key: "powerScore", unit: "score_0_100", maximumP90Error: 10 },
      COACHING_RECOMMENDATION_GATE,
    ],
  },
} as const satisfies Record<string, DrillProtocol>;

export const DRILL_PROTOCOLS = Object.fromEntries(
  Object.entries(DRILL_PROTOCOLS_WITHOUT_PLANAR_MARKERS).map(([slug, protocol]) => [
    slug,
    { ...protocol, setup: [PLANAR_MARKER_SETUP, ...protocol.setup] },
  ]),
) as unknown as {
  [Slug in keyof typeof DRILL_PROTOCOLS_WITHOUT_PLANAR_MARKERS]:
    Omit<(typeof DRILL_PROTOCOLS_WITHOUT_PLANAR_MARKERS)[Slug], "setup"> & { setup: readonly string[] };
};

export function evaluateMetricRelease(
  drillSlug: string,
  metricName: string,
  evidence: MetricValidationEvidence,
) {
  const protocol = DRILL_PROTOCOLS[drillSlug as keyof typeof DRILL_PROTOCOLS];
  const metric = protocol?.metrics.find((candidate) => candidate.key === metricName);
  if (!protocol || !metric) {
    return { released: false, reasons: ["metric-not-in-protocol"] };
  }

  const reasons: string[] = [];
  if (evidence.status !== "VALIDATED") reasons.push("validation-status-not-approved");
  const minimumSampleSize = "minimumSampleSize" in metric
    ? metric.minimumSampleSize
    : protocol.minimumValidationSampleSize;
  if (evidence.sampleSize < minimumSampleSize) reasons.push("insufficient-corpus");
  if (!Number.isFinite(evidence.p90Error) || evidence.p90Error > metric.maximumP90Error) reasons.push("p90-error-above-threshold");
  if (!Number.isFinite(evidence.failureRate) || evidence.failureRate > protocol.maximumFailureRate) reasons.push("failure-rate-above-threshold");
  if (!Number.isFinite(evidence.confidenceCalibrationError) || evidence.confidenceCalibrationError > protocol.maximumConfidenceCalibrationError) reasons.push("confidence-not-calibrated");
  if (!Number.isFinite(evidence.expertAgreement) || evidence.expertAgreement < protocol.minimumExpertAgreement) reasons.push("expert-agreement-below-threshold");
  if (!evidence.independentlyReviewedAt) reasons.push("independent-review-missing");

  return { released: reasons.length === 0, reasons };
}
