import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import WorkoutApp from "./app/WorkoutApp";
import "./app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Workout Tracker could not find its application root.");
}

createRoot(root).render(
  <StrictMode>
    <WorkoutApp />
  </StrictMode>,
);
