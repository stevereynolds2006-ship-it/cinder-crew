export type BoardRow = {
  handle: string;
  score: number;
  rankTitle: string;
  combo: number;
};

const KEY = "cinder-crew-public-board";

function read(): BoardRow[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is BoardRow =>
        !!row &&
        typeof row === "object" &&
        typeof (row as BoardRow).handle === "string" &&
        typeof (row as BoardRow).score === "number" &&
        typeof (row as BoardRow).rankTitle === "string" &&
        typeof (row as BoardRow).combo === "number",
    );
  } catch {
    return [];
  }
}

function write(rows: BoardRow[]) {
  localStorage.setItem(KEY, JSON.stringify(rows));
}

export async function listBoard(): Promise<BoardRow[]> {
  return read()
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

export async function postScore(input: {
  data: { handle: string; score: number; rankTitle: string; combo: number };
}): Promise<{ placed: boolean; score: number }> {
  const { handle, score, rankTitle, combo } = input.data;
  const rows = read();
  const key = handle.toLowerCase();
  const existing = rows.find((row) => row.handle.toLowerCase() === key);
  if (existing && existing.score >= score) return { placed: false, score: existing.score };
  const next = rows.filter((row) => row.handle.toLowerCase() !== key);
  next.push({ handle, score, rankTitle, combo });
  write(next);
  return { placed: true, score };
}
