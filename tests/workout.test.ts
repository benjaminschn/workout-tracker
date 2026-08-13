import assert from "node:assert/strict";
import test from "node:test";
import {
  AppState,
  elapsedWorkoutMs,
  exerciseHistory,
  exportCsv,
  exportJson,
  formatDuration,
  formatLoggedRirLabel,
  formatRir,
  formatRirLabel,
  formatRirMeaning,
  formatRirSetInstruction,
  loadCurrentState,
  normalizeExerciseName,
  normalizeRir,
  parseAppStateBackup,
  progressionRecommendation,
  RIR_OPTIONS,
  startTemplateWorkout,
  suggestedIncreasedWeight,
  suggestedReducedWeight,
  TARGET_RIR_OPTIONS,
  updateUnfinishedSetWeights,
  workoutToTemplate,
  WorkoutExercise,
  WorkoutSession,
  WorkoutSet,
  WorkoutTemplate,
} from "../lib/workout";

const set = (overrides: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: "set-1",
  prescribedRepMin: 9,
  prescribedRepMax: 12,
  prescribedReps: 9,
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
  sets: [set({ id: "a" }), set({ id: "b" }), set({ id: "c" })],
  prescription: null,
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
  schemaVersion: 3,
  exercises: [],
  templates: [],
  preferences: {
    defaultRestSeconds: 120,
    restTimerSoundEnabled: true,
    preventScreenLock: true,
    installHintDismissed: false,
  },
  workouts,
});

const template = (
  exerciseOverrides: Partial<WorkoutTemplate["exercises"][number]> = {},
): WorkoutTemplate => ({
  id: "template-1",
  name: "Strength",
  createdAt: 1,
  updatedAt: 1,
  exercises: [
    {
      id: "template-exercise-1",
      exerciseId: "squat",
      name: "Back Squat",
      restSeconds: 90,
      setCount: 3,
      repMin: 9,
      repMax: 12,
      targetRir: 2,
      targetWeight: 50,
      ...exerciseOverrides,
    },
  ],
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

test("logged RIR uses a simple 2+ bucket while targets stay precise", () => {
  assert.deepEqual(RIR_OPTIONS, [0, 1, 2]);
  assert.deepEqual(TARGET_RIR_OPTIONS, [0, 1, 2]);
  assert.equal(formatRirLabel(0), "0");
  assert.equal(formatRirLabel(1), "1");
  assert.equal(formatRirLabel(2), "2");
  assert.equal(formatRirLabel(3), "3");
  assert.equal(formatLoggedRirLabel(2), "2+");
  assert.equal(formatLoggedRirLabel(4), "2+");
  assert.equal(formatRir(2), "RIR 2+");
  assert.equal(formatRir(null), "RIR ?");
  assert.equal(formatRirMeaning(0), "Technical failure");
  assert.equal(formatRirMeaning(2), "2 clean reps left");
  assert.match(formatRirSetInstruction(2), /2 more clean reps/);
  assert.equal(normalizeRir(5), 2);
  assert.equal(normalizeRir(4), 2);
  assert.equal(normalizeRir(2.9), 2);
  assert.equal(normalizeRir(-1), 0);
});

test("a first template workout uses baseline weight and minimum reps", () => {
  const started = startTemplateWorkout(template(), state(), 100_000);
  const result = started.exercises[0];

  assert.deepEqual(
    result?.sets.map((item) => item.prescribedReps),
    [9, 9, 9],
  );
  assert.deepEqual(
    result?.sets.map((item) => item.actualReps),
    [9, 9, 9],
  );
  assert.deepEqual(
    result?.sets.map((item) => item.prescribedWeight),
    [50, 50, 50],
  );
  assert.equal(result?.prescription?.kind, "baseline");
});

test("template prescriptions add one rep to each globally successful set", () => {
  const history = exercise({
    sets: [
      set({ id: "a", actualReps: 10, actualRir: 2 }),
      set({ id: "b", actualReps: 11, actualRir: 1 }),
      set({ id: "c", actualReps: 12, actualRir: 2 }),
    ],
  });
  const started = startTemplateWorkout(
    template(),
    state([workout({ sourceTemplateId: null, exercises: [history] })]),
    100_000,
  );

  assert.deepEqual(
    started.exercises[0]?.sets.map((item) => item.prescribedReps),
    [11, 11, 12],
  );
  assert.equal(started.exercises[0]?.prescription?.kind, "progress");
  assert.equal(started.exercises[0]?.prescription?.sourceWorkoutId, "workout-1");
});

test("maxing the range resets reps and suggests five percent more weight", () => {
  const maxed = exercise({
    sets: [
      set({ id: "a", actualReps: 12 }),
      set({ id: "b", actualReps: 12 }),
      set({ id: "c", actualReps: 12 }),
    ],
  });
  const started = startTemplateWorkout(
    template(),
    state([workout({ exercises: [maxed] })]),
    100_000,
  );

  assert.deepEqual(
    started.exercises[0]?.sets.map((item) => item.prescribedReps),
    [9, 9, 9],
  );
  assert.equal(started.exercises[0]?.prescription?.kind, "increase");
  assert.equal(started.exercises[0]?.prescription?.nominalWeight, 52.5);
});

test("the newest invalid attempt forces template fallback instead of stale history", () => {
  const older = workout({
    id: "older",
    startedAt: 1_000,
    endedAt: 61_000,
    exercises: [exercise({ sets: [set({ id: "a", actualReps: 10 }), set({ id: "b", actualReps: 10 }), set({ id: "c", actualReps: 10 })] })],
  });
  const latest = workout({
    id: "latest",
    startedAt: 70_000,
    endedAt: 130_000,
    exercises: [
      exercise({
        sets: [
          set({ id: "a", actualReps: 11 }),
          set({ id: "b", completed: false }),
          set({ id: "c", completed: false }),
        ],
      }),
    ],
  });
  const started = startTemplateWorkout(
    template({ targetWeight: 43 }),
    state([older, latest]),
    200_000,
  );

  assert.deepEqual(
    started.exercises[0]?.sets.map((item) => item.prescribedReps),
    [9, 9, 9],
  );
  assert.equal(started.exercises[0]?.prescription?.nominalWeight, 43);
  assert.equal(started.exercises[0]?.prescription?.kind, "baseline");
});

test("mixed weights, missing RIR, and changed goals cannot drive a prescription", () => {
  const invalidAttempts = [
    exercise({
      sets: [
        set({ id: "a" }),
        set({ id: "b", actualWeight: 47.5 }),
        set({ id: "c" }),
      ],
    }),
    exercise({
      sets: [set({ id: "a" }), set({ id: "b" }), set({ id: "c", actualRir: null })],
    }),
    exercise({
      sets: [
        set({ id: "a" }),
        set({ id: "b" }),
        set({ id: "c", prescribedRepMax: 10 }),
      ],
    }),
  ];

  for (const invalid of invalidAttempts) {
    const started = startTemplateWorkout(
      template({ targetWeight: 43 }),
      state([workout({ exercises: [invalid] })]),
      100_000,
    );
    assert.equal(started.exercises[0]?.prescription?.kind, "baseline");
    assert.equal(started.exercises[0]?.prescription?.nominalWeight, 43);
  }
});

test("two comparable hard misses produce a five percent reduction", () => {
  const missed = exercise({
    sets: [
      set({ id: "a", actualReps: 8, actualRir: 1 }),
      set({ id: "b", actualReps: 7, actualRir: 0 }),
      set({ id: "c", actualReps: 6, actualRir: 0 }),
    ],
  });
  const older = workout({
    id: "older",
    startedAt: 1_000,
    endedAt: 61_000,
    exercises: [missed],
  });
  const latest = workout({
    id: "latest",
    startedAt: 70_000,
    endedAt: 130_000,
    exercises: [missed],
  });
  const started = startTemplateWorkout(
    template(),
    state([older, latest]),
    200_000,
  );

  assert.equal(started.exercises[0]?.prescription?.kind, "reduce");
  assert.equal(started.exercises[0]?.prescription?.nominalWeight, 47.5);
  assert.deepEqual(
    started.exercises[0]?.sets.map((item) => item.prescribedReps),
    [9, 9, 9],
  );
});

test("bodyweight range completion keeps the top target without a load jump", () => {
  const maxed = exercise({
    sets: [
      set({ id: "a", actualReps: 12, actualWeight: null }),
      set({ id: "b", actualReps: 12, actualWeight: null }),
      set({ id: "c", actualReps: 12, actualWeight: null }),
    ],
  });
  const started = startTemplateWorkout(
    template({ targetWeight: null }),
    state([workout({ exercises: [maxed] })]),
    100_000,
  );

  assert.equal(started.exercises[0]?.prescription?.kind, "bodyweight");
  assert.equal(started.exercises[0]?.prescription?.nominalWeight, null);
  assert.deepEqual(
    started.exercises[0]?.sets.map((item) => item.prescribedReps),
    [12, 12, 12],
  );
});

test("percentage suggestions round to half kilos and always move loaded weight", () => {
  assert.equal(suggestedIncreasedWeight(50), 52.5);
  assert.equal(suggestedIncreasedWeight(2), 2.5);
  assert.equal(suggestedIncreasedWeight(2.3), 3);
  assert.equal(suggestedReducedWeight(50), 47.5);
  assert.equal(suggestedReducedWeight(2), 1.5);
  assert.equal(suggestedReducedWeight(2.3), 1.5);
});

test("working-weight changes update only unfinished sets", () => {
  const updated = updateUnfinishedSetWeights(
    exercise({
      sets: [
        set({ id: "a", completed: true, actualWeight: 50 }),
        set({ id: "b", completed: false, actualWeight: 50 }),
        set({ id: "c", completed: false, actualWeight: 47.5 }),
      ],
    }),
    53,
  );

  assert.deepEqual(
    updated.sets.map((item) => [item.prescribedWeight, item.actualWeight]),
    [
      [50, 50],
      [53, 53],
      [53, 53],
    ],
  );
});

test("double progression increases only after every set reaches the top at target RIR", () => {
  const result = progressionRecommendation(
    exercise({
      sets: [
        set({ id: "a", actualReps: 12, actualRir: 2 }),
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
  assert.equal(result.nextWeight, null);
  assert.match(result.detail, /Log RIR/i);
});

test("incomplete or mixed-weight attempts do not update the next weight", () => {
  const incomplete = progressionRecommendation(
    exercise({
      sets: [
        set({ id: "a" }),
        set({ id: "b", completed: false }),
        set({ id: "c", completed: false }),
      ],
    }),
  );
  const mixedWeight = progressionRecommendation(
    exercise({
      sets: [
        set({ id: "a", actualWeight: 50 }),
        set({ id: "b", actualWeight: 47.5 }),
        set({ id: "c", actualWeight: 50 }),
      ],
    }),
  );

  assert.equal(incomplete.kind, "insufficient");
  assert.equal(incomplete.nextWeight, null);
  assert.equal(mixedWeight.kind, "insufficient");
  assert.equal(mixedWeight.nextWeight, null);
});

test("saving history as a template remembers actual weight, not the nominal next target", () => {
  const completed = workout({
    exercises: [
      exercise({
        sets: [set({ actualWeight: 50 })],
        progression: {
          kind: "increase",
          nextWeight: 52.5,
          title: "Increase to 52.5 kg",
          detail: "Ready to progress.",
        },
      }),
    ],
  });

  assert.equal(workoutToTemplate(completed).exercises[0]?.targetWeight, 50);
});

test("a reduction requires two comparable completed attempts", () => {
  const missed = exercise({
    sets: [
      set({ id: "a", actualReps: 8, actualRir: 1 }),
      set({ id: "b", actualReps: 7, actualRir: 0 }),
      set({ id: "c", actualReps: 6, actualRir: 0 }),
    ],
  });
  const incompletePrevious = exercise({
    sets: [
      set({ id: "a", actualReps: 7, actualRir: 0 }),
      set({ id: "b", actualReps: 6, actualRir: 0 }),
      set({ id: "c", completed: false }),
    ],
  });
  const differentWeightPrevious = exercise({
    sets: missed.sets.map((item) => ({ ...item, actualWeight: 47.5 })),
  });
  const differentRangePrevious = exercise({
    sets: missed.sets.map((item) => ({ ...item, prescribedRepMin: 8 })),
  });

  assert.equal(
    progressionRecommendation(missed, incompletePrevious).kind,
    "hold",
  );
  assert.equal(
    progressionRecommendation(missed, differentWeightPrevious).kind,
    "hold",
  );
  assert.equal(
    progressionRecommendation(missed, differentRangePrevious).kind,
    "hold",
  );
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

  assert.match(csv, /rep_range_min,rep_range_max,target_reps,target_rir/);
  assert.match(csv, /completed_rir,progression,next_weight_kg/);
  assert.match(csv, /"Upper, ""A"""/);
  assert.match(csv, /increase,52.5/);
  assert.equal(csv.split("\n").length, 2);
});

test("JSON backups round-trip and reject unsupported schema versions", () => {
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

test("version two state migrates prescriptions and removes fixed increments", () => {
  const migrated = loadCurrentState({
    schemaVersion: 2,
    exercises: [],
    templates: [
      {
        id: "template-1",
        name: "A",
        createdAt: 1,
        updatedAt: 1,
        exercises: [
          {
            id: "te-1",
            exerciseId: "squat",
            name: "Back Squat",
            restSeconds: 90,
            setCount: 1,
            repMin: 9,
            repMax: 12,
            targetRir: 2,
            targetWeight: 50,
            incrementKg: 2.5,
          },
        ],
      },
    ],
    workouts: [
      {
        ...workout({ exercises: [] }),
        exercises: [
          {
            id: "we-1",
            exerciseId: "squat",
            name: "Back Squat",
            restSeconds: 90,
            incrementKg: 2.5,
            sets: [
              {
                id: "set-1",
                prescribedRepMin: 9,
                prescribedRepMax: 12,
                prescribedRir: 2,
                prescribedWeight: 50,
                actualReps: 11,
                actualWeight: 50,
                actualRir: 2,
                completed: true,
                completedAt: 10,
              },
            ],
            progression: null,
            completed: true,
            completedAt: 60_000,
          },
        ],
      },
    ],
    preferences: state().preferences,
  });

  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.workouts[0]?.exercises[0]?.sets[0]?.prescribedReps, 11);
  assert.equal(migrated.workouts[0]?.exercises[0]?.prescription, null);
  assert.equal("incrementKg" in (migrated.templates[0]?.exercises[0] ?? {}), false);
  assert.equal("incrementKg" in (migrated.workouts[0]?.exercises[0] ?? {}), false);
});

test("version two JSON backups import through the migration", () => {
  const imported = parseAppStateBackup(
    JSON.stringify({
      app: "Workout Tracker",
      schemaVersion: 2,
      exercises: [],
      templates: [],
      workouts: [],
      preferences: state().preferences,
    }),
  );

  assert.equal(imported.schemaVersion, 3);
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

test("loading current state adds newer preferences", () => {
  const currentWithoutSoundPreference = {
    ...state(),
    preferences: { defaultRestSeconds: 120, installHintDismissed: false },
  };

  assert.deepEqual(loadCurrentState(currentWithoutSoundPreference).preferences, {
    defaultRestSeconds: 120,
    restTimerSoundEnabled: true,
    preventScreenLock: true,
    installHintDismissed: false,
  });
});

test("loading current state clamps targets and logged effort to the 2+ ceiling", () => {
  const loaded = loadCurrentState({
    ...state([
      workout({
        exercises: [
          exercise({
            sets: [
              set({
                prescribedRir: 5,
                actualRir: 4,
              }),
            ],
          }),
        ],
      }),
    ]),
    templates: [
      {
        id: "template-1",
        name: "A",
        createdAt: 1,
        updatedAt: 1,
        exercises: [
          {
            id: "te-1",
            exerciseId: "squat",
            name: "Back Squat",
            restSeconds: 90,
            setCount: 3,
            repMin: 8,
            repMax: 12,
            targetRir: 5,
            targetWeight: 50,
            incrementKg: 2.5,
          },
        ],
      },
    ],
  });

  assert.equal(loaded.templates[0]?.exercises[0]?.targetRir, 2);
  assert.equal(loaded.workouts[0]?.exercises[0]?.sets[0]?.prescribedRir, 2);
  assert.equal(loaded.workouts[0]?.exercises[0]?.sets[0]?.actualRir, 2);
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
