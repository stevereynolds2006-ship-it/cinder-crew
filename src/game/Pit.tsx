import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { CrewMember } from "./crew";
import { drawPit, STAGE_H, STAGE_W } from "./draw";
import { needleAt } from "./economy";
import { WHITE_HEAT_AT } from "./shift";

export type PitHandle = {
  needle: () => number;
  pulse: (amount: number) => void;
};

type Props = {
  player: CrewMember;
  crew: readonly CrewMember[];
  attuned: ReadonlySet<string>;
  windowWidth: number;
  phase: "ready" | "sweep" | "reveal";
  sweepStart: number | null;
  period: number;
  reduced: boolean;
  glow: number;
  status: string;
  combo: number;
  blaze: boolean;
  popText: string;
  popAt: number;
  onStamp: () => void;
};

export const Pit = forwardRef<PitHandle, Props>(function Pit(
  { player, crew, attuned, windowWidth, phase, sweepStart, period, reduced, glow, status, combo, blaze, popText, popAt, onStamp },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({
    player,
    crew,
    attuned,
    windowWidth,
    phase,
    sweepStart,
    period,
    reduced,
    glow,
    status,
    combo,
    blaze,
    popText,
    popAt,
  });
  propsRef.current = { player, crew, attuned, windowWidth, phase, sweepStart, period, reduced, glow, status, combo, blaze, popText, popAt };
  const needleRef = useRef(0);
  const trauma = useRef(0);

  useImperativeHandle(ref, () => ({
    needle: () => needleRef.current,
    pulse: (amount: number) => {
      trauma.current = Math.min(1, trauma.current + amount);
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let frameId = 0;
    let last = 0;

    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (rect.width < 2 || rect.height < 2) return;
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#140e0c";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(rect.width / STAGE_W, rect.height / STAGE_H);
      const dx = (rect.width - STAGE_W * scale) / 2;
      const dy = (rect.height - STAGE_H * scale) / 2;
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * dx, dpr * dy);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);

    const loop = (now: number) => {
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
      last = now;
      const current = propsRef.current;
      if (current.phase === "sweep" && current.sweepStart !== null) {
        needleRef.current = needleAt(now - current.sweepStart, current.period);
      }
      if (!current.reduced) trauma.current = Math.max(0, trauma.current - dt * 1.6);
      const shake = current.reduced ? 0 : trauma.current * trauma.current;
      const angle = now / 90;
      const popAge = !current.popAt ? 1 : Math.min(1, Math.max(0, (now - current.popAt) / (current.reduced ? 420 : 760)));
      fit();
      drawPit(ctx, {
        player: current.player,
        crew: current.crew,
        attuned: current.attuned,
        windowWidth: current.windowWidth,
        phase: current.phase,
        needle: needleRef.current,
        reduced: current.reduced,
        frame: current.reduced ? 0 : Math.floor(now / 140) % 8,
        glow: current.glow,
        shakeX: Math.sin(angle) * 10 * shake,
        shakeY: Math.cos(angle * 0.8) * 6 * shake,
        status: current.status,
        combo: current.combo,
        blaze: current.blaze,
        whiteHeat: current.combo >= WHITE_HEAT_AT,
        pop: current.reduced && popAge > 0.35 ? "" : current.popText,
        popAge: current.reduced ? Math.min(1, popAge) : popAge,
      });
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full touch-none"
      aria-label="Furnace pit"
      onPointerDown={(event) => {
        if (propsRef.current.phase !== "sweep") return;
        event.preventDefault();
        onStamp();
      }}
    />
  );
});
