import { decodeSpriteBitmap } from "@rarefriends/friendsdk/sprites";
import { sampleFriendSprites } from "./sample-sprites.ts";

export type CrewMember = {
  id: string;
  label: string;
  generation: number;
  familyName: string;
  standIn: boolean;
  walletAddress?: string;
  frames: readonly bigint[] | null;
  pattern: readonly string[] | null;
};

const ASH = [
  "................",
  ".......##.......",
  "......#..#......",
  ".....##..##.....",
  ".....#....#.....",
  "....##.##.##....",
  "...#..#..#..#...",
  "...#.#....#.#...",
  "...#..#..#..#...",
  "....#.#..#.#....",
  ".....#.##.#.....",
  "......#..#......",
  "......#..#......",
  ".....##..##.....",
  ".....#....#.....",
  "......####......",
];

const SOOT = [
  "................",
  "................",
  "......####......",
  ".....#....#.....",
  "....#..##..#....",
  "...#...##...#...",
  "...#..#..#..#...",
  "...#.#....#.#...",
  "...#.#....#.#...",
  "...#..#..#..#...",
  "....#..##..#....",
  ".....#....#.....",
  "......####......",
  ".....#....#.....",
  "....#......#....",
  "................",
];

const KILN = [
  "................",
  "................",
  "....########....",
  "...#........#...",
  "..#..........#..",
  "..#...####...#..",
  ".#...#....#...#.",
  ".#...#....#...#.",
  ".#...######...#.",
  ".#............#.",
  ".#............#.",
  ".##############.",
  "................",
  "....##....##....",
  "....##....##....",
  "................",
];

const WICK = [
  "................",
  ".......##.......",
  "......#..#......",
  ".......##.......",
  ".......##.......",
  "......#..#......",
  "......#..#......",
  ".....#....#.....",
  ".....#....#.....",
  ".....#....#.....",
  ".....#....#.....",
  ".....#....#.....",
  "......#..#......",
  "......####......",
  "................",
  "................",
];

function fromSample(tokenId: bigint, generation: number, standIn: boolean): CrewMember {
  const sprites = sampleFriendSprites(tokenId);
  if (!sprites) throw new Error(`Missing FriendSDK sample art for #${tokenId}.`);
  return {
    id: tokenId.toString(),
    label: `Friend #${tokenId}`,
    generation,
    familyName: sprites.familyName,
    standIn,
    frames: sprites.clips.idle.down.map((frame) => frame.bitmap),
    pattern: null,
  };
}

function standIn(id: string, label: string, generation: number, pattern: readonly string[]): CrewMember {
  for (const row of pattern) {
    if (row.length !== 16) throw new Error(`Stand-in ${id} must be 16 pixels wide.`);
  }
  return {
    id,
    label,
    generation,
    familyName: "Stand-in",
    standIn: true,
    frames: null,
    pattern,
  };
}

/** Practice yard: two canonical FriendSDK samples plus original stand-ins. */
export function practiceCrew(): { player: CrewMember; crew: CrewMember[] } {
  const player = fromSample(7730n, 2, false);
  const crew = [
    fromSample(3412n, 1, false),
    standIn("standin:ash", "Ash", 3, ASH),
    standIn("standin:soot", "Soot", 4, SOOT),
    standIn("standin:kiln", "Kiln", 5, KILN),
    standIn("standin:wick", "Wick", 6, WICK),
  ];
  return { player, crew };
}

export function rowsFor(member: CrewMember, frame: number, reduced: boolean): readonly string[] | null {
  if (member.pattern) return member.pattern;
  if (!member.frames?.length) return null;
  const index = reduced ? 0 : frame % member.frames.length;
  const bitmap = member.frames[index];
  if (bitmap === undefined) return null;
  return decodeSpriteBitmap(bitmap).rows;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
