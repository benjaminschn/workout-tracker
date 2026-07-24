"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { loadAppState, saveAppState } from "@/lib/repository";
import {
  AppState,
  createId,
  createTemplateSet,
  createWorkoutExercise,
  createWorkoutSet,
  DIFFICULTIES,
  Difficulty,
  displayExerciseName,
  EMPTY_STATE,
  elapsedWorkoutMs,
  exerciseHistory,
  ExerciseHistoryPoint,
  exportCsv,
  exportJson,
  formatDuration,
  formatWeight,
  normalizeExerciseName,
  recentExerciseHistory,
  startCustomWorkout,
  startTemplateWorkout,
  SUGGESTED_EXERCISES,
  WorkoutExercise,
  WorkoutSession,
  WorkoutTemplate,
  workoutToTemplate,
} from "@/lib/workout";

type Tab = "home" | "templates" | "history" | "settings";
type ChartMetric = "weight" | "volume";

const tabItems: { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "●" },
  { id: "templates", label: "Templates", icon: "▤" },
  { id: "history", label: "History", icon: "↗" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

function cloneEmptyState(): AppState {
  return structuredClone(EMPTY_STATE);
}

function dateLabel(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(value);
}

function longDateLabel(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

function countCompletedSets(workout: WorkoutSession): number {
  return workout.exercises.reduce(
    (total, exercise) =>
      total + exercise.sets.filter((set) => set.completed).length,
    0,
  );
}

function difficultyLabel(difficulty: Difficulty | null): string {
  if (!difficulty) return "Not rated";
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}

export default function WorkoutApp() {
  const [state, setState] = useState<AppState>(cloneEmptyState);
  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [now, setNow] = useState(() => Date.now());
  const [storageError, setStorageError] = useState("");
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState("");
  const [completedWorkoutId, setCompletedWorkoutId] = useState<string | null>(
    null,
  );
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null,
  );
  const [historyExerciseId, setHistoryExerciseId] = useState("");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("weight");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousRestDeadline = useRef<number | null>(null);

  const activeWorkout = useMemo(
    () => state.workouts.find((workout) => workout.status === "active") ?? null,
    [state.workouts],
  );
  const completedWorkout = useMemo(
    () =>
      completedWorkoutId
        ? state.workouts.find((workout) => workout.id === completedWorkoutId) ??
          null
        : null,
    [completedWorkoutId, state.workouts],
  );

  useEffect(() => {
    let cancelled = false;
    loadAppState()
      .then((stored) => {
        if (!cancelled) {
          setState(stored);
          setHistoryExerciseId(stored.exercises[0]?.id ?? "");
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStorageError(
            "Your device storage could not be opened. Changes may not persist.",
          );
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveAppState(state)
        .then(() => setStorageError(""))
        .catch(() =>
          setStorageError(
            "We could not save that change. Keep this screen open and try again.",
          ),
        );
    }, 120);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [loaded, state]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator &&
      !["localhost", "127.0.0.1"].includes(window.location.hostname)
    ) {
      const register = () =>
        navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  useEffect(() => {
    const deadline = activeWorkout?.restDeadline ?? null;
    if (
      previousRestDeadline.current &&
      deadline &&
      previousRestDeadline.current === deadline &&
      deadline <= now
    ) {
      try {
        const AudioContextClass =
          window.AudioContext ||
          (
            window as typeof window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;
        if (AudioContextClass) {
          const audio = new AudioContextClass();
          const oscillator = audio.createOscillator();
          const gain = audio.createGain();
          oscillator.frequency.value = 720;
          gain.gain.setValueAtTime(0.05, audio.currentTime);
          gain.gain.exponentialRampToValueAtTime(
            0.001,
            audio.currentTime + 0.35,
          );
          oscillator.connect(gain);
          gain.connect(audio.destination);
          oscillator.start();
          oscillator.stop(audio.currentTime + 0.35);
        }
      } catch {
        // The visual timer state remains the authoritative fallback.
      }
    }
    previousRestDeadline.current = deadline;
  }, [activeWorkout?.restDeadline, now]);

  const updateActiveWorkout = useCallback(
    (
      updater: (workout: WorkoutSession) => WorkoutSession,
      syncTemplate = false,
    ) => {
      setState((current) => {
        const active = current.workouts.find(
          (workout) => workout.status === "active",
        );
        if (!active) return current;
        const updated = updater(active);
        let templates = current.templates;
        if (syncTemplate && updated.sourceTemplateId) {
          const existing = templates.find(
            (template) => template.id === updated.sourceTemplateId,
          );
          if (existing) {
            const synced = workoutToTemplate(updated, existing);
            templates = templates.map((template) =>
              template.id === synced.id ? synced : template,
            );
          }
        }
        return {
          ...current,
          templates,
          workouts: current.workouts.map((workout) =>
            workout.id === updated.id ? updated : workout,
          ),
        };
      });
    },
    [],
  );

  function startCustom() {
    if (activeWorkout) return;
    setCompletedWorkoutId(null);
    setState((current) => ({
      ...current,
      workouts: [...current.workouts, startCustomWorkout()],
    }));
    setOverviewOpen(false);
  }

  function startTemplate(template: WorkoutTemplate) {
    if (activeWorkout) return;
    setCompletedWorkoutId(null);
    setState((current) => ({
      ...current,
      workouts: [...current.workouts, startTemplateWorkout(template)],
    }));
    setOverviewOpen(false);
  }

  function findOrCreateExercise(name: string) {
    const displayName = displayExerciseName(name);
    const normalizedName = normalizeExerciseName(displayName);
    if (!normalizedName) return null;
    const existing = state.exercises.find(
      (exercise) => exercise.normalizedName === normalizedName,
    );
    if (existing) return existing;
    return {
      id: createId("exercise"),
      name: displayName,
      normalizedName,
      createdAt: Date.now(),
    };
  }

  function addExerciseToWorkout(event: FormEvent) {
    event.preventDefault();
    const exercise = findOrCreateExercise(newExerciseName);
    if (!exercise) return;
    setState((current) => {
      const known =
        current.exercises.find((item) => item.id === exercise.id) ?? exercise;
      const workouts = current.workouts.map((workout) => {
        if (workout.status !== "active") return workout;
        const updated = {
          ...workout,
          currentExerciseIndex: workout.exercises.length,
          exercises: [
            ...workout.exercises,
            createWorkoutExercise(
              known,
              current.preferences.defaultRestSeconds,
            ),
          ],
        };
        return updated;
      });
      const active = workouts.find((workout) => workout.status === "active");
      let templates = current.templates;
      if (active?.sourceTemplateId) {
        const existing = templates.find(
          (template) => template.id === active.sourceTemplateId,
        );
        if (existing) {
          const synced = workoutToTemplate(active, existing);
          templates = templates.map((template) =>
            template.id === synced.id ? synced : template,
          );
        }
      }
      return {
        ...current,
        exercises: current.exercises.some((item) => item.id === known.id)
          ? current.exercises
          : [...current.exercises, known],
        templates,
        workouts,
      };
    });
    setNewExerciseName("");
    setAddExerciseOpen(false);
    setOverviewOpen(false);
    if (!historyExerciseId) setHistoryExerciseId(exercise.id);
  }

  function updateCurrentExercise(
    updater: (exercise: WorkoutExercise) => WorkoutExercise,
  ) {
    updateActiveWorkout((workout) => ({
      ...workout,
      exercises: workout.exercises.map((exercise, index) =>
        index === workout.currentExerciseIndex ? updater(exercise) : exercise,
      ),
    }), true);
  }

  function updateSet(
    setId: string,
    field: "actualReps" | "actualWeight",
    value: number | null,
  ) {
    updateCurrentExercise((exercise) => ({
      ...exercise,
      completed: false,
      difficulty: null,
      completedAt: null,
      sets: exercise.sets.map((set) =>
        set.id === setId
          ? {
              ...set,
              [field]: value,
              ...(field === "actualReps" ? { targetReps: value ?? 0 } : {}),
              ...(field === "actualWeight" ? { targetWeight: value } : {}),
            }
          : set,
      ),
    }));
  }

  function toggleSet(setId: string) {
    const completedAt = Date.now();
    updateActiveWorkout((workout) => {
      const exercise = workout.exercises[workout.currentExerciseIndex];
      if (!exercise) return workout;
      const targetSet = exercise.sets.find((set) => set.id === setId);
      const willComplete = !targetSet?.completed;
      return {
        ...workout,
        restDeadline: willComplete
          ? completedAt + exercise.restSeconds * 1000
          : workout.restDeadline,
        exercises: workout.exercises.map((item, index) =>
          index === workout.currentExerciseIndex
            ? {
                ...item,
                completed: false,
                difficulty: null,
                completedAt: null,
                sets: item.sets.map((set) =>
                  set.id === setId
                    ? {
                        ...set,
                        completed: !set.completed,
                        completedAt: !set.completed ? completedAt : null,
                      }
                    : set,
                ),
              }
            : item,
        ),
      };
    }, true);
  }

  function rateExercise(difficulty: Difficulty) {
    if (!activeWorkout) return;
    const exercise =
      activeWorkout.exercises[activeWorkout.currentExerciseIndex];
    if (!exercise || !exercise.sets.some((set) => set.completed)) return;
    const completedAt = Date.now();
    updateActiveWorkout((workout) => {
      const nextIncomplete = workout.exercises.findIndex(
        (item, index) =>
          index > workout.currentExerciseIndex && !item.completed,
      );
      return {
        ...workout,
        currentExerciseIndex:
          nextIncomplete >= 0
            ? nextIncomplete
            : workout.currentExerciseIndex,
        exercises: workout.exercises.map((item, index) =>
          index === workout.currentExerciseIndex
            ? {
                ...item,
                difficulty,
                completed: true,
                completedAt,
              }
            : item,
        ),
      };
    });
  }

  function finishWorkout() {
    if (!activeWorkout) return;
    const unrated = activeWorkout.exercises.find(
      (exercise) =>
        exercise.sets.some((set) => set.completed) && !exercise.difficulty,
    );
    if (unrated) {
      window.alert(`Rate ${unrated.name} before finishing your workout.`);
      return;
    }
    if (countCompletedSets(activeWorkout) === 0) {
      window.alert("Complete at least one set before finishing.");
      return;
    }
    const endedAt = Date.now();
    setState((current) => ({
      ...current,
      workouts: current.workouts.map((workout) =>
        workout.id === activeWorkout.id
          ? {
              ...workout,
              status: "completed",
              endedAt,
              pausedAt: null,
              restDeadline: null,
            }
          : workout,
      ),
    }));
    setCompletedWorkoutId(activeWorkout.id);
    setOverviewOpen(false);
  }

  function discardWorkout() {
    if (!activeWorkout) return;
    if (
      !window.confirm(
        "Discard this workout? Its completed sets will not appear in history.",
      )
    ) {
      return;
    }
    setState((current) => ({
      ...current,
      workouts: current.workouts.map((workout) =>
        workout.id === activeWorkout.id
          ? {
              ...workout,
              status: "discarded",
              endedAt: Date.now(),
              restDeadline: null,
            }
          : workout,
      ),
    }));
    setOverviewOpen(false);
    setActiveTab("home");
  }

  function saveCompletedAsTemplate() {
    if (!completedWorkout || completedWorkout.sourceTemplateId) return;
    const template = workoutToTemplate(completedWorkout);
    setState((current) => ({
      ...current,
      templates: [...current.templates, template],
    }));
    setCompletedWorkoutId(null);
    setActiveTab("templates");
  }

  function createTemplate() {
    const nowValue = Date.now();
    const template: WorkoutTemplate = {
      id: createId("template"),
      name: "New template",
      createdAt: nowValue,
      updatedAt: nowValue,
      exercises: [],
    };
    setState((current) => ({
      ...current,
      templates: [...current.templates, template],
    }));
    setEditingTemplateId(template.id);
  }

  function updateTemplate(
    templateId: string,
    updater: (template: WorkoutTemplate) => WorkoutTemplate,
  ) {
    setState((current) => ({
      ...current,
      templates: current.templates.map((template) =>
        template.id === templateId
          ? { ...updater(template), updatedAt: Date.now() }
          : template,
      ),
    }));
  }

  function addExerciseToTemplate(
    event: FormEvent,
    templateId: string,
    name: string,
    onDone: () => void,
  ) {
    event.preventDefault();
    const exercise = findOrCreateExercise(name);
    if (!exercise) return;
    setState((current) => ({
      ...current,
      exercises: current.exercises.some((item) => item.id === exercise.id)
        ? current.exercises
        : [...current.exercises, exercise],
      templates: current.templates.map((template) =>
        template.id === templateId
          ? {
              ...template,
              updatedAt: Date.now(),
              exercises: [
                ...template.exercises,
                {
                  id: createId("template-exercise"),
                  exerciseId: exercise.id,
                  name: exercise.name,
                  restSeconds: current.preferences.defaultRestSeconds,
                  sets: [createTemplateSet()],
                },
              ],
            }
          : template,
      ),
    }));
    onDone();
    if (!historyExerciseId) setHistoryExerciseId(exercise.id);
  }

  function deleteTemplate(templateId: string) {
    if (!window.confirm("Delete this template? Workout history is unaffected."))
      return;
    setState((current) => ({
      ...current,
      templates: current.templates.filter(
        (template) => template.id !== templateId,
      ),
    }));
    setEditingTemplateId(null);
  }

  function downloadFile(filename: string, type: string, contents: string) {
    const file = new File([contents], filename, { type });
    const shareNavigator = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
    };
    if (
      navigator.share &&
      shareNavigator.canShare?.({ files: [file] }) &&
      window.matchMedia("(display-mode: standalone)").matches
    ) {
      navigator.share({ files: [file], title: filename }).catch(() => undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!loaded) {
    return (
      <main className="loading-screen" aria-live="polite">
        <div className="brand-mark" aria-hidden="true">
          W
        </div>
        <p>Loading your workouts…</p>
      </main>
    );
  }

  if (activeWorkout) {
    return (
      <ActiveWorkoutView
        workout={activeWorkout}
        state={state}
        now={now}
        storageError={storageError}
        overviewOpen={overviewOpen}
        addExerciseOpen={addExerciseOpen}
        newExerciseName={newExerciseName}
        onExerciseNameChange={setNewExerciseName}
        onOpenOverview={() => setOverviewOpen(true)}
        onCloseOverview={() => setOverviewOpen(false)}
        onOpenAddExercise={() => setAddExerciseOpen(true)}
        onCloseAddExercise={() => setAddExerciseOpen(false)}
        onAddExercise={addExerciseToWorkout}
        onSelectExercise={(index) => {
          updateActiveWorkout((workout) => ({
            ...workout,
            currentExerciseIndex: index,
          }));
          setOverviewOpen(false);
        }}
        onRenameWorkout={(name) =>
          updateActiveWorkout((workout) => ({ ...workout, name }), true)
        }
        onPause={() =>
          updateActiveWorkout((workout) =>
            workout.pausedAt
              ? {
                  ...workout,
                  pausedTotalMs:
                    workout.pausedTotalMs + (Date.now() - workout.pausedAt),
                  pausedAt: null,
                }
              : { ...workout, pausedAt: Date.now() },
          )
        }
        onUpdateExercise={updateCurrentExercise}
        onUpdateSet={updateSet}
        onToggleSet={toggleSet}
        onRateExercise={rateExercise}
        onRestChange={(deadline) =>
          updateActiveWorkout((workout) => ({
            ...workout,
            restDeadline: deadline,
          }))
        }
        onMoveExercise={(from, direction) =>
          updateActiveWorkout((workout) => {
            const to = from + direction;
            if (to < 0 || to >= workout.exercises.length) return workout;
            const exercises = [...workout.exercises];
            [exercises[from], exercises[to]] = [
              exercises[to],
              exercises[from],
            ];
            return {
              ...workout,
              exercises,
              currentExerciseIndex:
                workout.currentExerciseIndex === from
                  ? to
                  : workout.currentExerciseIndex === to
                    ? from
                    : workout.currentExerciseIndex,
            };
          }, true)
        }
        onRemoveExercise={(index) =>
          updateActiveWorkout((workout) => {
            const exercises = workout.exercises.filter((_, i) => i !== index);
            return {
              ...workout,
              exercises,
              currentExerciseIndex: Math.max(
                0,
                Math.min(workout.currentExerciseIndex, exercises.length - 1),
              ),
            };
          }, true)
        }
        onFinish={finishWorkout}
        onDiscard={discardWorkout}
      />
    );
  }

  return (
    <div className="app-shell">
      {storageError && (
        <div className="error-banner" role="alert">
          {storageError}
        </div>
      )}
      <header className="app-header">
        <div>
          <span className="eyebrow">Workout Tracker</span>
          <h1>
            {activeTab === "home" && "Ready when you are."}
            {activeTab === "templates" && "Your routines."}
            {activeTab === "history" && "Progress, clearly."}
            {activeTab === "settings" && "Your app."}
          </h1>
        </div>
        <div className="brand-mark small" aria-hidden="true">
          W
        </div>
      </header>

      <main className="main-content">
        {activeTab === "home" && (
          <HomeView
            state={state}
            now={now}
            onStartCustom={startCustom}
            onShowTemplates={() => setActiveTab("templates")}
            onShowHistory={() => setActiveTab("history")}
          />
        )}
        {activeTab === "templates" && (
          <TemplatesView
            state={state}
            editingId={editingTemplateId}
            onEdit={setEditingTemplateId}
            onCreate={createTemplate}
            onStart={startTemplate}
            onUpdate={updateTemplate}
            onDelete={deleteTemplate}
            onAddExercise={addExerciseToTemplate}
          />
        )}
        {activeTab === "history" && (
          <HistoryView
            state={state}
            exerciseId={historyExerciseId}
            chartMetric={chartMetric}
            onExerciseChange={setHistoryExerciseId}
            onChartMetricChange={setChartMetric}
          />
        )}
        {activeTab === "settings" && (
          <SettingsView
            state={state}
            onRestChange={(seconds) =>
              setState((current) => ({
                ...current,
                preferences: {
                  ...current.preferences,
                  defaultRestSeconds: seconds,
                },
              }))
            }
            onExportJson={() =>
              downloadFile(
                `workout-tracker-${new Date().toISOString().slice(0, 10)}.json`,
                "application/json",
                exportJson(state),
              )
            }
            onExportCsv={() =>
              downloadFile(
                `workout-history-${new Date().toISOString().slice(0, 10)}.csv`,
                "text/csv",
                exportCsv(state),
              )
            }
          />
        )}
      </main>

      <nav className="tab-bar" aria-label="Primary navigation">
        {tabItems.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => {
              setActiveTab(tab.id);
              setCompletedWorkoutId(null);
              setEditingTemplateId(null);
            }}
            aria-current={activeTab === tab.id ? "page" : undefined}
          >
            <span className="tab-icon" aria-hidden="true">
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {completedWorkout && (
        <div className="modal-backdrop">
          <section className="completion-card" role="dialog" aria-modal="true">
            <span className="success-ring" aria-hidden="true">
              ✓
            </span>
            <span className="eyebrow">Workout complete</span>
            <h2>Strong work.</h2>
            <div className="completion-stats">
              <div>
                <strong>{formatDuration(elapsedWorkoutMs(completedWorkout))}</strong>
                <span>Duration</span>
              </div>
              <div>
                <strong>{countCompletedSets(completedWorkout)}</strong>
                <span>Sets</span>
              </div>
              <div>
                <strong>
                  {
                    completedWorkout.exercises.filter(
                      (exercise) => exercise.completed,
                    ).length
                  }
                </strong>
                <span>Exercises</span>
              </div>
            </div>
            {!completedWorkout.sourceTemplateId && (
              <button className="primary-button" onClick={saveCompletedAsTemplate}>
                Save as template
              </button>
            )}
            <button
              className="text-button"
              onClick={() => setCompletedWorkoutId(null)}
            >
              Done
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

function HomeView({
  state,
  now,
  onStartCustom,
  onShowTemplates,
  onShowHistory,
}: {
  state: AppState;
  now: number;
  onStartCustom: () => void;
  onShowTemplates: () => void;
  onShowHistory: () => void;
}) {
  const latest = [...state.workouts]
    .filter((workout) => workout.status === "completed")
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0];
  const thisWeek = state.workouts.filter((workout) => {
    const date = workout.endedAt ?? 0;
    return (
      workout.status === "completed" &&
      date >= now - 7 * 24 * 60 * 60 * 1000
    );
  }).length;

  return (
    <div className="page-stack">
      <section className="start-panel">
        <div className="start-visual" aria-hidden="true">
          <span className="pulse-dot" />
          <div className="start-lines">
            <i />
            <i />
            <i />
          </div>
        </div>
        <div>
          <span className="eyebrow">Start a workout</span>
          <h2>Make today count.</h2>
          <p>Build as you go, or follow a routine you already know.</p>
        </div>
        <div className="button-row">
          <button className="primary-button" onClick={onStartCustom}>
            Start custom
          </button>
          <button className="secondary-button" onClick={onShowTemplates}>
            From template
          </button>
        </div>
      </section>

      <div className="metric-grid">
        <article className="metric-card">
          <span>This week</span>
          <strong>{thisWeek}</strong>
          <small>{thisWeek === 1 ? "workout" : "workouts"}</small>
        </article>
        <article className="metric-card accent">
          <span>Templates</span>
          <strong>{state.templates.length}</strong>
          <small>ready to go</small>
        </article>
      </div>

      <section className="section-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Latest session</span>
            <h2>{latest ? latest.name : "Your first session"}</h2>
          </div>
          {latest && (
            <button className="text-button" onClick={onShowHistory}>
              View history
            </button>
          )}
        </div>
        {latest ? (
          <div className="latest-workout">
            <div className="date-tile">
              <strong>{new Date(latest.endedAt ?? latest.startedAt).getDate()}</strong>
              <span>
                {new Intl.DateTimeFormat(undefined, { month: "short" }).format(
                  latest.endedAt ?? latest.startedAt,
                )}
              </span>
            </div>
            <div>
              <strong>
                {latest.exercises.filter((exercise) => exercise.completed).length}{" "}
                exercises · {countCompletedSets(latest)} sets
              </strong>
              <span>{formatDuration(elapsedWorkoutMs(latest))}</span>
            </div>
          </div>
        ) : (
          <div className="empty-inline">
            <p>Your completed workouts and progress will appear here.</p>
            <button className="text-button" onClick={onStartCustom}>
              Start now
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function TemplatesView({
  state,
  editingId,
  onEdit,
  onCreate,
  onStart,
  onUpdate,
  onDelete,
  onAddExercise,
}: {
  state: AppState;
  editingId: string | null;
  onEdit: (id: string | null) => void;
  onCreate: () => void;
  onStart: (template: WorkoutTemplate) => void;
  onUpdate: (
    id: string,
    updater: (template: WorkoutTemplate) => WorkoutTemplate,
  ) => void;
  onDelete: (id: string) => void;
  onAddExercise: (
    event: FormEvent,
    templateId: string,
    name: string,
    onDone: () => void,
  ) => void;
}) {
  const template = state.templates.find((item) => item.id === editingId);
  const [exerciseName, setExerciseName] = useState("");

  if (template) {
    return (
      <div className="page-stack">
        <button className="back-button" onClick={() => onEdit(null)}>
          ← All templates
        </button>
        <section className="section-card template-editor">
          <label className="field-label">
            Template name
            <input
              value={template.name}
              onChange={(event) =>
                onUpdate(template.id, (current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </label>
          <div className="editor-list">
            {template.exercises.map((exercise, exerciseIndex) => (
              <article className="editor-exercise" key={exercise.id}>
                <div className="editor-exercise-heading">
                  <div>
                    <span className="order-number">{exerciseIndex + 1}</span>
                    <strong>{exercise.name}</strong>
                  </div>
                  <button
                    className="icon-button danger-text"
                    aria-label={`Remove ${exercise.name}`}
                    onClick={() =>
                      onUpdate(template.id, (current) => ({
                        ...current,
                        exercises: current.exercises.filter(
                          (item) => item.id !== exercise.id,
                        ),
                      }))
                    }
                  >
                    ×
                  </button>
                </div>
                {exercise.sets.map((set, setIndex) => (
                  <div className="compact-set-row" key={set.id}>
                    <span>Set {setIndex + 1}</span>
                    <label>
                      <span>Reps</span>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={set.targetReps}
                        onChange={(event) =>
                          onUpdate(template.id, (current) => ({
                            ...current,
                            exercises: current.exercises.map((item) =>
                              item.id === exercise.id
                                ? {
                                    ...item,
                                    sets: item.sets.map((itemSet) =>
                                      itemSet.id === set.id
                                        ? {
                                            ...itemSet,
                                            targetReps: Number(
                                              event.target.value,
                                            ),
                                          }
                                        : itemSet,
                                    ),
                                  }
                                : item,
                            ),
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>kg</span>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        inputMode="decimal"
                        placeholder="—"
                        value={set.targetWeight ?? ""}
                        onChange={(event) =>
                          onUpdate(template.id, (current) => ({
                            ...current,
                            exercises: current.exercises.map((item) =>
                              item.id === exercise.id
                                ? {
                                    ...item,
                                    sets: item.sets.map((itemSet) =>
                                      itemSet.id === set.id
                                        ? {
                                            ...itemSet,
                                            targetWeight:
                                              event.target.value === ""
                                                ? null
                                                : Number(event.target.value),
                                          }
                                        : itemSet,
                                    ),
                                  }
                                : item,
                            ),
                          }))
                        }
                      />
                    </label>
                    <button
                      className="mini-button"
                      aria-label={`Remove set ${setIndex + 1}`}
                      onClick={() =>
                        onUpdate(template.id, (current) => ({
                          ...current,
                          exercises: current.exercises.map((item) =>
                            item.id === exercise.id
                              ? {
                                  ...item,
                                  sets: item.sets.filter(
                                    (itemSet) => itemSet.id !== set.id,
                                  ),
                                }
                              : item,
                          ),
                        }))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="editor-actions">
                  <button
                    className="text-button"
                    onClick={() =>
                      onUpdate(template.id, (current) => ({
                        ...current,
                        exercises: current.exercises.map((item) =>
                          item.id === exercise.id
                            ? {
                                ...item,
                                sets: [...item.sets, createTemplateSet()],
                              }
                            : item,
                        ),
                      }))
                    }
                  >
                    + Add set
                  </button>
                  <label className="rest-field">
                    Rest
                    <select
                      value={exercise.restSeconds}
                      onChange={(event) =>
                        onUpdate(template.id, (current) => ({
                          ...current,
                          exercises: current.exercises.map((item) =>
                            item.id === exercise.id
                              ? {
                                  ...item,
                                  restSeconds: Number(event.target.value),
                                }
                              : item,
                          ),
                        }))
                      }
                    >
                      {[30, 60, 90, 120, 180].map((seconds) => (
                        <option value={seconds} key={seconds}>
                          {seconds}s
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </article>
            ))}
          </div>
          <form
            className="add-exercise-form"
            onSubmit={(event) =>
              onAddExercise(event, template.id, exerciseName, () =>
                setExerciseName(""),
              )
            }
          >
            <label className="field-label">
              Add exercise
              <input
                list="exercise-catalog"
                value={exerciseName}
                onChange={(event) => setExerciseName(event.target.value)}
                placeholder="e.g. Back Squat"
              />
            </label>
            <button className="secondary-button" type="submit">
              Add
            </button>
          </form>
          <div className="editor-footer">
            <button
              className="danger-button"
              onClick={() => onDelete(template.id)}
            >
              Delete template
            </button>
            <button className="primary-button" onClick={() => onStart(template)}>
              Start workout
            </button>
          </div>
        </section>
        <ExerciseDatalist state={state} />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="section-intro">
        <p>Saved routines keep the plan simple when it’s time to train.</p>
        <button className="primary-button compact" onClick={onCreate}>
          + New template
        </button>
      </section>
      {state.templates.length ? (
        <div className="template-grid">
          {state.templates.map((item, index) => (
            <article className="template-card" key={item.id}>
              <span className="template-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <span className="eyebrow">
                  {item.exercises.length} exercises
                </span>
                <h2>{item.name || "Untitled template"}</h2>
                <p>
                  {item.exercises.length
                    ? item.exercises
                        .slice(0, 3)
                        .map((exercise) => exercise.name)
                        .join(" · ")
                    : "Add your first exercise"}
                </p>
              </div>
              <div className="button-row">
                <button
                  className="primary-button"
                  disabled={!item.exercises.length}
                  onClick={() => onStart(item)}
                >
                  Start
                </button>
                <button
                  className="secondary-button"
                  onClick={() => onEdit(item.id)}
                >
                  Edit
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="empty-state">
          <div className="empty-icon" aria-hidden="true">
            ▤
          </div>
          <h2>No templates yet</h2>
          <p>Create a routine once, then let the app guide you through it.</p>
          <button className="primary-button compact" onClick={onCreate}>
            Create your first template
          </button>
        </section>
      )}
    </div>
  );
}

function ActiveWorkoutView({
  workout,
  state,
  now,
  storageError,
  overviewOpen,
  addExerciseOpen,
  newExerciseName,
  onExerciseNameChange,
  onOpenOverview,
  onCloseOverview,
  onOpenAddExercise,
  onCloseAddExercise,
  onAddExercise,
  onSelectExercise,
  onRenameWorkout,
  onPause,
  onUpdateExercise,
  onUpdateSet,
  onToggleSet,
  onRateExercise,
  onRestChange,
  onMoveExercise,
  onRemoveExercise,
  onFinish,
  onDiscard,
}: {
  workout: WorkoutSession;
  state: AppState;
  now: number;
  storageError: string;
  overviewOpen: boolean;
  addExerciseOpen: boolean;
  newExerciseName: string;
  onExerciseNameChange: (value: string) => void;
  onOpenOverview: () => void;
  onCloseOverview: () => void;
  onOpenAddExercise: () => void;
  onCloseAddExercise: () => void;
  onAddExercise: (event: FormEvent) => void;
  onSelectExercise: (index: number) => void;
  onRenameWorkout: (name: string) => void;
  onPause: () => void;
  onUpdateExercise: (
    updater: (exercise: WorkoutExercise) => WorkoutExercise,
  ) => void;
  onUpdateSet: (
    setId: string,
    field: "actualReps" | "actualWeight",
    value: number | null,
  ) => void;
  onToggleSet: (id: string) => void;
  onRateExercise: (difficulty: Difficulty) => void;
  onRestChange: (deadline: number | null) => void;
  onMoveExercise: (index: number, direction: -1 | 1) => void;
  onRemoveExercise: (index: number) => void;
  onFinish: () => void;
  onDiscard: () => void;
}) {
  const current = workout.exercises[workout.currentExerciseIndex];
  const history = current
    ? recentExerciseHistory(state, current.exerciseId)
    : [];
  const restRemaining = workout.restDeadline
    ? Math.max(0, Math.ceil((workout.restDeadline - now) / 1000))
    : 0;

  return (
    <div className="workout-screen">
      {storageError && (
        <div className="error-banner" role="alert">
          {storageError}
        </div>
      )}
      <header className="workout-header">
        <button className="overview-button" onClick={onOpenOverview}>
          <span aria-hidden="true">☰</span>
          Overview
        </button>
        <div className="timer-display">
          <span>{workout.pausedAt ? "Paused" : "Workout time"}</span>
          <strong>{formatDuration(elapsedWorkoutMs(workout, now))}</strong>
        </div>
        <button className="pause-button" onClick={onPause}>
          {workout.pausedAt ? "Resume" : "Pause"}
        </button>
      </header>

      <main className="workout-content">
        {workout.pausedAt && (
          <div className="paused-banner">
            Workout paused. Your progress is saved.
          </div>
        )}
        {!current ? (
          <section className="empty-workout">
            <span className="empty-icon" aria-hidden="true">
              +
            </span>
            <span className="eyebrow">Custom workout</span>
            <h1>Add your first exercise.</h1>
            <p>Choose a familiar movement or create one as you go.</p>
            <button className="primary-button compact" onClick={onOpenAddExercise}>
              Add exercise
            </button>
          </section>
        ) : (
          <>
            <section className="exercise-hero">
              <div>
                <span className="eyebrow">
                  Exercise {workout.currentExerciseIndex + 1} of{" "}
                  {workout.exercises.length}
                </span>
                <h1>{current.name}</h1>
                <p>
                  {current.sets.filter((set) => set.completed).length} of{" "}
                  {current.sets.length} sets complete
                </p>
              </div>
              <span
                className={`status-pill ${current.completed ? "complete" : ""}`}
              >
                {current.completed ? "Rated" : "In progress"}
              </span>
            </section>

            {history.length > 0 && (
              <section className="history-hint">
                <div className="history-hint-heading">
                  <span className="eyebrow">Last two times</span>
                  <span aria-hidden="true">↗</span>
                </div>
                <div className="history-hint-grid">
                  {history.map((item) => (
                    <div key={item.workoutId}>
                      <span>{dateLabel(item.date)}</span>
                      <strong>{item.setSummary}</strong>
                      <small className={`difficulty ${item.difficulty ?? ""}`}>
                        {difficultyLabel(item.difficulty)}
                      </small>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {restRemaining > 0 && (
              <section className="rest-timer" aria-live="polite">
                <div className="rest-clock">
                  <span>Rest</span>
                  <strong>{formatDuration(restRemaining * 1000)}</strong>
                </div>
                <div className="rest-progress">
                  <i
                    style={{
                      width: `${Math.min(
                        100,
                        (restRemaining / current.restSeconds) * 100,
                      )}%`,
                    }}
                  />
                </div>
                <div className="rest-actions">
                  <button
                    onClick={() =>
                      onRestChange((workout.restDeadline ?? now) + 30000)
                    }
                  >
                    +30s
                  </button>
                  <button onClick={() => onRestChange(null)}>Skip rest</button>
                </div>
              </section>
            )}

            <section className="sets-card">
              <div className="sets-header">
                <span>Set</span>
                <span>Reps</span>
                <span>kg</span>
                <span>Done</span>
              </div>
              {current.sets.map((set, index) => (
                <div
                  className={`set-row ${set.completed ? "completed" : ""}`}
                  key={set.id}
                >
                  <span className="set-number">{index + 1}</span>
                  <label>
                    <span className="sr-only">Reps for set {index + 1}</span>
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={set.actualReps}
                      onChange={(event) =>
                        onUpdateSet(
                          set.id,
                          "actualReps",
                          Math.max(0, Number(event.target.value)),
                        )
                      }
                    />
                  </label>
                  <label>
                    <span className="sr-only">Weight for set {index + 1}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      inputMode="decimal"
                      placeholder="—"
                      value={set.actualWeight ?? ""}
                      onChange={(event) =>
                        onUpdateSet(
                          set.id,
                          "actualWeight",
                          event.target.value === ""
                            ? null
                            : Math.max(0, Number(event.target.value)),
                        )
                      }
                    />
                  </label>
                  <button
                    className="set-check"
                    aria-label={`${set.completed ? "Undo" : "Complete"} set ${
                      index + 1
                    }`}
                    aria-pressed={set.completed}
                    onClick={() => onToggleSet(set.id)}
                  >
                    {set.completed ? "✓" : ""}
                  </button>
                </div>
              ))}
              <div className="sets-footer">
                <button
                  className="text-button"
                  onClick={() =>
                    onUpdateExercise((exercise) => ({
                      ...exercise,
                      sets: [...exercise.sets, createWorkoutSet()],
                      completed: false,
                      difficulty: null,
                    }))
                  }
                >
                  + Add set
                </button>
                <label className="rest-field">
                  Rest
                  <select
                    value={current.restSeconds}
                    onChange={(event) =>
                      onUpdateExercise((exercise) => ({
                        ...exercise,
                        restSeconds: Number(event.target.value),
                      }))
                    }
                  >
                    {[30, 60, 90, 120, 180].map((seconds) => (
                      <option value={seconds} key={seconds}>
                        {seconds}s
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className="rating-card">
              <div>
                <span className="eyebrow">Complete exercise</span>
                <h2>How did it feel?</h2>
                <p>Complete at least one set, then choose a rating.</p>
              </div>
              <div className="rating-grid">
                {DIFFICULTIES.map((difficulty) => (
                  <button
                    key={difficulty}
                    className={`${difficulty} ${
                      current.difficulty === difficulty ? "selected" : ""
                    }`}
                    disabled={!current.sets.some((set) => set.completed)}
                    onClick={() => onRateExercise(difficulty)}
                  >
                    <span aria-hidden="true">
                      {difficulty === "easy" && "○"}
                      {difficulty === "medium" && "◐"}
                      {difficulty === "hard" && "●"}
                      {difficulty === "failed" && "×"}
                    </span>
                    {difficultyLabel(difficulty)}
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      {current && (
        <footer className="workout-footer">
          <button className="secondary-button" onClick={onOpenOverview}>
            {workout.exercises.filter((exercise) => exercise.completed).length}/
            {workout.exercises.length} complete
          </button>
          <button className="primary-button" onClick={onFinish}>
            Finish workout
          </button>
        </footer>
      )}

      {overviewOpen && (
        <div className="modal-backdrop sheet-backdrop">
          <section className="bottom-sheet" role="dialog" aria-modal="true">
            <div className="sheet-grabber" />
            <div className="sheet-heading">
              <label>
                <span className="eyebrow">Workout overview</span>
                <input
                  className="workout-name-input"
                  value={workout.name}
                  onChange={(event) => onRenameWorkout(event.target.value)}
                  aria-label="Workout name"
                />
              </label>
              <button
                className="icon-button"
                onClick={onCloseOverview}
                aria-label="Close overview"
              >
                ×
              </button>
            </div>
            <div className="overview-list">
              {workout.exercises.map((exercise, index) => (
                <article
                  className={`overview-item ${
                    workout.currentExerciseIndex === index ? "current" : ""
                  }`}
                  key={exercise.id}
                >
                  <button
                    className="overview-select"
                    onClick={() => onSelectExercise(index)}
                  >
                    <span
                      className={`overview-status ${
                        exercise.completed ? "complete" : ""
                      }`}
                    >
                      {exercise.completed ? "✓" : index + 1}
                    </span>
                    <span>
                      <strong>{exercise.name}</strong>
                      <small>
                        {exercise.sets.filter((set) => set.completed).length}/
                        {exercise.sets.length} sets
                        {exercise.difficulty
                          ? ` · ${difficultyLabel(exercise.difficulty)}`
                          : ""}
                      </small>
                    </span>
                  </button>
                  <div className="reorder-actions">
                    <button
                      aria-label={`Move ${exercise.name} up`}
                      disabled={index === 0}
                      onClick={() => onMoveExercise(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Move ${exercise.name} down`}
                      disabled={index === workout.exercises.length - 1}
                      onClick={() => onMoveExercise(index, 1)}
                    >
                      ↓
                    </button>
                    <button
                      className="danger-text"
                      aria-label={`Remove ${exercise.name}`}
                      onClick={() => onRemoveExercise(index)}
                    >
                      ×
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <button className="secondary-button full" onClick={onOpenAddExercise}>
              + Add exercise
            </button>
            <div className="sheet-footer">
              <button className="danger-button" onClick={onDiscard}>
                Discard
              </button>
              <button className="primary-button" onClick={onFinish}>
                Finish workout
              </button>
            </div>
          </section>
        </div>
      )}

      {addExerciseOpen && (
        <div className="modal-backdrop">
          <section className="add-modal" role="dialog" aria-modal="true">
            <div className="sheet-heading">
              <div>
                <span className="eyebrow">Exercise catalog</span>
                <h2>Add an exercise</h2>
              </div>
              <button
                className="icon-button"
                onClick={onCloseAddExercise}
                aria-label="Close exercise picker"
              >
                ×
              </button>
            </div>
            <form onSubmit={onAddExercise}>
              <label className="field-label">
                Exercise name
                <input
                  autoFocus
                  list="exercise-catalog"
                  value={newExerciseName}
                  onChange={(event) =>
                    onExerciseNameChange(event.target.value)
                  }
                  placeholder="e.g. Bench Press"
                />
              </label>
              <button className="primary-button full" type="submit">
                Add to workout
              </button>
            </form>
            <div className="suggestion-chips">
              {SUGGESTED_EXERCISES.slice(0, 6).map((name) => (
                <button
                  key={name}
                  onClick={() => onExerciseNameChange(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </section>
          <ExerciseDatalist state={state} />
        </div>
      )}
    </div>
  );
}

function HistoryView({
  state,
  exerciseId,
  chartMetric,
  onExerciseChange,
  onChartMetricChange,
}: {
  state: AppState;
  exerciseId: string;
  chartMetric: ChartMetric;
  onExerciseChange: (id: string) => void;
  onChartMetricChange: (metric: ChartMetric) => void;
}) {
  const history = exerciseId ? exerciseHistory(state, exerciseId) : [];
  const exercise = state.exercises.find((item) => item.id === exerciseId);
  const maximum = Math.max(
    1,
    ...history.map((item) =>
      chartMetric === "weight" ? item.bestWeight : item.volume,
    ),
  );

  if (!state.exercises.length) {
    return (
      <section className="empty-state">
        <div className="empty-icon" aria-hidden="true">
          ↗
        </div>
        <h2>No exercise history yet</h2>
        <p>Complete a workout to unlock progress charts and session details.</p>
      </section>
    );
  }

  return (
    <div className="page-stack">
      <section className="history-controls">
        <label className="field-label">
          Exercise
          <select
            value={exerciseId}
            onChange={(event) => onExerciseChange(event.target.value)}
          >
            {state.exercises.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="segmented-control" aria-label="Chart metric">
          <button
            className={chartMetric === "weight" ? "active" : ""}
            onClick={() => onChartMetricChange("weight")}
          >
            Best weight
          </button>
          <button
            className={chartMetric === "volume" ? "active" : ""}
            onClick={() => onChartMetricChange("volume")}
          >
            Volume
          </button>
        </div>
      </section>

      {history.length ? (
        <>
          <section className="chart-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">
                  {chartMetric === "weight" ? "Best working weight" : "Total volume"}
                </span>
                <h2>{exercise?.name}</h2>
              </div>
              <div className="chart-latest">
                <strong>
                  {chartMetric === "weight"
                    ? formatWeight(history.at(-1)?.bestWeight ?? 0)
                    : `${Math.round(history.at(-1)?.volume ?? 0)} kg`}
                </strong>
                <span>latest</span>
              </div>
            </div>
            <div className="bar-chart" aria-label={`${exercise?.name} chart`}>
              {history.slice(-8).map((item) => {
                const value =
                  chartMetric === "weight" ? item.bestWeight : item.volume;
                return (
                  <div className="bar-column" key={item.workoutId}>
                    <span className="bar-value">
                      {value ? Math.round(value) : item.totalReps}
                    </span>
                    <div className="bar-track">
                      <i
                        style={{
                          height: `${Math.max(8, (value / maximum) * 100)}%`,
                        }}
                      />
                    </div>
                    <span>{dateLabel(item.date)}</span>
                  </div>
                );
              })}
            </div>
            {history.every((item) => item.bestWeight === 0) && (
              <p className="chart-note">
                No weight recorded yet. Bar labels show completed reps.
              </p>
            )}
          </section>

          <section className="section-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Session log</span>
                <h2>{history.length} recorded</h2>
              </div>
            </div>
            <div className="session-list">
              {[...history].reverse().map((item) => (
                <HistoryRow item={item} key={item.workoutId} />
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="empty-state small">
          <h2>No completed sets for {exercise?.name}</h2>
          <p>This exercise will appear here after a completed workout.</p>
        </section>
      )}
    </div>
  );
}

function HistoryRow({ item }: { item: ExerciseHistoryPoint }) {
  return (
    <article className="session-row">
      <div className="session-date">
        <strong>{new Date(item.date).getDate()}</strong>
        <span>
          {new Intl.DateTimeFormat(undefined, { month: "short" }).format(
            item.date,
          )}
        </span>
      </div>
      <div className="session-copy">
        <strong>{item.setSummary}</strong>
        <span>
          {item.workoutName} · {longDateLabel(item.date)}
        </span>
      </div>
      <span className={`difficulty-badge ${item.difficulty ?? ""}`}>
        {difficultyLabel(item.difficulty)}
      </span>
    </article>
  );
}

function SettingsView({
  state,
  onRestChange,
  onExportJson,
  onExportCsv,
}: {
  state: AppState;
  onRestChange: (seconds: number) => void;
  onExportJson: () => void;
  onExportCsv: () => void;
}) {
  const completed = state.workouts.filter(
    (workout) => workout.status === "completed",
  ).length;
  return (
    <div className="page-stack">
      <section className="section-card">
        <div className="settings-row">
          <div>
            <span className="eyebrow">Workout defaults</span>
            <h2>Rest timer</h2>
            <p>Used for new exercises. You can change it during any workout.</p>
          </div>
          <select
            value={state.preferences.defaultRestSeconds}
            onChange={(event) => onRestChange(Number(event.target.value))}
            aria-label="Default rest time"
          >
            {[30, 60, 90, 120, 180].map((seconds) => (
              <option value={seconds} key={seconds}>
                {seconds}s
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="install-card">
        <div className="install-icon" aria-hidden="true">
          ↑
        </div>
        <div>
          <span className="eyebrow">Install on iPhone</span>
          <h2>Keep it on your Home Screen.</h2>
          <p>
            In Safari, tap Share, then “Add to Home Screen.” Your workout data
            stays on this device and the app works offline after your first visit.
          </p>
        </div>
      </section>

      <section className="section-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Your data</span>
            <h2>Export a copy</h2>
          </div>
          <span className="data-count">{completed} workouts</span>
        </div>
        <p className="section-copy">
          JSON contains your complete backup. CSV gives you one row per completed
          set for analysis in a spreadsheet.
        </p>
        <div className="export-grid">
          <button className="export-button" onClick={onExportJson}>
            <span className="export-icon" aria-hidden="true">
              {"{ }"}
            </span>
            <span>
              <strong>Export JSON</strong>
              <small>Complete backup</small>
            </span>
            <span aria-hidden="true">↓</span>
          </button>
          <button className="export-button" onClick={onExportCsv}>
            <span className="export-icon" aria-hidden="true">
              ≡
            </span>
            <span>
              <strong>Export CSV</strong>
              <small>Workout sets</small>
            </span>
            <span aria-hidden="true">↓</span>
          </button>
        </div>
        <p className="privacy-note">
          <span aria-hidden="true">●</span> Private by design. Nothing is uploaded
          to an account or cloud database.
        </p>
      </section>
    </div>
  );
}

function ExerciseDatalist({ state }: { state: AppState }) {
  const names = Array.from(
    new Set([...state.exercises.map((exercise) => exercise.name), ...SUGGESTED_EXERCISES]),
  );
  return (
    <datalist id="exercise-catalog">
      {names.map((name) => (
        <option value={name} key={name} />
      ))}
    </datalist>
  );
}
