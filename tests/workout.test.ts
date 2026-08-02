import assert from "node:assert/strict";
import test from "node:test";
import {
  AppState,
  elapsedWorkoutMs,
  exerciseHistory,
  exportCsv,
  exportJson,
  formatDuration,
  loadCurrentState,
  normalizeExerciseName,
  parseAppStateBackup,
  progressionRecommendation,
  WorkoutExercise,
  WorkoutSession,
  WorkoutSet,
} from "../lib/workout";

const set = (overrides: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: "set-1",
  prescribedRepMin: 9,
  prescribedRepMax: 12,
  prescribedRir: 2,
  prescribedWeight: 50,
  actualReps: 9,
  actualWeight: 50,
  actualRir: 2,
  completed: true,
  completedAt: 10,
  ...overrides,
});

const exercise = (
  overrides: Partial<WorkoutExercise> = {},
): WorkoutExercise => ({
  id: "workout-exercise-1",
  exerciseId: "squat",
  name: "Back Squat",
  restSeconds: 90,
  incrementKg: 2.5,
  sets: [set({ id: "a" }), set({ id: "b" }), set({ id: "c" })],
  progression: null,
  completed: true,
  completedAt: 60_000,
  ...overrides,
});

const workout = (overrides: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id: "workout-1",
  name: "Strength",
  sourceTemplateId: null,
  status: "completed",
  startedAt: 1_000,
  endedAt: 61_000,
  pausedAt: null,
  pausedTotalMs: 10_000,
  restDeadline: null,
  currentExerciseIndex: 0,
  exercises: [],
  ...overrides,
});

const state = (workouts: WorkoutSession[] = []): AppState => ({
  schemaVersion: 2,
  exercises: [],
  templates: [],
  preferences: { defaultRestSeconds: 90, installHintDismissed: false },
  workouts,
});

test("normalizes exercise names without losing display intent", () => {
  assert.equal(normalizeExerciseName("  Bench   Press "), "bench press");
});

test("calculates elapsed time from timestamps and pauses", () => {
  assert.equal(elapsedWorkoutMs(workout()), 50_000);
  assert.equal(formatDuration(3_665_000), "1:01:05");
});

test("history ignores non-completed workouts and returns RIR-aware metrics", () => {
  const completedExercise = exercise({
    sets: [
      set({ id: "a", actualReps: 12, actualWeight: 50, actualRir: 2 }),
      set({ id: "b", actualReps: 10, actualWeight: 55, actualRir: 1 }),
      set({ id: "c", completed: false, actualWeight: 200 }),
    ],
  });
  const result = exerciseHistory(
    state([
      workout({ exercises: [completedExercise] }),
      workout({ id: "discarded", status: "discarded", exercises: [exercise()] }),
    ]),
    "squat",
  )[0];

  assert.equal(result.bestWeight, 55);
  assert.equal(result.volume, 1_150);
  assert.equal(result.totalReps, 22);
  assert.equal(result.averageRir, 1.5);
  assert.equal(Math.round(result.estimatedOneRepMax * 10) / 10, 75.2);
  assert.match(result.setSummary, /RIR 2/);
});

test("double progression increases only after every set reaches the top at target RIR", () => {
  const result = progressionRecommendation(
    exercise({
      sets: [
        set({ id: "a", actualReps: 12, actualRir: 3 }),
        set({ id: "b", actualReps: 12, actualRir: 2 }),
        set({ id: "c", actualReps: 12, actualRir: 2 }),
      ],
    }),
  );

  assert.equal(result.kind, "increase");
  assert.equal(result.nextWeight, 52.5);
});

test("double progression holds when the rep range was completed too hard", () => {
  const result = progressionRecommendation(
    exercise({
      sets: [
        set({ id: "a", actualReps: 12, actualRir: 2 }),
        set({ id: "b", actualReps: 12, actualRir: 1 }),
        set({ id: "c", actualReps: 12, actualRir: 0 }),
      ],
    }),
  );

  assert.equal(result.kind, "hold");
  assert.equal(result.nextWeight, 50);
  assert.match(result.detail, /below the target RIR/i);
});

test("double progression reduces only after repeated high-effort misses", () => {
  const missed = exercise({
    sets: [
      set({ id: "a", actualReps: 8, actualRir: 1 }),
      set({ id: "b", actualReps: 7, actualRir: 0 }),
      set({ id: "c", actualReps: 6, actualRir: 0 }),
    ],
  });

  assert.equal(progressionRecommendation(missed).kind, "hold");
  const repeated = progressionRecommendation(missed, missed);
  assert.equal(repeated.kind, "reduce");
  assert.equal(repeated.nextWeight, 47.5);
});

test("missing RIR produces no automatic progression decision", () => {
  const result = progressionRecommendation(
    exercise({ sets: [set(), set({ id: "b" }), set({ id: "c", actualRir: null })] }),
  );
  assert.equal(result.kind, "insufficient");
  assert.match(result.detail, /Log RIR/i);
});

test("CSV exports prescription, RIR, and progression fields", () => {
  const progressed = exercise({
    progression: {
      kind: "increase",
      nextWeight: 52.5,
      title: "Increase",
      detail: "Ready",
    },
    sets: [set({ actualReps: 12, actualRir: 2 })],
  });
  const csv = exportCsv(
    state([workout({ name: 'Upper, "A"', exercises: [progressed] })]),
  );

  assert.match(csv, /rep_range_min,rep_range_max,target_rir/);
  assert.match(csv, /completed_rir,progression,next_weight_kg/);
  assert.match(csv, /"Upper, ""A"""/);
  assert.match(csv, /increase,52.5/);
  assert.equal(csv.split("\n").length, 2);
});

test("JSON backups round-trip and reject the old schema", () => {
  const current = state([workout()]);
  assert.deepEqual(parseAppStateBackup(exportJson(current)), current);

  assert.throws(
    () =>
      parseAppStateBackup(
        JSON.stringify({
          app: "Workout Tracker",
          schemaVersion: 1,
          exercises: [],
          templates: [],
          workouts: [],
        }),
      ),
    /supported Workout Tracker backup/,
  );
});

test("loading old local state starts fresh without migration", () => {
  assert.deepEqual(
    loadCurrentState({
      schemaVersion: 1,
      exercises: [{ id: "old" }],
      templates: [{ id: "old" }],
      workouts: [{ id: "old" }],
    }),
    state(),
  );
});

test("backup import rejects malformed files", () => {
  assert.throws(() => parseAppStateBackup("{"), /valid JSON/);
  assert.throws(
    () =>
      parseAppStateBackup(
        JSON.stringify({
          app: "Workout Tracker",
          schemaVersion: 2,
          exercises: [],
          templates: [],
        }),
      ),
    /incomplete or damaged/,
  );
});
