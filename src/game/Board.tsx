import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { listBoard, postScore, type BoardRow } from "@/game/board";
import { parseCallsign } from "./shift";

type Props = {
  score: number;
  best: number;
  rankTitle: string;
  combo: number;
  callsign: string;
  onCallsign: (value: string) => void;
};

export function Board({ score, best, rankTitle, combo, callsign, onCallsign }: Props) {
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const next = await listBoard();
      setRows(next);
    } catch {
      setRows([]);
      setNote((current) => current || "The board didn't answer. Your best still stays on this device.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function post() {
    setNote("");
    let handle = callsign;
    try {
      handle = parseCallsign(callsign);
      onCallsign(handle);
    } catch (cause) {
      setNote(cause instanceof Error ? cause.message : "That callsign won't take.");
      return;
    }
    if (score < 1) {
      setNote("Stamp a shift before you post it.");
      return;
    }
    setBusy(true);
    try {
      const result = await postScore({ data: { handle, score, rankTitle, combo } });
      setNote(
        result.placed
          ? "Posted. This callsign keeps only its best shift."
          : `This callsign already stands at ${result.score.toLocaleString()}. Beat it to climb.`,
      );
      await refresh();
    } catch (cause) {
      setNote(cause instanceof Error ? cause.message : "Couldn't post that score.");
    } finally {
      setBusy(false);
    }
  }

  const mine = callsign.trim().toLowerCase();

  return (
    <section className="rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg">
          <Trophy size={18} aria-hidden="true" />
          Furnace board
        </h2>
        <p className="text-xs text-muted">One best shift per callsign</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs tracking-wide text-muted uppercase">This shift</div>
          <div className="font-display text-2xl tabular-nums">{score.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-xs tracking-wide text-muted uppercase">Best on this device</div>
          <div className="font-display text-2xl tabular-nums">{best.toLocaleString()}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="callsign">
          Callsign
        </label>
        <input
          id="callsign"
          value={callsign}
          maxLength={16}
          autoComplete="off"
          spellCheck={false}
          placeholder="Callsign"
          className="h-11 flex-1 rounded-lg border border-border bg-bg px-3 text-base text-fg"
          onChange={(event) => onCallsign(event.target.value)}
        />
        <button
          type="button"
          className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg disabled:opacity-40"
          disabled={busy || score < 1}
          onClick={() => void post()}
        >
          {busy ? "Posting…" : `Post ${score.toLocaleString()}`}
        </button>
      </div>
      {note ? <p className="mt-2 text-sm text-pretty text-muted">{note}</p> : null}
      {rows === null ? (
        <p className="mt-3 text-sm text-muted">Lighting the board…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No scores yet. Be the first stamp on the board.</p>
      ) : (
        <ol className="mt-3 divide-y divide-border">
          {rows.map((row, index) => {
            const yours = row.handle.toLowerCase() === mine;
            return (
              <li key={row.handle} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-6 font-display text-lg tabular-nums text-muted">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-medium ${yours ? "text-primary" : "text-fg"}`}>{row.handle}</span>
                  <span className="block text-xs text-muted">
                    {row.rankTitle}
                    {row.combo > 0 ? ` · combo ${row.combo}` : ""}
                  </span>
                </span>
                <span className="font-display text-lg tabular-nums">{row.score.toLocaleString()}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
