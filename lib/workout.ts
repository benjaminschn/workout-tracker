export type WorkoutStatus = "active" | "completed" | "discarded";
export type ProgressionKind = "increase" | "hold" | "reduce" | "insufficient";
export type PrescriptionKind =
  | "baseline"
  | "progress"
  | "hold"
  | "increase"
  | "reduce"
  | "bodyweight";

export interface Exercise {
  id: string;
  name: string;
  normalizedName: string;
  createdAt: number;
}

export interface TemplateExercise {
  id: string;
  exerciseId: string;
  name: string;
  restSeconds: number;
  setCount: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  targetWeight: number | null;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  exercises: TemplateExercise[];
}

export interface WorkoutSet {
  id: string;
  prescribedRepMin: number;
  prescribedRepMax: number;
  prescribedReps: number;
  prescribedRir: number;
  prescribedWeight: number | null;
  actualReps: number;
  actualWeight: number | null;
  actualRir: number | null;
  completed: boolean;
  completedAt: number | null;
}

export interface ProgressionRecommendation {
  kind: ProgressionKind;
  nextWeight: number | null;
  title: string;
  detail: string;
}

export interface WorkoutPrescription {
  kind: PrescriptionKind;
  sourceWorkoutId: string | null;
  sourceDate: number | null;
  nominalWeight: number | null;
  title: string;
  detail: string;
}

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  name: string;
  restSeconds: number;
  sets: WorkoutSet[];
  prescription: WorkoutPrescription | null;
  progression: ProgressionRecommendation | null;
  completed: boolean;
  completedAt: number | null;
}

export interface WorkoutSession {
  id: string;
  name: string;
  sourceTemplateId: string | null;
  status: WorkoutStatus;
  startedAt: number;
  endedAt: number | null;
  pausedAt: number | null;
  pausedTotalMs: number;
  restDeadline: number | null;
  currentExerciseIndex: number;
  exercises: WorkoutExercise[];
}

export interface Preferences {
  defaultRestSeconds: number;
  restTimerSoundEnabled: boolean;
  preventScreenLock: boolean;
  installHintDismissed: boolean;
}

export interface AppState {
  schemaVersion: 3;
  exercises: Exercise[];
  templates: WorkoutTemplate[];
  workouts: WorkoutSession[];
  preferences: Preferences;
}

export interface ExerciseHistoryPoint {
  workoutId: string;
  date: number;
  workoutName: string;
  bestWeight: number;
  estimatedOneRepMax: number;
  volume: number;
  totalReps: number;
  averageRir: number | null;
  setSummary: string;
  progression: ProgressionRecommendation | null;
}

export const SUGGESTED_EXERCISES = [
  "Back Squat",
  "Bench Press",
  "Deadlift",
  "Overhead Press",
  "Barbell Row",
  "Pull-up",
  "Lat Pulldown",
  "Leg Press",
  "Romanian Deadlift",
  "Dumbbell Curl",
  "Triceps Pushdown",
  "Lateral Raise",
];

export const EMPTY_STATE: AppState = {
  schemaVersion: 3,
  exercises: [],
  templates: [],
  workouts: [],
  preferences: {
    defaultRestSeconds: 120,
    restTimerSoundEnabled: true,
    preventScreenLock: true,
    installHintDismissed: false,
  },
};

export function createId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export function normalizeExerciseName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function displayExerciseName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function createTemplateExercise(
  exercise: Exercise,
  restSeconds: number,
): TemplateExercise {
  return {
    id: createId("template-exercise"),
    exerciseId: exercise.id,
    name: exercise.name,
    restSeconds,
    setCount: 3,
    repMin: 8,
    repMax: 12,
    targetRir: 2,
    targetWeight: null,
  };
}

export function createWorkoutSet(
  repMin = 8,
  repMax = 12,
  prescribedRir = 2,
  prescribedWeight: number | null = null,
  prescribedReps = repMin,
): WorkoutSet {
  return {
    id: createId("set"),
    prescribedRepMin: repMin,
    prescribedRepMax: repMax,
    prescribedReps: Math.max(repMin, Math.min(repMax, prescribedReps)),
    prescribedRir,
    prescribedWeight,
    actualReps: Math.max(repMin, Math.min(repMax, prescribedReps)),
    actualWeight: prescribedWeight,
    actualRir: null,
    completed: false,
    completedAt: null,
  };
}

function templateExerciseToWorkoutExercise(
  exercise: Pick<
    TemplateExercise,
    | "exerciseId"
    | "name"
    | "restSeconds"
    | "setCount"
    | "repMin"
    | "repMax"
    | "targetRir"
    | "targetWeight"
  >,
  prescribedReps?: number[],
  prescribedWeight = exercise.targetWeight,
  prescription: WorkoutPrescription | null = null,
): WorkoutExercise {
  return {
    id: createId("workout-exercise"),
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    restSeconds: exercise.restSeconds,
    sets: Array.from({ length: exercise.setCount }, (_, index) =>
      createWorkoutSet(
        exercise.repMin,
        exercise.repMax,
        exercise.targetRir,
        prescribedWeight,
        prescribedReps?.[index] ?? exercise.repMin,
      ),
    ),
    prescription,
    progression: null,
    completed: false,
    completedAt: null,
  };
}

export function createWorkoutExercise(
  exercise: Exercise,
  restSeconds: number,
): WorkoutExercise {
  return templateExerciseToWorkoutExercise(
    createTemplateExercise(exercise, restSeconds),
  );
}

export function updateUnfinishedSetWeights(
  exercise: WorkoutExercise,
  weight: number | null,
): WorkoutExercise {
  return {
    ...exercise,
    sets: exercise.sets.map((set) =>
      set.completed
        ? set
        : {
            ...set,
            prescribedWeight: weight,
            actualWeight: weight,
          },
    ),
  };
}

export function startCustomWorkout(now = Date.now()): WorkoutSession {
  return {
    id: createId("workout"),
    name: "Custom workout",
    sourceTemplateId: null,
    status: "active",
    startedAt: now,
    endedAt: null,
    pausedAt: null,
    pausedTotalMs: 0,
    restDeadline: null,
    currentExerciseIndex: 0,
    exercises: [],
  };
}

export function startTemplateWorkout(
  template: WorkoutTemplate,
  state: AppState,
  now = Date.now(),
): WorkoutSession {
  return {
    id: createId("workout"),
    name: template.name,
    sourceTemplateId: template.id,
    status: "active",
    startedAt: now,
    endedAt: null,
    pausedAt: null,
    pausedTotalMs: 0,
    restDeadline: null,
    currentExerciseIndex: 0,
    exercises: template.exercises.map((exercise) => {
      const suggestion = templateExercisePrescription(state, exercise, now);
      return templateExerciseToWorkoutExercise(
        exercise,
        suggestion.reps,
        suggestion.prescription.nominalWeight,
        suggestion.prescription,
      );
    }),
  };
}

export function workoutToTemplate(
  workout: WorkoutSession,
  now = Date.now(),
): WorkoutTemplate {
  return {
    id: createId("template"),
    name: workout.name === "Custom workout" ? "My workout" : workout.name,
    createdAt: now,
    updatedAt: now,
    exercises: workout.exercises.map((exercise) => {
      const first = exercise.sets[0];
      const firstCompleted = exercise.sets.find((set) => set.completed);
      const commonWeight = commonCompletedWorkingWeight(exercise);
      return {
        id: createId("template-exercise"),
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        restSeconds: exercise.restSeconds,
        setCount: Math.max(1, exercise.sets.length),
        repMin: first?.prescribedRepMin ?? 8,
        repMax: first?.prescribedRepMax ?? 12,
        targetRir: first?.prescribedRir ?? 2,
        targetWeight:
          commonWeight !== undefined
            ? commonWeight
            : (firstCompleted?.actualWeight ?? null),
      };
    }),
  };
}

export function elapsedWorkoutMs(
  workout: WorkoutSession,
  now = Date.now(),
): number {
  const end = workout.pausedAt ?? workout.endedAt ?? now;
  return Math.max(0, end - workout.startedAt - workout.pausedTotalMs);
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`
    : `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatWeight(value: number | null): string {
  if (value === null || value === 0) return "Bodyweight";
  return `${Number.isInteger(value) ? value : value.toFixed(1)} kg`;
}

/** Logged RIR values. Two is the open-ended 2+ bucket. */
export const RIR_OPTIONS = [0, 1, 2] as const;
export const TARGET_RIR_OPTIONS = [0, 1, 2] as const;
export const RIR_PLUS_VALUE = 2;

export function formatRirLabel(value: number): string {
  return String(value);
}

export function formatLoggedRirLabel(value: number): string {
  return value >= RIR_PLUS_VALUE ? `${RIR_PLUS_VALUE}+` : String(value);
}

export function formatRir(value: number | null): string {
  return value === null ? "RIR ?" : `RIR ${formatLoggedRirLabel(value)}`;
}

export function formatRirMeaning(value: number): string {
  if (value <= 0) return "Technical failure";
  return `${value} clean rep${value === 1 ? "" : "s"} left`;
}

export function formatRirSetInstruction(value: number): string {
  if (value <= 0) {
    return "Stop at technical failure—when another clean rep is not possible.";
  }
  return `Stop when you could do about ${value} more clean rep${
    value === 1 ? "" : "s"
  } with the same technique.`;
}

/** Clamp logged RIR to 0, 1, or the open-ended 2+ bucket (stored as 2). */
export function normalizeRir(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value >= RIR_PLUS_VALUE) return RIR_PLUS_VALUE;
  return Math.trunc(value);
}

export function normalizeNullableRir(value: number | null): number | null {
  return value === null ? null : normalizeRir(value);
}

export function normalizeTargetRir(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(TARGET_RIR_OPTIONS.at(-1) ?? 2, Math.trunc(value));
}

export function formatSetSummary(sets: WorkoutSet[]): string {
  const completed = sets.filter((set) => set.completed);
  if (completed.length === 0) return "No completed sets";
  const groups = new Map<string, number>();
  for (const set of completed) {
    const key = `${set.actualReps} @ ${formatWeight(set.actualWeight)} · ${formatRir(set.actualRir)}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return Array.from(groups.entries())
    .map(([key, count]) => `${count}×${key}`)
    .join(" · ");
}

function completedSets(exercise: WorkoutExercise): WorkoutSet[] {
  return exercise.sets.filter((set) => set.completed);
}

function commonWorkingWeight(sets: WorkoutSet[]): number | null | undefined {
  const weights = new Set(sets.map((set) => set.actualWeight));
  return weights.size === 1 ? sets[0]?.actualWeight : undefined;
}

export function commonCompletedWorkingWeight(
  exercise: WorkoutExercise,
): number | null | undefined {
  return commonWorkingWeight(completedSets(exercise));
}

function roundToHalfKg(value: number): number {
  return Math.round(value * 2) / 2;
}

export function suggestedIncreasedWeight(workingWeight: number): number {
  if (!Number.isFinite(workingWeight) || workingWeight <= 0) return 0;
  const minimumIncrease = Math.ceil((workingWeight + 0.5) * 2) / 2;
  return Math.max(minimumIncrease, roundToHalfKg(workingWeight * 1.05));
}

export function suggestedReducedWeight(workingWeight: number): number {
  if (!Number.isFinite(workingWeight) || workingWeight <= 0) return 0;
  const minimumReduction = Math.floor((workingWeight - 0.5) * 2) / 2;
  return Math.max(
    0,
    Math.min(minimumReduction, roundToHalfKg(workingWeight * 0.95)),
  );
}

function isHardMiss(exercise: WorkoutExercise): boolean {
  const hardMisses = completedSets(exercise).filter(
    (set) =>
      set.actualReps < set.prescribedRepMin &&
      set.actualRir !== null &&
      set.actualRir <= Math.max(0, set.prescribedRir - 1),
  );
  return hardMisses.length >= Math.min(2, exercise.sets.length);
}

function isComparableCompletedAttempt(
  exercise: WorkoutExercise,
  workingWeight: number | null,
  prescription: WorkoutSet[],
): boolean {
  const sets = completedSets(exercise);
  if (
    sets.length !== exercise.sets.length ||
    sets.some((set) => set.actualRir === null) ||
    commonWorkingWeight(sets) !== workingWeight ||
    sets.length !== prescription.length
  ) {
    return false;
  }

  return sets.every((set, index) => {
    const current = prescription[index];
    return (
      current !== undefined &&
      set.prescribedRepMin === current.prescribedRepMin &&
      set.prescribedRepMax === current.prescribedRepMax &&
      set.prescribedRir === current.prescribedRir
    );
  });
}

interface ExerciseAttempt {
  workout: WorkoutSession;
  exercise: WorkoutExercise;
}

function recentExerciseAttempts(
  state: AppState,
  exerciseId: string,
  before: number,
): ExerciseAttempt[] {
  return state.workouts
    .filter(
      (workout) =>
        workout.status === "completed" &&
        (workout.endedAt ?? workout.startedAt) < before,
    )
    .flatMap((workout) =>
      workout.exercises
        .filter(
          (exercise) =>
            exercise.exerciseId === exerciseId &&
            exercise.sets.some((set) => set.completed),
        )
        .map((exercise) => ({ workout, exercise })),
    )
    .sort(
      (a, b) =>
        (b.workout.endedAt ?? b.workout.startedAt) -
        (a.workout.endedAt ?? a.workout.startedAt),
    );
}

function isEligibleTemplateAttempt(
  exercise: WorkoutExercise,
  template: TemplateExercise,
): boolean {
  const sets = completedSets(exercise);
  return (
    exercise.sets.length === template.setCount &&
    sets.length === template.setCount &&
    sets.every(
      (set) =>
        set.actualRir !== null &&
        set.prescribedRepMin === template.repMin &&
        set.prescribedRepMax === template.repMax &&
        set.prescribedRir === template.targetRir,
    ) &&
    commonWorkingWeight(sets) !== undefined
  );
}

function clampRepTarget(value: number, template: TemplateExercise): number {
  return Math.max(template.repMin, Math.min(template.repMax, value));
}

function templateExercisePrescription(
  state: AppState,
  template: TemplateExercise,
  before: number,
): { reps: number[]; prescription: WorkoutPrescription } {
  const attempts = recentExerciseAttempts(state, template.exerciseId, before);
  const latest = attempts[0];
  const defaultReps = Array.from(
    { length: template.setCount },
    () => template.repMin,
  );

  if (!latest || !isEligibleTemplateAttempt(latest.exercise, template)) {
    return {
      reps: defaultReps,
      prescription: {
        kind: "baseline",
        sourceWorkoutId: null,
        sourceDate: null,
        nominalWeight: template.targetWeight,
        title: "Template starting point",
        detail: latest
          ? "The latest attempt was not complete and comparable, so this workout uses the template defaults."
          : "No comparable history yet, so this workout uses the template defaults.",
      },
    };
  }

  const previous = attempts[1]?.exercise;
  const recommendation = progressionRecommendation(latest.exercise, previous);
  const sourceDate =
    latest.workout.endedAt ?? latest.workout.startedAt;

  if (
    recommendation.kind === "increase" ||
    recommendation.kind === "reduce"
  ) {
    const direction = recommendation.kind === "increase" ? "up" : "down";
    return {
      reps: defaultReps,
      prescription: {
        kind: recommendation.kind,
        sourceWorkoutId: latest.workout.id,
        sourceDate,
        nominalWeight: recommendation.nextWeight,
        title: recommendation.title,
        detail: `Based on the latest comparable workout, reset to ${template.repMin} reps per set and round ${direction} to the closest weight this machine offers.`,
      },
    };
  }

  const latestSets = completedSets(latest.exercise);
  const workingWeight = commonWorkingWeight(latestSets);
  const allAtTop = latestSets.every(
    (set) =>
      set.actualReps >= template.repMax &&
      (set.actualRir ?? -1) >= template.targetRir,
  );

  if (allAtTop && (workingWeight === null || workingWeight === 0)) {
    return {
      reps: latestSets.map(() => template.repMax),
      prescription: {
        kind: "bodyweight",
        sourceWorkoutId: latest.workout.id,
        sourceDate,
        nominalWeight: workingWeight,
        title: "Rep range completed",
        detail:
          "Keep the top rep target, then add external load or choose a harder variation when appropriate.",
      },
    };
  }

  const reps = latestSets.map((set) =>
    clampRepTarget(
      set.actualRir !== null && set.actualRir >= template.targetRir
        ? set.actualReps + 1
        : set.actualReps,
      template,
    ),
  );
  const progressed = reps.some(
    (target, index) => target > clampRepTarget(latestSets[index]?.actualReps ?? 0, template),
  );

  return {
    reps,
    prescription: {
      kind: progressed ? "progress" : "hold",
      sourceWorkoutId: latest.workout.id,
      sourceDate,
      nominalWeight:
        workingWeight !== undefined ? workingWeight : template.targetWeight,
      title: progressed ? "Build one rep per successful set" : "Repeat the target",
      detail: progressed
        ? "Sets that met the target RIR advance by one rep; other sets repeat their last result."
        : "The last result did not earn additional reps, so repeat it within the template range.",
    },
  };
}

export function progressionRecommendation(
  exercise: WorkoutExercise,
  previousExercise?: WorkoutExercise,
): ProgressionRecommendation {
  const sets = completedSets(exercise);

  if (sets.length === 0) {
    return {
      kind: "insufficient",
      nextWeight: null,
      title: "No recommendation yet",
      detail: "Complete at least one work set first.",
    };
  }

  if (sets.length !== exercise.sets.length) {
    return {
      kind: "insufficient",
      nextWeight: null,
      title: "Keep the working weight",
      detail: "Complete all planned sets for a progression recommendation.",
    };
  }

  if (sets.some((set) => set.actualRir === null)) {
    return {
      kind: "insufficient",
      nextWeight: null,
      title: "Keep the working weight",
      detail: "Log RIR for every set so effort can be compared.",
    };
  }

  const workingWeight = commonWorkingWeight(sets);
  if (workingWeight === undefined) {
    return {
      kind: "insufficient",
      nextWeight: null,
      title: "Keep the working weight",
      detail: "Use one working weight across the sets for double progression.",
    };
  }

  const allAtTop = sets.every(
    (set) =>
      set.actualReps >= set.prescribedRepMax &&
      (set.actualRir ?? -1) >= set.prescribedRir,
  );
  if (allAtTop) {
    if (workingWeight === null || workingWeight === 0) {
      return {
        kind: "hold",
        nextWeight: workingWeight,
        title: "Range completed",
        detail: "Add external load or choose a harder variation next time.",
      };
    }
    const nextWeight = suggestedIncreasedWeight(workingWeight);
    return {
      kind: "increase",
      nextWeight,
      title: `Increase to ${formatWeight(nextWeight)}`,
      detail: "Every set reached the top of the range at the target RIR.",
    };
  }

  if (
    isHardMiss(exercise) &&
    previousExercise &&
    isComparableCompletedAttempt(previousExercise, workingWeight, sets) &&
    isHardMiss(previousExercise) &&
    workingWeight !== null &&
    workingWeight > 0
  ) {
    const nextWeight = suggestedReducedWeight(workingWeight);
    return {
      kind: "reduce",
      nextWeight,
      title: `Reduce to ${formatWeight(nextWeight)}`,
      detail: "The minimum reps were missed at high effort twice in a row.",
    };
  }

  if (isHardMiss(exercise)) {
    return {
      kind: "hold",
      nextWeight: workingWeight,
      title: "Repeat this weight once",
      detail: "The range was missed at high effort; one session can be a bad day.",
    };
  }

  const reachedTopTooHard = sets.every(
    (set) => set.actualReps >= set.prescribedRepMax,
  );
  return {
    kind: "hold",
    nextWeight: workingWeight,
    title: `Keep ${formatWeight(workingWeight)}`,
    detail: reachedTopTooHard
      ? "The top of the range was reached, but below the target RIR."
      : "Stay in the range and build reps while keeping the target RIR.",
  };
}

export function previousCompletedExercise(
  state: AppState,
  exerciseId: string,
  before: number = Number.POSITIVE_INFINITY,
): WorkoutExercise | undefined {
  return state.workouts
    .filter(
      (workout) =>
        workout.status === "completed" &&
        (workout.endedAt ?? workout.startedAt) < before,
    )
    .sort(
      (a, b) =>
        (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt),
    )
    .flatMap((workout) => workout.exercises)
    .find(
      (exercise) =>
        exercise.exerciseId === exerciseId &&
        exercise.sets.some((set) => set.completed),
    );
}

export function estimatedOneRepMax(set: WorkoutSet): number {
  if (!set.completed || !set.actualWeight) return 0;
  const repsToFailure = set.actualReps + (set.actualRir ?? 0);
  return set.actualWeight * (1 + repsToFailure / 30);
}

export function exerciseHistory(
  state: AppState,
  exerciseId: string,
): ExerciseHistoryPoint[] {
  return state.workouts
    .filter((workout) => workout.status === "completed")
    .flatMap((workout) =>
      workout.exercises
        .filter(
          (exercise) =>
            exercise.exerciseId === exerciseId &&
            exercise.sets.some((set) => set.completed),
        )
        .map((exercise) => {
          const sets = completedSets(exercise);
          const rirValues = sets.flatMap((set) =>
            set.actualRir === null ? [] : [set.actualRir],
          );
          return {
            workoutId: workout.id,
            date: workout.endedAt ?? workout.startedAt,
            workoutName: workout.name,
            bestWeight: sets.reduce(
              (best, set) => Math.max(best, set.actualWeight ?? 0),
              0,
            ),
            estimatedOneRepMax: sets.reduce(
              (best, set) => Math.max(best, estimatedOneRepMax(set)),
              0,
            ),
            volume: sets.reduce(
              (total, set) => total + set.actualReps * (set.actualWeight ?? 0),
              0,
            ),
            totalReps: sets.reduce((total, set) => total + set.actualReps, 0),
            averageRir: rirValues.length
              ? rirValues.reduce((sum, rir) => sum + rir, 0) / rirValues.length
              : null,
            setSummary: formatSetSummary(sets),
            progression: exercise.progression,
          };
        }),
    )
    .sort((a, b) => a.date - b.date);
}

export function recentExerciseHistory(
  state: AppState,
  exerciseId: string,
  limit = 2,
): ExerciseHistoryPoint[] {
  return exerciseHistory(state, exerciseId).slice(-limit).reverse();
}

function escapeCsv(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function exportCsv(state: AppState): string {
  const rows: unknown[][] = [
    [
      "workout_id",
      "workout_name",
      "date",
      "duration_seconds",
      "exercise_id",
      "exercise",
      "set",
      "rep_range_min",
      "rep_range_max",
      "target_reps",
      "target_rir",
      "completed_reps",
      "target_weight_kg",
      "completed_weight_kg",
      "completed_rir",
      "progression",
      "next_weight_kg",
    ],
  ];
  for (const workout of state.workouts.filter(
    (item) => item.status === "completed",
  )) {
    for (const exercise of workout.exercises) {
      exercise.sets.forEach((set, index) => {
        if (!set.completed) return;
        rows.push([
          workout.id,
          workout.name,
          new Date(workout.endedAt ?? workout.startedAt).toISOString(),
          Math.round(elapsedWorkoutMs(workout) / 1000),
          exercise.exerciseId,
          exercise.name,
          index + 1,
          set.prescribedRepMin,
          set.prescribedRepMax,
          set.prescribedReps,
          set.prescribedRir,
          set.actualReps,
          set.prescribedWeight ?? "",
          set.actualWeight ?? "",
          set.actualRir ?? "",
          exercise.progression?.kind ?? "",
          exercise.progression?.nextWeight ?? "",
        ]);
      });
    }
  }
  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

export function exportJson(state: AppState): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: "Workout Tracker",
      ...state,
    },
    null,
    2,
  );
}

export function parseAppStateBackup(contents: string): AppState {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error("This file is not valid JSON.");
  }

  if (!value || typeof value !== "object") {
    throw new Error("This file is not a Workout Tracker backup.");
  }

  const candidate = value as Record<string, unknown>;
  if (
    candidate.app !== "Workout Tracker" ||
    (candidate.schemaVersion !== 2 && candidate.schemaVersion !== 3)
  ) {
    throw new Error("This file is not a supported Workout Tracker backup.");
  }

  if (
    !Array.isArray(candidate.exercises) ||
    !Array.isArray(candidate.templates) ||
    !Array.isArray(candidate.workouts) ||
    (candidate.preferences !== undefined &&
      (!candidate.preferences ||
        typeof candidate.preferences !== "object" ||
        Array.isArray(candidate.preferences)))
  ) {
    throw new Error("This backup is incomplete or damaged.");
  }

  return loadCurrentState(candidate);
}

type StoredWorkoutSet = Omit<WorkoutSet, "prescribedReps"> & {
  prescribedReps?: number;
};

type StoredWorkoutExercise = Omit<
  WorkoutExercise,
  "prescription" | "sets"
> & {
  prescription?: WorkoutPrescription | null;
  incrementKg?: number;
  sets: StoredWorkoutSet[];
};

type StoredWorkoutSession = Omit<WorkoutSession, "exercises"> & {
  exercises: StoredWorkoutExercise[];
};

type StoredTemplateExercise = TemplateExercise & { incrementKg?: number };

function normalizeTemplateExercise(
  exercise: StoredTemplateExercise,
): TemplateExercise {
  return {
    id: exercise.id,
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    restSeconds: exercise.restSeconds,
    setCount: exercise.setCount,
    repMin: exercise.repMin,
    repMax: exercise.repMax,
    targetRir: normalizeTargetRir(exercise.targetRir),
    targetWeight: exercise.targetWeight,
  };
}

function normalizeWorkoutSet(set: StoredWorkoutSet): WorkoutSet {
  const suggestedReps = Number.isFinite(set.prescribedReps)
    ? (set.prescribedReps as number)
    : Number.isFinite(set.actualReps)
      ? set.actualReps
      : set.prescribedRepMin;
  return {
    id: set.id,
    prescribedRepMin: set.prescribedRepMin,
    prescribedRepMax: set.prescribedRepMax,
    prescribedReps: Math.max(
      set.prescribedRepMin,
      Math.min(set.prescribedRepMax, suggestedReps),
    ),
    prescribedRir: normalizeTargetRir(set.prescribedRir),
    prescribedWeight: set.prescribedWeight,
    actualReps: set.actualReps,
    actualWeight: set.actualWeight,
    actualRir: normalizeNullableRir(set.actualRir),
    completed: set.completed,
    completedAt: set.completedAt,
  };
}

function normalizeWorkoutExercise(
  exercise: StoredWorkoutExercise,
): WorkoutExercise {
  return {
    id: exercise.id,
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    restSeconds: exercise.restSeconds,
    sets: Array.isArray(exercise.sets)
      ? exercise.sets.map(normalizeWorkoutSet)
      : [],
    prescription: exercise.prescription ?? null,
    progression: exercise.progression,
    completed: exercise.completed,
    completedAt: exercise.completedAt,
  };
}

function normalizeWorkout(workout: StoredWorkoutSession): WorkoutSession {
  return {
    ...workout,
    exercises: Array.isArray(workout.exercises)
      ? workout.exercises.map(normalizeWorkoutExercise)
      : [],
  };
}

function normalizeTemplate(template: WorkoutTemplate): WorkoutTemplate {
  return {
    ...template,
    exercises: Array.isArray(template.exercises)
      ? (template.exercises as StoredTemplateExercise[]).map(
          normalizeTemplateExercise,
        )
      : [],
  };
}

export function loadCurrentState(value: unknown): AppState {
  if (!value || typeof value !== "object") return structuredClone(EMPTY_STATE);
  const candidate = value as Partial<Omit<AppState, "schemaVersion">> & {
    schemaVersion?: number;
  };
  if (candidate.schemaVersion !== 2 && candidate.schemaVersion !== 3) {
    return structuredClone(EMPTY_STATE);
  }
  return {
    schemaVersion: 3,
    exercises: Array.isArray(candidate.exercises) ? candidate.exercises : [],
    templates: Array.isArray(candidate.templates)
      ? candidate.templates.map(normalizeTemplate)
      : [],
    workouts: Array.isArray(candidate.workouts)
      ? (candidate.workouts as StoredWorkoutSession[]).map(normalizeWorkout)
      : [],
    preferences: {
      ...EMPTY_STATE.preferences,
      ...(candidate.preferences ?? {}),
    },
  };
}
