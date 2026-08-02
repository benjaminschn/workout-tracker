export type WorkoutStatus = "active" | "completed" | "discarded";
export type ProgressionKind = "increase" | "hold" | "reduce" | "insufficient";

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
  incrementKg: number;
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

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  name: string;
  restSeconds: number;
  incrementKg: number;
  sets: WorkoutSet[];
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
  installHintDismissed: boolean;
}

export interface AppState {
  schemaVersion: 2;
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
  schemaVersion: 2,
  exercises: [],
  templates: [],
  workouts: [],
  preferences: {
    defaultRestSeconds: 90,
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
    incrementKg: 2.5,
  };
}

export function createWorkoutSet(
  repMin = 8,
  repMax = 12,
  prescribedRir = 2,
  prescribedWeight: number | null = null,
): WorkoutSet {
  return {
    id: createId("set"),
    prescribedRepMin: repMin,
    prescribedRepMax: repMax,
    prescribedRir,
    prescribedWeight,
    actualReps: repMin,
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
    | "incrementKg"
  >,
): WorkoutExercise {
  return {
    id: createId("workout-exercise"),
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    restSeconds: exercise.restSeconds,
    incrementKg: exercise.incrementKg,
    sets: Array.from({ length: exercise.setCount }, () =>
      createWorkoutSet(
        exercise.repMin,
        exercise.repMax,
        exercise.targetRir,
        exercise.targetWeight,
      ),
    ),
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
    exercises: template.exercises.map(templateExerciseToWorkoutExercise),
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
          exercise.progression?.nextWeight ?? firstCompleted?.actualWeight ?? null,
        incrementKg: exercise.incrementKg,
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

export function formatRir(value: number | null): string {
  return value === null ? "RIR ?" : `RIR ${value >= 5 ? "5+" : value}`;
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

function isHardMiss(exercise: WorkoutExercise): boolean {
  const hardMisses = completedSets(exercise).filter(
    (set) =>
      set.actualReps < set.prescribedRepMin &&
      set.actualRir !== null &&
      set.actualRir <= Math.max(0, set.prescribedRir - 1),
  );
  return hardMisses.length >= Math.min(2, exercise.sets.length);
}

export function progressionRecommendation(
  exercise: WorkoutExercise,
  previousExercise?: WorkoutExercise,
): ProgressionRecommendation {
  const sets = completedSets(exercise);
  const fallbackWeight = sets[0]?.actualWeight ?? null;

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
      nextWeight: fallbackWeight,
      title: "Keep the working weight",
      detail: "Complete all planned sets for a progression recommendation.",
    };
  }

  if (sets.some((set) => set.actualRir === null)) {
    return {
      kind: "insufficient",
      nextWeight: fallbackWeight,
      title: "Keep the working weight",
      detail: "Log RIR for every set so effort can be compared.",
    };
  }

  const workingWeight = commonWorkingWeight(sets);
  if (workingWeight === undefined) {
    return {
      kind: "insufficient",
      nextWeight: fallbackWeight,
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
    const nextWeight = workingWeight + exercise.incrementKg;
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
    isHardMiss(previousExercise) &&
    workingWeight !== null &&
    workingWeight > 0
  ) {
    const nextWeight = Math.max(0, workingWeight - exercise.incrementKg);
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
  if (candidate.app !== "Workout Tracker" || candidate.schemaVersion !== 2) {
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

export function loadCurrentState(value: unknown): AppState {
  if (!value || typeof value !== "object") return structuredClone(EMPTY_STATE);
  const candidate = value as Partial<AppState>;
  if (candidate.schemaVersion !== 2) return structuredClone(EMPTY_STATE);
  return {
    schemaVersion: 2,
    exercises: Array.isArray(candidate.exercises) ? candidate.exercises : [],
    templates: Array.isArray(candidate.templates) ? candidate.templates : [],
    workouts: Array.isArray(candidate.workouts) ? candidate.workouts : [],
    preferences: {
      ...EMPTY_STATE.preferences,
      ...(candidate.preferences ?? {}),
    },
  };
}
