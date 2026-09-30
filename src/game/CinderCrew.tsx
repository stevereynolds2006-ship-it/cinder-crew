import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flame, Maximize2, Minimize2, Volume2, VolumeX } from "lucide-react";
import type { FriendWalletSession, FriendWalletSnapshot } from "@rarefriends/friendsdk/wallet";
import { playCue, setMuted, unlockAudio } from "./audio";
import { Board } from "./Board";
import { practiceCrew, shortAddress, type CrewMember } from "./crew";
import { confirmFriend, discoverFriends, loadSprite, type DiscoveredFriend } from "./friends-read";
import {
  CINDER_GAME,
  EXPECTED_REWARD,
  formatRf,
  KINDLE_COST,
  MAX_KINDLED,
  MAX_PRIZE,
  OFFERING_COST,
  percentLabel,
  rankFor,
  STARTING_PURSE,
  STARTING_STAKE,
  timingWindow,
  type Grade,
} from "./economy";
import { createCinderLedger, type CinderLedger, type CinderSnapshot, type LedgerSave } from "./ledger";
import { Pit, type PitHandle } from "./Pit";
import { findMetaMaskProvider, inMetaMaskBrowser, metaMaskDappUrl, syncVisibleViewport } from "./metamask";
import {
  applyKindle,
  applyScorch,
  applyStamp,
  bountyFor,
  burnHeatLabel,
  classifyStamp,
  freshShift,
  isBlazeStoke,
  suggestCallsign,
  tunedHeat,
  type ShiftState,
} from "./shift";

const SAVE_KEY = "cinder-crew-v1";
const PERIOD = 1700;
const PERIOD_SLOW = 2500;

type Mode = "practice" | "wallet";
type Phase = "ready" | "sweep" | "reveal";

type SaveFile = {
  version: 1;
  purses: Record<string, LedgerSave>;
  muted: boolean;
  reduced: boolean | null;
  shift: number;
  best: number;
  combo: number;
  strikes: number;
  cracked: boolean;
  bountyIndex: number;
  bountyProgress: number;
  callsign: string;
  stokes: number;
};

function emptySave(): SaveFile {
  return {
    version: 1,
    purses: {},
    muted: false,
    reduced: null,
    shift: 0,
    best: 0,
    combo: 0,
    strikes: 0,
    cracked: false,
    bountyIndex: 0,
    bountyProgress: 0,
    callsign: "",
    stokes: 0,
  };
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function readSave(): SaveFile {
  const empty = emptySave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<SaveFile>;
    if (parsed.version !== 1 || !parsed.purses || typeof parsed.purses !== "object") return empty;
    return {
      version: 1,
      purses: parsed.purses,
      muted: Boolean(parsed.muted),
      reduced: typeof parsed.reduced === "boolean" ? parsed.reduced : null,
      shift: num(parsed.shift),
      best: num(parsed.best),
      combo: num(parsed.combo),
      strikes: Math.min(3, num(parsed.strikes)),
      cracked: Boolean(parsed.cracked),
      bountyIndex: num(parsed.bountyIndex),
      bountyProgress: num(parsed.bountyProgress),
      callsign: typeof parsed.callsign === "string" ? parsed.callsign.slice(0, 16) : "",
      stokes: num(parsed.stokes),
    };
  } catch {
    return empty;
  }
}

function shiftFrom(file: SaveFile): ShiftState {
  return {
    combo: file.combo,
    strikes: file.strikes,
    score: file.shift,
    bountyIndex: file.bountyIndex,
    bountyProgress: file.bountyProgress,
    cracked: file.cracked,
  };
}

function purseKey(mode: Mode, account: string | null, friendId: string) {
  return mode === "wallet" && account ? `wallet:${account.toLowerCase()}:${friendId}` : `practice:${friendId}`;
}

function openLedger(save: LedgerSave | undefined, friendId: bigint): CinderLedger {
  if (save) return createCinderLedger(CINDER_GAME, { save, friendId });
  return createCinderLedger(CINDER_GAME, {
    friendId,
    rfBalance: STARTING_PURSE,
    stake: STARTING_STAKE,
  });
}

function fromDiscovered(row: DiscoveredFriend): CrewMember {
  return {
    id: row.id,
    label: row.label,
    generation: row.generation,
    familyName: row.familyName ?? "Friend",
    standIn: false,
    walletAddress: row.walletAddress,
    frames: row.frames?.map((hex) => BigInt(`0x${hex}`)) ?? null,
    pattern: null,
  };
}

export function CinderCrew() {
  const practice = useMemo(() => practiceCrew(), []);
  const [mode, setMode] = useState<Mode>("practice");
  const [account, setAccount] = useState<string | null>(null);
  const [roster, setRoster] = useState<CrewMember[]>(() => [practice.player, ...practice.crew]);
  const [smithId, setSmithId] = useState(practice.player.id);
  const [attuned, setAttuned] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("ready");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [outcomeId, setOutcomeId] = useState<number | null>(null);
  const [sweepStart, setSweepStart] = useState<number | null>(null);
  const [status, setStatus] = useState("Kindle crew, then stoke the furnace.");
  const [error, setError] = useState("");
  const [walletNote, setWalletNote] = useState("");
  const [busyLabel, setBusyLabel] = useState("");
  const [muted, setMutedState] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [snap, setSnap] = useState<CinderSnapshot | null>(null);
  const [walletSnap, setWalletSnap] = useState<FriendWalletSnapshot | null>(null);
  const [shiftState, setShiftState] = useState<ShiftState>({
    combo: 0,
    strikes: 0,
    score: 0,
    bountyIndex: 0,
    bountyProgress: 0,
    cracked: false,
  });
  const [best, setBest] = useState(0);
  const [callsign, setCallsign] = useState("Friend 7730");
  const [stokes, setStokes] = useState(0);
  const [blazeOn, setBlazeOn] = useState(false);
  const [showYard, setShowYard] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [metaMaskHref, setMetaMaskHref] = useState<string | null>(null);
  const [maskBrowser, setMaskBrowser] = useState(false);
  const [pop, setPop] = useState<{ text: string; at: number } | null>(null);

  const ledgerRef = useRef<CinderLedger | null>(null);
  const pitRef = useRef<PitHandle>(null);
  const phaseRef = useRef<Phase>("ready");
  const playIdRef = useRef<bigint | null>(null);
  const busyRef = useRef(false);
  const saveRef = useRef<SaveFile>(emptySave());
  const sessionRef = useRef<FriendWalletSession | null>(null);
  const unsubWallet = useRef<(() => void) | null>(null);
  const stampRef = useRef<(reason: "tap" | "timeout") => void>(() => undefined);
  const stokeRef = useRef<() => void>(() => undefined);
  const modeRef = useRef<Mode>("practice");
  const accountRef = useRef<string | null>(null);
  const smithRef = useRef(practice.player.id);
  const shiftRef = useRef(shiftState);
  const blazeRef = useRef(false);
  const stokesRef = useRef(stokes);
  const callsignRef = useRef(callsign);
  shiftRef.current = shiftState;
  stokesRef.current = stokes;
  callsignRef.current = callsign;

  phaseRef.current = phase;
  modeRef.current = mode;
  accountRef.current = account;
  smithRef.current = smithId;

  const smith = roster.find((friend) => friend.id === smithId) ?? roster[0] ?? practice.player;
  const crew = roster.filter((friend) => friend.id !== smith.id);
  const period = (reduced ? PERIOD_SLOW : PERIOD) * (blazeOn ? 0.68 : 1);
  const windowWidth = timingWindow(
    smith.generation,
    attuned
      .map((id) => crew.find((friend) => friend.id === id)?.generation)
      .filter((gen): gen is number => typeof gen === "number"),
    snap?.heat ?? 0,
  );

  const persist = useCallback((ledger: CinderLedger) => {
    const key = purseKey(modeRef.current, accountRef.current, smithRef.current);
    const file = saveRef.current;
    file.purses[key] = ledger.save();
    file.muted = muted;
    file.reduced = reduced;
    file.shift = shiftRef.current.score;
    file.best = Math.max(file.best, shiftRef.current.score);
    file.combo = shiftRef.current.combo;
    file.strikes = shiftRef.current.strikes;
    file.cracked = shiftRef.current.cracked;
    file.bountyIndex = shiftRef.current.bountyIndex;
    file.bountyProgress = shiftRef.current.bountyProgress;
    file.callsign = callsignRef.current;
    file.stokes = stokesRef.current;
    localStorage.setItem(SAVE_KEY, JSON.stringify(file));
    setSnap(ledger.snapshot());
  }, [muted, reduced, callsign]);

  const remember = useCallback((next: ShiftState, popText?: string) => {
    shiftRef.current = next;
    setShiftState(next);
    const bestScore = Math.max(saveRef.current.best, next.score);
    saveRef.current.best = bestScore;
    setBest(bestScore);
    const file = saveRef.current;
    file.shift = next.score;
    file.combo = next.combo;
    file.strikes = next.strikes;
    file.cracked = next.cracked;
    file.bountyIndex = next.bountyIndex;
    file.bountyProgress = next.bountyProgress;
    file.stokes = stokesRef.current;
    file.callsign = callsignRef.current;
    localStorage.setItem(SAVE_KEY, JSON.stringify(file));
    if (popText) setPop({ text: popText, at: performance.now() });
  }, [callsign]);

  function bindSession(session: FriendWalletSession) {
    if (sessionRef.current && sessionRef.current !== session) {
      unsubWallet.current?.();
      sessionRef.current.dispose();
    } else {
      unsubWallet.current?.();
    }
    sessionRef.current = session;
    setWalletSnap(session.getSnapshot());
    unsubWallet.current = session.subscribe(() => setWalletSnap(session.getSnapshot()));
  }

  useEffect(() => {
    syncVisibleViewport();
    setMaskBrowser(inMetaMaskBrowser());
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", syncVisibleViewport);
    viewport?.addEventListener("scroll", syncVisibleViewport);
    window.addEventListener("resize", syncVisibleViewport);
    window.addEventListener("orientationchange", syncVisibleViewport);
    return () => {
      viewport?.removeEventListener("resize", syncVisibleViewport);
      viewport?.removeEventListener("scroll", syncVisibleViewport);
      window.removeEventListener("resize", syncVisibleViewport);
      window.removeEventListener("orientationchange", syncVisibleViewport);
    };
  }, []);

  const adoptLedger = useCallback((nextMode: Mode, nextAccount: string | null, friend: CrewMember) => {
    const key = purseKey(nextMode, nextAccount, friend.id);
    const ledger = openLedger(saveRef.current.purses[key], BigInt(friend.standIn ? "0" : friend.id));
    ledgerRef.current = ledger;
    setSnap(ledger.snapshot());
    setSmithId(friend.id);
    setAttuned([]);
    setPhase("ready");
    setGrade(null);
    setOutcomeId(null);
    setSweepStart(null);
    playIdRef.current = null;
  }, []);

  useEffect(() => {
    const file = readSave();
    saveRef.current = file;
    const loaded = shiftFrom(file);
    shiftRef.current = loaded;
    stokesRef.current = file.stokes;
    callsignRef.current = file.callsign || suggestCallsign("Friend 7730");
    setShiftState(loaded);
    setBest(Math.max(file.best, file.shift));
    setCallsign(file.callsign || suggestCallsign("Friend 7730"));
    setStokes(file.stokes);
    setMutedState(file.muted);
    setMuted(file.muted);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(file.reduced ?? media.matches);
    adoptLedger("practice", null, practice.player);
    setMetaMaskHref(metaMaskDappUrl());
    let disposed = false;
    void import("@rarefriends/friendsdk/wallet").then(({ createFriendWalletSession }) => {
      if (disposed) return;
      bindSession(createFriendWalletSession());
    });
    const onEthereum = () => setMetaMaskHref(metaMaskDappUrl());
    window.addEventListener("ethereum#initialized", onEthereum);
    const onFullScreen = () => setFullScreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullScreen);
    const onHide = () => {
      if (document.visibilityState === "visible") unlockAudio();
    };
    document.addEventListener("visibilitychange", onHide);
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.code !== "Space") return;
      event.preventDefault();
      if (phaseRef.current === "sweep") stampRef.current("tap");
      else if (phaseRef.current === "ready") stokeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      disposed = true;
      unsubWallet.current?.();
      sessionRef.current?.dispose();
      document.removeEventListener("visibilitychange", onHide);
      document.removeEventListener("fullscreenchange", onFullScreen);
      window.removeEventListener("ethereum#initialized", onEthereum);
      window.removeEventListener("keydown", onKey);
    };
  }, [adoptLedger, practice.player]);

  useEffect(() => {
    if (phase !== "sweep" || sweepStart === null) return;
    let frame = 0;
    const tick = (now: number) => {
      if (now - sweepStart >= period) {
        finishSweep("timeout");
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // finishSweep is stable via refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sweepStart, period]);

  function finishSweep(reason: "tap" | "timeout") {
    if (busyRef.current || phaseRef.current !== "sweep") return;
    const ledger = ledgerRef.current;
    const playId = playIdRef.current;
    if (!ledger || playId === null) return;
    busyRef.current = true;
    try {
      const needle = reason === "timeout" ? 0 : (pitRef.current?.needle() ?? 0);
      const stamp = reason === "timeout" ? "miss" : classifyStamp(needle, windowWidth);
      const nextGrade: Grade = stamp === "perfect" || stamp === "good" ? stamp : "miss";
      const settled = ledger.settle(playId);
      const tick = applyStamp(shiftRef.current, stamp, blazeRef.current);
      const relicName = CINDER_GAME.outcomes[settled.outcomeId - 1]?.name ?? "Relic";
      setGrade(nextGrade);
      setOutcomeId(settled.outcomeId);
      setPhase("reveal");
      setSweepStart(null);
      setAttuned([]);
      setBlazeOn(false);
      const short = tick.state.cracked
        ? `Shift cracked · ${tick.state.score.toLocaleString()}`
        : stamp === "perfect"
          ? `Perfect · ${relicName} · +${tick.points.toLocaleString()}`
          : stamp === "good"
            ? `Good · ${relicName} · combo holds · +${tick.points.toLocaleString()}`
            : stamp === "graze"
              ? `Graze · ${relicName} · combo slipped`
              : `Strike ${tick.state.strikes}/3 · ${relicName}`;
      setStatus(tick.cleared ? `${short}. Bounty: ${tick.cleared}.` : short);
      playCue(stamp === "graze" ? "graze" : nextGrade, tick.state.combo);
      if (tick.cleared) playCue("bounty");
      pitRef.current?.pulse(stamp === "perfect" ? Math.min(1, 0.45 + tick.state.combo * 0.08) : stamp === "miss" ? 0.62 : 0.28);
      remember(
        tick.state,
        tick.cleared ? "Bounty" : stamp === "miss" ? (tick.state.cracked ? "Cracked" : "Strike") : `+${tick.points.toLocaleString()}`,
      );
      persist(ledger);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The ember didn't settle.");
      setPhase("ready");
    } finally {
      busyRef.current = false;
    }
  }

  function stoke() {
    unlockAudio();
    setError("");
    if (phaseRef.current !== "ready" || busyRef.current) return;
    if (shiftRef.current.cracked) {
      setError("This shift cracked. Post the score or start a new one.");
      return;
    }
    const ledger = ledgerRef.current;
    if (!ledger) return;
    if (!ledger.canBuy(1n)) {
      setError(
        ledger.snapshot().rfBalance < CINDER_GAME.price
          ? "Not enough simulated RF in this Friend's purse."
          : "The furnace float can't back another ember yet. Redeem or scorch a kept relic.",
      );
      return;
    }
    busyRef.current = true;
    try {
      ledger.buy(1n);
      const [play] = ledger.play(1n);
      if (!play) throw new Error("No ember was struck.");
      playIdRef.current = play.id;
      const blaze = isBlazeStoke(stokesRef.current);
      blazeRef.current = blaze;
      stokesRef.current += 1;
      setBlazeOn(blaze);
      setStokes(stokesRef.current);
      setPhase("sweep");
      setSweepStart(performance.now());
      setGrade(null);
      setOutcomeId(null);
      setStatus(blaze ? "Blaze sweep. The needle is faster, and a clean stamp pays more." : "Stamp while the needle is in the ember band.");
      playCue("stoke");
      pitRef.current?.pulse(0.25);
      persist(ledger);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't stoke.");
    } finally {
      busyRef.current = false;
    }
  }

  function kindle(member: CrewMember) {
    unlockAudio();
    setError("");
    if (phase !== "ready" || member.id === smith.id) return;
    if (shiftRef.current.cracked) {
      setError("This shift cracked. Post the score or start a new one.");
      return;
    }
    if (attuned.includes(member.id)) return;
    if (attuned.length >= MAX_KINDLED) {
      setError("Three crew are already kindled for the next stoke.");
      return;
    }
    const ledger = ledgerRef.current;
    if (!ledger) return;
    try {
      ledger.kindle(`Kindled ${member.label}`);
      const tick = applyKindle(shiftRef.current);
      setAttuned((current) => [...current, member.id]);
      setStatus(
        tick.cleared
          ? `${member.label} is kindled. Bounty cleared: ${tick.cleared}.`
          : `${member.label} is kindled. Gen ${member.generation} widens the next stamp.`,
      );
      playCue("kindle");
      if (tick.cleared) playCue("bounty");
      if (tick.state !== shiftRef.current) remember(tick.state, tick.cleared ? "Bounty" : undefined);
      pitRef.current?.pulse(0.2);
      persist(ledger);
      if (!member.frames && !member.pattern && !member.standIn) {
        void loadSprite(member.id)
          .then((art) => {
            setRoster((current) =>
              current.map((friend) =>
                friend.id === member.id
                  ? {
                      ...friend,
                      familyName: art.familyName,
                      frames: art.frames.map((hex) => BigInt(`0x${hex}`)),
                    }
                  : friend,
              ),
            );
          })
          .catch(() => undefined);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't kindle.");
    }
  }

  function offer() {
    unlockAudio();
    setError("");
    if (phase !== "ready" || shiftRef.current.cracked) return;
    const ledger = ledgerRef.current;
    if (!ledger) return;
    try {
      ledger.offering();
      const burnedNow = ledger.snapshot().burned;
      grantHeat(4);
      setStatus(`Offering burned ${formatRf(OFFERING_COST)} RF. Rank is ${rankFor(burnedNow)}.`);
      playCue("burn");
      pitRef.current?.pulse(0.55);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't make an offering.");
    }
  }

  function grantHeat(amount: number) {
    const ledger = ledgerRef.current;
    if (!ledger) return;
    const save = ledger.save();
    save.heat += amount;
    const next = createCinderLedger(CINDER_GAME, { save, friendId: 0n });
    ledgerRef.current = next;
    persist(next);
  }

  function choose(action: "redeem" | "keep" | "scorch") {
    unlockAudio();
    setError("");
    if (phase !== "reveal" || outcomeId === null) return;
    const ledger = ledgerRef.current;
    if (!ledger || !grade) return;
    const outcome = CINDER_GAME.outcomes[outcomeId - 1];
    if (!outcome) return;
    try {
      if (action === "redeem") {
        ledger.redeem(outcomeId);
        setStatus(`Redeemed ${formatRf(outcome.reward)} RF back to this Friend.`);
        playCue("redeem");
      } else if (action === "scorch") {
        const heat = tunedHeat(outcome.reward, grade, shiftRef.current.combo);
        ledger.scorch(outcomeId, heat);
        const tick = applyScorch(shiftRef.current, heat);
        remember(tick.state, tick.cleared ? "Bounty" : tick.points > 0 ? `+${tick.points.toLocaleString()}` : undefined);
        if (tick.cleared) playCue("bounty");
        setStatus(
          outcome.reward === 0n
            ? `Burned ${outcome.name} for heat. +${tick.points.toLocaleString()} shift.`
            : `Burned ${formatRf(outcome.reward)} RF. +${tick.points.toLocaleString()} shift. It will not return.`,
        );
        playCue("burn", tick.state.combo);
        pitRef.current?.pulse(0.8);
      } else {
        setStatus(`${outcome.name} stays with this Friend. Its RF stays reserved until you redeem or burn it.`);
      }
      setPhase("ready");
      setOutcomeId(null);
      setGrade(null);
      persist(ledger);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't finish that choice.");
    }
  }

  function actOnKept(id: number, action: "redeem" | "scorch") {
    unlockAudio();
    setError("");
    if (phase !== "ready") return;
    const ledger = ledgerRef.current;
    const outcome = CINDER_GAME.outcomes[id];
    if (!ledger || !outcome) return;
    try {
      if (action === "redeem") {
        ledger.redeem(id + 1);
        playCue("redeem");
        setStatus(`Redeemed ${outcome.name} for ${formatRf(outcome.reward)} RF.`);
      } else {
        const heat = tunedHeat(outcome.reward, "good", shiftRef.current.combo);
        ledger.scorch(id + 1, heat);
        const tick = shiftRef.current.cracked ? null : applyScorch(shiftRef.current, heat);
        if (tick) {
          remember(tick.state, tick.cleared ? "Bounty" : tick.points > 0 ? `+${tick.points.toLocaleString()}` : undefined);
          if (tick.cleared) playCue("bounty");
        }
        playCue("burn", shiftRef.current.combo);
        pitRef.current?.pulse(0.45);
        setStatus(
          outcome.reward === 0n
            ? `Burned a kept ${outcome.name} for heat.`
            : `Burned a kept ${outcome.name}. ${formatRf(outcome.reward)} RF was destroyed.`,
        );
      }
      persist(ledger);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't use that relic.");
    }
  }

  function newShift() {
    unlockAudio();
    setError("");
    setBlazeOn(false);
    blazeRef.current = false;
    setStatus("New shift. Three misses crack it. A graze does not.");
    remember(freshShift(shiftRef.current));
  }

  async function connect() {
    unlockAudio();
    setError("");
    setWalletNote("");
    const provider = findMetaMaskProvider();
    let session = sessionRef.current;
    if (!session) {
      setWalletNote("Wallet session is still starting. Tap Connect MetaMask again.");
      return;
    }
    const named = session.getSnapshot().wallets.find((wallet) => /metamask/i.test(wallet.name));
    if (!named && provider) {
      const { createFriendWalletSession } = await import("@rarefriends/friendsdk/wallet");
      session = createFriendWalletSession({ provider });
      bindSession(session);
    }
    if (!named && !provider) {
      setWalletNote("MetaMask isn't in this browser. Open the MetaMask app, use its browser, and load this page. Practice still works.");
      return;
    }
    const next = await session.connect(named?.id);
    setWalletSnap(next);
    let ready = next;
    if (next.status === "wrong-network") {
      ready = await session.switchNetwork();
      setWalletSnap(ready);
    }
    if (ready.status === "unavailable") {
      setWalletNote("MetaMask didn't answer. Open this page in the MetaMask browser and tap Connect again.");
      return;
    }
    if (ready.status === "wrong-network") {
      setWalletNote(ready.error ?? "Approve Robinhood Chain in MetaMask, then tap Switch.");
      return;
    }
    if (ready.status === "error") {
      setWalletNote(ready.error ?? "MetaMask connection failed.");
      return;
    }
    if (ready.account && ready.status === "connected") void loadWallet(ready.account);
  }

  function toggleFullScreen() {
    const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    const request = root.requestFullscreen?.bind(root) ?? root.webkitRequestFullscreen?.bind(root);
    if (!request) return;
    void Promise.resolve(request()).catch(() => {
      setWalletNote("This browser won't go fullscreen. The furnace already fills the screen.");
    });
  }

  async function loadWallet(nextAccount: string) {
    setBusyLabel("Reading Friends on Robinhood Chain…");
    setWalletNote("");
    setError("");
    try {
      const discovered = await discoverFriends(nextAccount);
      if (discovered.friends.length === 0) {
        setWalletNote(
          discovered.hiddenCount
            ? "This wallet only has generation 0 Friends, and those can't take the furnace."
            : "This wallet doesn't hold a Generations NFT yet.",
        );
        return;
      }
      const first = discovered.friends[0];
      if (!first) return;
      const gate = await confirmFriend(nextAccount, first.id);
      if (!gate.eligible) {
        setWalletNote("That Friend isn't a hardwired generation 1 or higher on this wallet.");
        return;
      }
      const members = discovered.friends.map(fromDiscovered);
      const smithFriend = members[0];
      if (!smithFriend) return;
      setMode("wallet");
      setAccount(nextAccount);
      setRoster(members);
      modeRef.current = "wallet";
      accountRef.current = nextAccount;
      adoptLedger("wallet", nextAccount, smithFriend);
      setStatus(`${smithFriend.label} is at the furnace. Kindle the others, then stoke.`);
      setWalletNote("");
    } catch (cause) {
      setWalletNote(cause instanceof Error ? cause.message : "Couldn't read Friends.");
    } finally {
      setBusyLabel("");
    }
  }

  function chooseSmith(member: CrewMember) {
    if (phase !== "ready" || member.id === smith.id) return;
    setError("");
    if (mode === "wallet" && account) {
      setBusyLabel("Checking ownership…");
      void confirmFriend(account, member.id)
        .then((gate) => {
          if (!gate.eligible) {
            setError("That Friend is no longer eligible.");
            return;
          }
          adoptLedger("wallet", account, member);
          setStatus(`${member.label} takes the furnace.`);
        })
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Couldn't switch smiths."))
        .finally(() => setBusyLabel(""));
      return;
    }
    adoptLedger(mode, account, member);
    setStatus(`${member.label} takes the furnace.`);
  }

  function backToPractice() {
    setMode("practice");
    setAccount(null);
    setRoster([practice.player, ...practice.crew]);
    setWalletNote("");
    modeRef.current = "practice";
    accountRef.current = null;
    adoptLedger("practice", null, practice.player);
    setStatus("Practice yard. Connect a wallet when you want your own Friends at the furnace.");
  }

  function resetPurse() {
    const ledger = createCinderLedger(CINDER_GAME, {
      friendId: 0n,
      rfBalance: STARTING_PURSE,
      stake: STARTING_STAKE,
    });
    ledgerRef.current = ledger;
    setAttuned([]);
    setPhase("ready");
    setError("");
    setStatus("Simulated purse reset for this Friend.");
    persist(ledger);
  }

  stampRef.current = finishSweep;
  stokeRef.current = stoke;

  const skipMetaWrite = useRef(true);
  useEffect(() => {
    if (skipMetaWrite.current) {
      skipMetaWrite.current = false;
      return;
    }
    const file = saveRef.current;
    file.callsign = callsignRef.current;
    file.stokes = stokes;
    file.best = Math.max(file.best, best);
    localStorage.setItem(SAVE_KEY, JSON.stringify(file));
  }, [callsign, stokes, best]);

  const outcome = outcomeId ? CINDER_GAME.outcomes[outcomeId - 1] : null;
  const glow = Math.min(1, Number(snap?.burned ?? 0n) / 1e18 / 12);

  return (
    <main className="fixed top-[var(--app-top,0px)] left-0 z-0 flex h-[var(--app-h,100dvh)] w-full flex-col gap-2 overflow-hidden bg-bg px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] text-fg">
      <header className="flex shrink-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium tracking-[0.18em] text-muted uppercase">Rare Friends</p>
          <h1 className="truncate font-display text-2xl leading-none font-semibold text-fg sm:text-4xl">Cinder Crew</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="h-11 rounded-lg border border-border bg-surface px-3 text-sm text-fg"
            aria-pressed={showYard}
            onClick={() => setShowYard((open) => !open)}
          >
            {showYard ? "Furnace" : "Board"}
          </button>
          {maskBrowser ? null : (
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface text-fg"
              aria-pressed={fullScreen}
              aria-label={fullScreen ? "Exit full screen" : "Full screen"}
              onClick={toggleFullScreen}
            >
              {fullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          )}
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface text-fg"
            aria-pressed={muted}
            aria-label={muted ? "Unmute" : "Mute"}
            onClick={() => {
              unlockAudio();
              const next = !muted;
              setMutedState(next);
              setMuted(next);
              saveRef.current.muted = next;
              localStorage.setItem(SAVE_KEY, JSON.stringify(saveRef.current));
            }}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>
      </header>

      <section className="flex shrink-0 flex-nowrap items-center gap-3 overflow-x-auto rounded-xl border border-border bg-surface px-3 py-2">
        <Stat label="Purse" value={`${formatRf(snap?.rfBalance ?? STARTING_PURSE)} RF`} />
        <Stat label="Burned" value={`${formatRf(snap?.burned ?? 0n)} RF`} />
        <Stat label="Rank" value={rankFor(snap?.burned ?? 0n)} />
        <Stat label="Heat" value={(snap?.heat ?? 0).toFixed(1)} />
        <Stat label="Shift" value={shiftState.score.toLocaleString()} />
        <Stat label="Combo" value={shiftState.combo > 0 ? `×${shiftState.combo}` : "—"} />
        <div className="ml-auto flex flex-wrap gap-2">
          {mode === "wallet" && account ? (
            <>
              <span className="self-center text-sm text-muted">{shortAddress(account)}</span>
              <button type="button" className="h-11 rounded-lg border border-border px-3 text-sm" onClick={backToPractice}>
                Practice yard
              </button>
            </>
          ) : (
            <button
              type="button"
              className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg"
              onClick={() => void connect()}
            >
              Connect MetaMask
            </button>
          )}
          {walletSnap?.status === "wrong-network" ? (
            <button
              type="button"
              className="h-11 rounded-lg border border-border px-3 text-sm"
              onClick={() => {
                void sessionRef.current?.switchNetwork().then((next) => {
                  setWalletSnap(next);
                  if (next.account && next.status === "connected") void loadWallet(next.account);
                  else if (next.error) setWalletNote(next.error);
                });
              }}
            >
              Switch to Robinhood
            </button>
          ) : null}
        </div>
      </section>

      {walletNote || error || busyLabel ? (
        <p role="alert" className="shrink-0 text-sm text-pretty text-primary">
          {error || walletNote || busyLabel}
          {walletNote.startsWith("MetaMask isn't") && metaMaskHref ? (
            <>
              {" "}
              <a className="underline" href={metaMaskHref}>
                Open in MetaMask
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      {phase === "ready" && !shiftState.cracked && isBlazeStoke(stokes) ? (
        <p className="shrink-0 text-sm font-medium text-primary">Next stoke is a blaze. Faster needle, richer stamp.</p>
      ) : null}

      <div className="relative -mx-3 min-h-0 flex-1 overflow-hidden bg-bg">
        <Pit
            ref={pitRef}
            player={smith}
            crew={crew}
            attuned={new Set(attuned)}
            windowWidth={windowWidth}
            phase={phase}
            sweepStart={sweepStart}
            period={period}
            reduced={reduced}
            glow={glow}
            status={status}
            combo={shiftState.combo}
            blaze={blazeOn && phase === "sweep"}
            popText={pop?.text ?? ""}
            popAt={pop?.at ?? 0}
            onStamp={() => finishSweep("tap")}
        />
        <div className="pointer-events-none absolute inset-x-2 top-2 flex items-center justify-between gap-2 rounded-lg bg-bg/80 px-2 py-1 text-sm">
          <p className="min-w-0 truncate text-fg">
            <span className="text-muted">Bounty · </span>
            {bountyFor(shiftState.bountyIndex).label}
            <span className="text-muted">
              {" "}
              {Math.min(shiftState.bountyProgress, bountyFor(shiftState.bountyIndex).goal)}/
              {bountyFor(shiftState.bountyIndex).goal}
            </span>
          </p>
          <div className="flex shrink-0 items-center gap-1.5" aria-label={`${3 - shiftState.strikes} strikes remaining`}>
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className={`h-2.5 w-2.5 rounded-full ${index < shiftState.strikes ? "bg-border" : "bg-primary"}`}
              />
            ))}
          </div>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {status}
      </p>

      <div className="flex shrink-0 gap-2 overflow-x-auto pb-1">
        {roster.map((member) => {
          const isSmith = member.id === smith.id;
          const kindled = attuned.includes(member.id);
          return (
            <div key={member.id} className="flex w-28 shrink-0 flex-col gap-2">
              <button
                type="button"
                className={`h-12 rounded-lg border px-2 text-left text-sm ${isSmith ? "border-primary bg-surface text-fg" : "border-border bg-bg text-fg"}`}
                onClick={() => chooseSmith(member)}
              >
                <span className="block truncate font-medium">{member.label}</span>
                <span className="block text-xs text-muted">
                  Gen {member.generation}
                  {member.standIn ? " · stand-in" : ""}
                </span>
              </button>
              {isSmith ? (
                <span className="flex h-11 items-center justify-center text-xs tracking-wide text-primary uppercase">
                  Smith
                </span>
              ) : (
                <button
                  type="button"
                  disabled={phase !== "ready" || kindled || shiftState.cracked}
                  className="h-11 rounded-lg border border-border bg-surface text-xs font-medium text-fg disabled:opacity-50"
                  onClick={() => kindle(member)}
                >
                  {kindled ? "Kindled" : `Kindle ${formatRf(KINDLE_COST)}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {phase === "reveal" && outcome && grade ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            className="h-14 rounded-lg border border-border bg-surface text-sm font-semibold"
            onClick={() => choose("keep")}
          >
            Keep the relic
          </button>
          <button
            type="button"
            disabled={outcome.reward === 0n}
            className="h-14 rounded-lg border border-border bg-bg text-sm font-semibold disabled:opacity-40"
            onClick={() => choose("redeem")}
          >
            Redeem {formatRf(outcome.reward)} RF
          </button>
          <button
            type="button"
            className="h-14 rounded-lg bg-primary text-sm font-semibold text-primary-fg"
            onClick={() => choose("scorch")}
          >
            <Flame className="mr-1 inline" size={16} />
            Burn payout · {burnHeatLabel(grade, shiftState.combo)}
          </button>
        </div>
      ) : phase === "sweep" ? (
        <button
          type="button"
          className="h-14 rounded-lg bg-primary text-base font-semibold text-primary-fg"
          onClick={() => finishSweep("tap")}
        >
          {blazeOn ? "Stamp the blaze" : "Stamp"}
        </button>
      ) : shiftState.cracked ? (
        <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr]">
          <button type="button" className="h-14 rounded-lg bg-primary text-sm font-semibold text-primary-fg" onClick={newShift}>
            New shift
            <span className="mt-0.5 block text-xs font-normal">Device best is kept either way</span>
          </button>
          <p className="flex items-center text-sm text-pretty text-muted">
            Three strikes. Post {shiftState.score.toLocaleString()} or start clean.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1.4fr]">
          <button
            type="button"
            disabled={phase !== "ready"}
            className="h-14 rounded-lg border border-border bg-surface text-sm font-semibold disabled:opacity-40"
            onClick={offer}
          >
            Offering
            <span className="mt-0.5 block text-xs font-normal text-muted">Burn {formatRf(OFFERING_COST)} RF</span>
          </button>
          <div className="flex h-14 items-center justify-center rounded-lg border border-border px-2 text-center text-xs text-muted">
            Stamp window {Math.round(windowWidth * 100)}%
          </div>
          <button
            type="button"
            className="col-span-2 h-14 rounded-lg bg-primary text-sm font-semibold text-primary-fg disabled:opacity-40 sm:col-span-1"
            onClick={stoke}
          >
            Stoke
            <span className="mt-0.5 block text-xs font-normal">Spend {formatRf(CINDER_GAME.price)} RF</span>
          </button>
        </div>
      )}

      {showYard ? (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-bg px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
            <button
              type="button"
              className="h-11 self-start rounded-lg border border-border bg-surface px-3 text-sm"
              onClick={() => setShowYard(false)}
            >
              Back to the furnace
            </button>
            <button
              type="button"
              className="h-11 self-start rounded-lg border border-border bg-surface px-3 text-sm"
              aria-pressed={reduced}
              onClick={() => {
                const next = !reduced;
                setReduced(next);
                saveRef.current.reduced = next;
                localStorage.setItem(SAVE_KEY, JSON.stringify(saveRef.current));
              }}
            >
              {reduced ? "Motion off" : "Motion on"}
            </button>
            <Board
              score={shiftState.score}
              best={best}
              rankTitle={rankFor(snap?.burned ?? 0n)}
              combo={shiftState.combo}
              callsign={callsign}
              onCallsign={setCallsign}
            />
            {snap && snap.inventory.some((count) => count > 0n) ? (
              <section className="rounded-xl border border-border bg-surface p-3">
                <h2 className="font-display text-lg">Kept relics</h2>
                <ul className="mt-2 grid gap-2">
                  {CINDER_GAME.outcomes.map((row, index) => {
                    const count = snap.inventory[index] ?? 0n;
                    if (count === 0n) return null;
                    return (
                      <li key={row.name} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span>
                          {row.name} × {count.toString()}
                          <span className="text-muted"> · {formatRf(row.reward)} RF</span>
                        </span>
                        <span className="flex gap-2">
                          <button
                            type="button"
                            className="h-11 rounded-lg border border-border px-3"
                            disabled={phase !== "ready" || row.reward === 0n}
                            onClick={() => actOnKept(index, "redeem")}
                          >
                            Redeem
                          </button>
                          <button
                            type="button"
                            className="h-11 rounded-lg border border-border px-3"
                            disabled={phase !== "ready"}
                            onClick={() => actOnKept(index, "scorch")}
                          >
                            Burn
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
            <details className="rounded-xl border border-border bg-surface p-3 text-sm" open>
              <summary className="cursor-pointer font-medium">Rules, odds, and burns</summary>
              <div className="mt-3 space-y-3 text-pretty text-muted">
                <p>
                  One ember costs {formatRf(CINDER_GAME.price)} RF from the Friend's simulated purse. The relic is locked
                  when the ember settles, using FriendSDK's 10,000-basis-point table. Expected redeem value is{" "}
                  {formatRf(EXPECTED_REWARD)} RF. Timing does not change the relic. A perfect stamp doubles burn heat, a
                  good stamp is normal, and a miss or a graze halves it. Perfects build a combo. At three, white heat
                  burns hotter. A graze just outside the band slips the combo without a strike. Three misses crack the
                  shift. Every fourth stoke is a blaze: faster needle, more shift points. Bounties pay bonus points.
                  Post a callsign to the furnace board. Each callsign keeps only its best shift.
                </p>
                <p>
                  Kindle burns {formatRf(KINDLE_COST)} RF to attune one other Friend for the next stoke (max {MAX_KINDLED}).
                  Lower generations widen the band more, because generation 1 is the heavy hardwire. An offering burns{" "}
                  {formatRf(OFFERING_COST)} RF for 4 heat and no prize. Scorch destroys that relic's payout instead of
                  paying the Friend. Redeem sends it back. Kept relics reserve their payout until you choose.
                </p>
                <p>
                  Connect MetaMask, then approve Robinhood Chain so your Generations can stand at the furnace. Spends and
                  burns in this build stay simulated. The house float starts at {formatRf(STARTING_STAKE)} RF and must cover
                  the {formatRf(MAX_PRIZE)} RF maximum prize.
                </p>
                <table className="w-full text-left text-fg">
                  <thead>
                    <tr className="text-muted">
                      <th className="py-1 font-medium">Relic</th>
                      <th className="py-1 font-medium">Chance</th>
                      <th className="py-1 font-medium">Redeem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CINDER_GAME.outcomes.map((row) => (
                      <tr key={row.name} className="border-t border-border">
                        <td className="py-1">{row.name}</td>
                        <td className="py-1 tabular-nums">{percentLabel(row.chanceBps)}</td>
                        <td className="py-1 tabular-nums">{formatRf(row.reward)} RF</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p>Space or the Stamp button locks the needle.</p>
                {snap && snap.log.length > 0 ? (
                  <ul>
                    {snap.log.map((event, index) => (
                      <li key={`${event.label}-${index}`}>
                        {event.kind} · {event.label} · {formatRf(event.amount)} RF
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button type="button" className="h-11 rounded-lg border border-border px-3 text-fg" onClick={resetPurse}>
                  Reset this simulated purse
                </button>
              </div>
            </details>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs tracking-wide text-muted uppercase">{label}</div>
      <div className="font-display text-xl tabular-nums text-fg">{value}</div>
    </div>
  );
}
