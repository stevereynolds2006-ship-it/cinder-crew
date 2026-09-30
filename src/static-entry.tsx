import { createRoot } from "react-dom/client";
import { CinderCrew } from "./game/CinderCrew";
import "./styles.css";

const root = document.getElementById("root");
if (root) createRoot(root).render(<CinderCrew />);
