import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./workspace-theme.css";
import "./merchant-onboarding.css";

createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);

