import { createFileRoute } from "@tanstack/react-router";
import { CinderCrew } from "@/game/CinderCrew";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <CinderCrew />;
}
