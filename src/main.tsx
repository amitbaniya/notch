import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Bubbles } from "./Bubbles";
import "./styles.css";
createRoot(document.getElementById("root")!).render(location.hash === "#bubbles" ? <Bubbles /> : <App />);
