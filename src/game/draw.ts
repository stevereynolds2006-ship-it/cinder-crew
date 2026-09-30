import { rowsFor, type CrewMember } from "./crew";

export const STAGE_W = 960;
export const STAGE_H = 640;

const INK = "#140e0c";
const CREAM = "#f3ecdf";
const EMBER = "#e85d04";
const MUTED = "#8c7b6b";
const SURFACE = "#2a211c";

export function paintSprite(
  ctx: CanvasRenderingContext2D,
  rows: readonly string[],
  x: number,
  y: number,
  scale: number,
  ink: string,
  halo: string,
) {
  const pixels: [number, number][] = [];
  rows.forEach((row, py) => {
    for (let px = 0; px < row.length; px++) if (row[px] === "#") pixels.push([px, py]);
  });
  const left = Math.round(x) - 8 * scale;
  const top = Math.round(y) - 15 * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left - scale, top - scale, 16 * scale + scale * 2, 16 * scale + scale * 2);
  ctx.clip();
  ctx.fillStyle = halo;
  for (const [px, py] of pixels) {
    ctx.fillRect(left + px * scale - scale, top + py * scale - scale, scale * 3, scale * 3);
  }
  ctx.fillStyle = ink;
  for (const [px, py] of pixels) ctx.fillRect(left + px * scale, top + py * scale, scale, scale);
  ctx.restore();
}

export type PitDraw = {
  player: CrewMember;
  crew: readonly CrewMember[];
  attuned: ReadonlySet<string>;
  windowWidth: number;
  phase: "ready" | "sweep" | "reveal";
  needle: number;
  reduced: boolean;
  frame: number;
  glow: number;
  shakeX: number;
  shakeY: number;
  status: string;
  combo: number;
  blaze: boolean;
  whiteHeat: boolean;
  pop: string;
  popAge: number;
};

export function crewSlots(count: number): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    return { x: 130 + t * 700, y: 292 - Math.sin(t * Math.PI) * 46 };
  });
}

export function drawPit(ctx: CanvasRenderingContext2D, draw: PitDraw) {
  ctx.save();
  ctx.translate(draw.shakeX, draw.shakeY);
  const sky = ctx.createLinearGradient(0, 0, 0, STAGE_H);
  sky.addColorStop(0, "#1c1410");
  sky.addColorStop(1, INK);
  ctx.fillStyle = sky;
  ctx.fillRect(-20, -20, STAGE_W + 40, STAGE_H + 40);

  ctx.fillStyle = SURFACE;
  ctx.beginPath();
  ctx.ellipse(480, 500, 340, 46, 0, 0, Math.PI * 2);
  ctx.fill();

  drawFurnace(ctx, draw.glow, draw.frame, draw.reduced, draw.whiteHeat);

  const visible = draw.crew.slice(0, 8);
  const slots = crewSlots(visible.length);
  visible.forEach((member, index) => {
    const slot = slots[index];
    if (!slot) return;
    const kindled = draw.attuned.has(member.id);
    if (kindled) {
      ctx.strokeStyle = EMBER;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(slot.x, slot.y - 28, 28, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const rows = rowsFor(member, draw.frame, draw.reduced);
    if (rows) {
      paintSprite(ctx, rows, slot.x, slot.y, 4, member.standIn ? EMBER : INK, member.standIn ? SURFACE : CREAM);
    } else {
      ctx.fillStyle = CREAM;
      ctx.beginPath();
      ctx.arc(slot.x, slot.y - 28, 14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = kindled ? EMBER : MUTED;
    ctx.font = "600 13px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(member.standIn ? member.label : `Gen ${member.generation}`, slot.x, slot.y + 18);
  });

  const playerRows = rowsFor(draw.player, draw.frame, draw.reduced);
  ctx.fillStyle = "rgba(20,14,12,0.35)";
  ctx.beginPath();
  ctx.ellipse(480, 458, 54, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  if (playerRows) {
    paintSprite(ctx, playerRows, 480, 448, 7, draw.player.standIn ? EMBER : INK, draw.player.standIn ? SURFACE : CREAM);
  } else {
    ctx.fillStyle = CREAM;
    ctx.beginPath();
    ctx.arc(480, 400, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.fillStyle = CREAM;
  ctx.font = "680 22px Fraunces, serif";
  ctx.textAlign = "center";
  ctx.fillText(draw.player.label, 480, 168);
  ctx.fillStyle = MUTED;
  ctx.font = "500 14px Outfit, sans-serif";
  ctx.fillText(`${draw.player.familyName} · Gen ${draw.player.generation}`, 480, 190);

  if (draw.combo > 0) {
    ctx.textAlign = "left";
    ctx.fillStyle = draw.whiteHeat ? EMBER : CREAM;
    ctx.font = "680 22px Fraunces, serif";
    ctx.fillText(draw.whiteHeat ? `White heat ×${draw.combo}` : `Combo ×${draw.combo}`, 36, 48);
  }
  if (draw.blaze) {
    ctx.textAlign = "right";
    ctx.fillStyle = EMBER;
    ctx.font = "680 22px Fraunces, serif";
    ctx.fillText("Blaze", STAGE_W - 36, 48);
  }

  drawBar(ctx, draw);
  ctx.fillStyle = CREAM;
  ctx.font = "500 16px Outfit, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(draw.status, 480, 608);
  if (draw.pop && draw.popAge > 0 && draw.popAge < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - draw.popAge;
    ctx.fillStyle = draw.whiteHeat ? CREAM : EMBER;
    ctx.font = "680 28px Fraunces, serif";
    ctx.fillText(draw.pop, 480, 248 - draw.popAge * 72);
    ctx.restore();
  }
  ctx.restore();
}

function drawFurnace(ctx: CanvasRenderingContext2D, glow: number, frame: number, reduced: boolean, whiteHeat: boolean) {
  const hot = Math.min(1, 0.35 + glow + (whiteHeat ? 0.2 : 0));
  ctx.fillStyle = "#3a2418";
  ctx.fillRect(392, 250, 176, 150);
  ctx.fillStyle = INK;
  ctx.fillRect(404, 262, 152, 126);
  const mouth = ctx.createRadialGradient(480, 340, 10, 480, 350, 90);
  mouth.addColorStop(0, CREAM);
  mouth.addColorStop(0.45, EMBER);
  mouth.addColorStop(1, "#3a2418");
  ctx.fillStyle = mouth;
  ctx.beginPath();
  ctx.ellipse(480, 340, 58, 42 + hot * 6, 0, 0, Math.PI * 2);
  ctx.fill();

  if (!reduced) {
    const flicker = Math.sin(frame / 2) * 6;
    ctx.fillStyle = EMBER;
    ctx.beginPath();
    ctx.moveTo(450, 360);
    ctx.quadraticCurveTo(460, 300 + flicker, 480, 286 + flicker);
    ctx.quadraticCurveTo(500, 310 - flicker, 510, 360);
    ctx.fill();
    ctx.fillStyle = CREAM;
    ctx.beginPath();
    ctx.moveTo(466, 356);
    ctx.quadraticCurveTo(476, 318, 480, 308);
    ctx.quadraticCurveTo(488, 324, 494, 356);
    ctx.fill();
  }

  ctx.strokeStyle = CREAM;
  ctx.lineWidth = 4;
  ctx.strokeRect(392, 250, 176, 150);
  ctx.fillStyle = "#4a372c";
  ctx.fillRect(458, 188, 44, 66);
  ctx.fillStyle = INK;
  ctx.fillRect(466, 196, 28, 50);
}

function drawBar(ctx: CanvasRenderingContext2D, draw: PitDraw) {
  const x = 80;
  const y = 530;
  const width = 800;
  const zone = draw.windowWidth * width;
  const perfect = zone * 0.35;
  ctx.fillStyle = SURFACE;
  ctx.fillRect(x, y, width, 28);
  ctx.fillStyle = "#4a372c";
  ctx.fillRect(x + (width - zone) / 2, y, zone, 28);
  ctx.fillStyle = EMBER;
  ctx.fillRect(x + (width - perfect) / 2, y, perfect, 28);
  if (draw.phase === "sweep" || draw.phase === "reveal") {
    const mark = x + draw.needle * width;
    ctx.fillStyle = CREAM;
    ctx.fillRect(mark - 3, y - 8, 6, 44);
  }
  ctx.strokeStyle = CREAM;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, 28);
  ctx.fillStyle = draw.blaze ? EMBER : MUTED;
  ctx.font = "500 13px Outfit, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(draw.blaze ? "Blaze sweep — faster needle, richer points" : draw.phase === "sweep" ? "Stamp in the ember band" : "Ember band", x, y - 10);
}

