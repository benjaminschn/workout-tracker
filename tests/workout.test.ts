import assert from "node:assert/strict";
import test from "node:test";
import {
  AppState,
  elapsedWorkoutMs,
  exerciseHistory,
  exportCsv,
  exportJson,
  formatDuration,
  migrateState,
  normalizeExerciseName,
  parseAppStateBackup,
  recentExerciseHistory,
  WorkoutSession,
} from "../lib/workout";

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

test("normalizes exercise names without losing display intent", () => {
  assert.equal(normalizeExerciseName("  Bench   Press "), "bench press");
});

test("calculates elapsed time from timestamps and pauses", () => {
  assert.equal(elapsedWorkoutMs(workout()), 50_000);
  assert.equal(formatDuration(3_665_000), "1:01:05");
});

test("history ignores non-completed workouts and returns the latest two", () => {
  const make = (id: string, date: number, status: WorkoutSession["status"]) =>
    workout({
      id,
      status,
      endedAt: date,
      exercises: [
        {
          id: `${id}-exercise`,
          exerciseId: "squat",
          name: "Back Squat",
          restSeconds: 90,
          difficulty: "medium",
          completed: true,
          completedAt: date,
          sets: [
            {
              id: `${id}-set`,
              targetReps: 5,
              actualReps: 5,
              targetWeight: 100,
              actualWeight: 100,
              completed: true,
              completedAt: date,
            },
          ],
        },
      ],
    });
  const state: AppState = {
    schemaVersion: 1,
    exercises: [],
    templates: [],
    preferences: { defaultRestSeconds: 90, installHintDismissed: false },
    workouts: [
      make("one", 10, "completed"),
      make("two", 20, "discarded"),
      make("three", 30, "completed"),
      make("four", 40, "completed"),
    ],
  };
  assert.equal(exerciseHistory(state, "squat").length, 3);
  assert.deepEqual(
    recentExerciseHistory(state, "squat").map((point) => point.workoutId),
    ["four", "three"],
  );
});

test("calculates best weight and volume from completed sets only", () => {
  const state: AppState = {
    schemaVersion: 1,
    exercises: [],
    templates: [],
    preferences: { defaultRestSeconds: 90, installHintDismissed: false },
    workouts: [
      workout({
        exercises: [
          {
            id: "exercise",
            exerciseId: "squat",
            name: "Back Squat",
            restSeconds: 90,
            difficulty: "hard",
            completed: true,
            completedAt: 60_000,
            sets: [
              {
                id: "a",
                targetReps: 5,
                actualReps: 5,
                targetWeight: 100,
                actualWeight: 100,
                completed: true,
                completedAt: 10,
              },
              {
                id: "b",
                targetReps: 3,
                actualReps: 3,
                targetWeight: 110,
                actualWeight: 110,
                completed: true,
                completedAt: 20,
              },
              {
                id: "c",
                targetReps: 10,
                actualReps: 10,
                targetWeight: 200,
                actualWeight: 200,
                completed: false,
                completedAt: null,
              },
            ],
          },
        ],
      }),
    ],
  };
  const [point] = exerciseHistory(state, "squat");
  assert.equal(point.bestWeight, 110);
  assert.equal(point.volume, 830);
  assert.equal(point.totalReps, 8);
});

test("CSV escapes names and includes only completed sets", () => {
  const state = migrateState({
    schemaVersion: 1,
    exercises: [],
    templates: [],
    preferences: { defaultRestSeconds: 90, installHintDismissed: false },
    workouts: [
      workout({
        name: 'Upper, "A"',
        exercises: [
          {
            id: "exercise",
            exerciseId: "press",
            name: "Press",
            restSeconds: 90,
            difficulty: "easy",
            completed: true,
            completedAt: 60_000,
            sets: [
              {
                id: "set",
                targetReps: 8,
                actualReps: 8,
                targetWeight: null,
                actualWeight: null,
                completed: true,
                completedAt: 20,
              },
            ],
          },
        ],
      }),
    ],
  });
  const csv = exportCsv(state);
  assert.match(csv, /"Upper, ""A"""/);
  assert.equal(csv.split("\n").length, 2);
});

test("JSON backups round-trip through strict validation", () => {
  const state = migrateState({
    schemaVersion: 1,
    exercises: [],
    templates: [],
    workouts: [workout()],
    preferences: { defaultRestSeconds: 120, installHintDismissed: false },
  });

  assert.deepEqual(parseAppStateBackup(exportJson(state)), state);
});

test("JSON backup import applies preference migration defaults", () => {
  const backup = JSON.stringify({
    app: "Workout Tracker",
    schemaVersion: 1,
    exercises: [],
    templates: [],
    workouts: [],
    preferences: { defaultRestSeconds: 60 },
  });

  assert.deepEqual(parseAppStateBackup(backup).preferences, {
    defaultRestSeconds: 60,
    installHintDismissed: false,
  });
});

test("JSON backup import rejects malformed or unsupported files", () => {
  assert.throws(() => parseAppStateBackup("{"), /valid JSON/);
  assert.throws(
    () =>
      parseAppStateBackup(
        JSON.stringify({
          app: "Workout Tracker",
          schemaVersion: 2,
          exercises: [],
          templates: [],
          workouts: [],
        }),
      ),
    /supported Workout Tracker backup/,
  );
  assert.throws(
    () =>
      parseAppStateBackup(
        JSON.stringify({
          app: "Workout Tracker",
          schemaVersion: 1,
          exercises: {},
          templates: [],
          workouts: [],
        }),
      ),
    /incomplete or damaged/,
  );
});
