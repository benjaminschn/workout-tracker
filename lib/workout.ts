export type Difficulty = "easy" | "medium" | "hard" | "failed";
export type WorkoutStatus = "active" | "completed" | "discarded";

export interface Exercise {
  id: string;
  name: string;
  normalizedName: string;
  createdAt: number;
}

export interface TemplateSet {
  id: string;
  targetReps: number;
  targetWeight: number | null;
}

export interface TemplateExercise {
  id: string;
  exerciseId: string;
  name: string;
  restSeconds: number;
  sets: TemplateSet[];
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
  targetReps: number;
  actualReps: number;
  targetWeight: number | null;
  actualWeight: number | null;
  completed: boolean;
  completedAt: number | null;
}

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  name: string;
  restSeconds: number;
  sets: WorkoutSet[];
  difficulty: Difficulty | null;
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
  schemaVersion: 1;
  exercises: Exercise[];
  templates: WorkoutTemplate[];
  workouts: WorkoutSession[];
  preferences: Preferences;
}

export interface ExerciseHistoryPoint {
  workoutId: string;
  date: number;
  workoutName: string;
  difficulty: Difficulty | null;
  bestWeight: number;
  volume: number;
  totalReps: number;
  setSummary: string;
}

export const DIFFICULTIES: Difficulty[] = [
  "easy",
  "medium",
  "hard",
  "failed",
];

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
  schemaVersion: 1,
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

export function createTemplateSet(
  targetReps = 8,
  targetWeight: number | null = null,
): TemplateSet {
  return {
    id: createId("template-set"),
    targetReps,
    targetWeight,
  };
}

export function createWorkoutSet(
  targetReps = 8,
  targetWeight: number | null = null,
): WorkoutSet {
  return {
    id: createId("set"),
    targetReps,
    actualReps: targetReps,
    targetWeight,
    actualWeight: targetWeight,
    completed: false,
    completedAt: null,
  };
}

export function createWorkoutExercise(
  exercise: Exercise,
  restSeconds: number,
  sets: TemplateSet[] = [createTemplateSet()],
): WorkoutExercise {
  return {
    id: createId("workout-exercise"),
    exerciseId: exercise.id,
    name: exercise.name,
    restSeconds,
    sets: sets.map((set) =>
      createWorkoutSet(set.targetReps, set.targetWeight),
    ),
    difficulty: null,
    completed: false,
    completedAt: null,
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
    exercises: template.exercises.map((exercise) => ({
      id: createId("workout-exercise"),
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      restSeconds: exercise.restSeconds,
      sets: exercise.sets.map((set) =>
        createWorkoutSet(set.targetReps, set.targetWeight),
      ),
      difficulty: null,
      completed: false,
      completedAt: null,
    })),
  };
}

export function workoutToTemplate(
  workout: WorkoutSession,
  existing?: WorkoutTemplate,
  now = Date.now(),
): WorkoutTemplate {
  return {
    id: existing?.id ?? createId("template"),
    name: workout.name === "Custom workout" ? "My workout" : workout.name,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    exercises: workout.exercises.map((exercise) => ({
      id:
        existing?.exercises.find(
          (candidate) => candidate.exerciseId === exercise.exerciseId,
        )?.id ?? createId("template-exercise"),
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      restSeconds: exercise.restSeconds,
      sets: exercise.sets.map((set, index) => ({
        id:
          existing?.exercises
            .find(
              (candidate) => candidate.exerciseId === exercise.exerciseId,
            )
            ?.sets.at(index)?.id ?? createId("template-set"),
        targetReps: set.actualReps,
        targetWeight: set.actualWeight,
      })),
    })),
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

export function formatSetSummary(sets: WorkoutSet[]): string {
  const completed = sets.filter((set) => set.completed);
  if (completed.length === 0) return "No completed sets";
  const groups = new Map<string, number>();
  for (const set of completed) {
    const key = `${set.actualReps} @ ${formatWeight(set.actualWeight)}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return Array.from(groups.entries())
    .map(([key, count]) => `${count}×${key}`)
    .join(" · ");
}

export function exerciseHistory(
  state: AppState,
  exerciseId: string,
): ExerciseHistoryPoint[] {
  return state.workouts
    .filter((workout) => workout.status === "completed")
    .flatMap((workout) =>
      workout.exercises
        .filter((exercise) => exercise.exerciseId === exerciseId)
        .map((exercise) => {
          const completedSets = exercise.sets.filter((set) => set.completed);
          return {
            workoutId: workout.id,
            date: workout.endedAt ?? workout.startedAt,
            workoutName: workout.name,
            difficulty: exercise.difficulty,
            bestWeight: completedSets.reduce(
              (best, set) => Math.max(best, set.actualWeight ?? 0),
              0,
            ),
            volume: completedSets.reduce(
              (total, set) =>
                total + set.actualReps * (set.actualWeight ?? 0),
              0,
            ),
            totalReps: completedSets.reduce(
              (total, set) => total + set.actualReps,
              0,
            ),
            setSummary: formatSetSummary(completedSets),
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
      "target_reps",
      "completed_reps",
      "target_weight_kg",
      "completed_weight_kg",
      "difficulty",
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
          set.targetReps,
          set.actualReps,
          set.targetWeight ?? "",
          set.actualWeight ?? "",
          exercise.difficulty ?? "",
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

export function migrateState(value: unknown): AppState {
  if (!value || typeof value !== "object") return structuredClone(EMPTY_STATE);
  const candidate = value as Partial<AppState>;
  if (candidate.schemaVersion !== 1) return structuredClone(EMPTY_STATE);
  return {
    schemaVersion: 1,
    exercises: Array.isArray(candidate.exercises) ? candidate.exercises : [],
    templates: Array.isArray(candidate.templates) ? candidate.templates : [],
    workouts: Array.isArray(candidate.workouts) ? candidate.workouts : [],
    preferences: {
      ...EMPTY_STATE.preferences,
      ...(candidate.preferences ?? {}),
    },
  };
}
