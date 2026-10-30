import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { RuntimeState } from "@geonex/shared";
import { API_URL, getToken } from "./api";

export interface Ack<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface GameState {
  connected: boolean;
  denied: string | null;
  lobby: any | null;
  runtime: (RuntimeState & { busy?: string[] }) | null;
  offset: number;
  view: any | null;
  dossier: any | null;
  report: any | null;
  messages: any[];
  invites: any[];
  rome: any | null;
  requests: any[];
  lastRound: { round: number; message: string } | null;
  ended: { sessionId: string; cinematic: string } | null;
}

const initial: GameState = {
  connected: false, denied: null, lobby: null, runtime: null, offset: 0, view: null, dossier: null, report: null, messages: [], invites: [],
  rome: null, requests: [], lastRound: null, ended: null,
};

type Action =
  | { t: "connected"; v: boolean }
  | { t: "denied"; v: string }
  | { t: "state"; v: any }
  | { t: "runtime"; v: any }
  | { t: "view"; v: any }
  | { t: "lobby"; v: any }
  | { t: "message"; v: any }
  | { t: "invite"; v: any }
  | { t: "rome"; v: any }
  | { t: "romeClear" }
  | { t: "report"; v: any }
  | { t: "requests"; v: any[] }
  | { t: "lastRound"; v: any }
  | { t: "lastRoundSeen" }
  | { t: "ended"; v: any };

function reducer(s: GameState, a: Action): GameState {
  switch (a.t) {
    case "connected":
      return { ...s, connected: a.v };
    case "denied":
      return { ...s, denied: a.v };
    case "state": {
      const { runtime, view, dossier, report, ...lobby } = a.v;
      return { ...s, lobby, runtime: runtime ?? s.runtime, offset: runtime ? runtime.serverNow - Date.now() : s.offset, view: view ?? s.view, dossier: dossier ?? s.dossier, report: report ?? s.report };
    }
    case "runtime":
      return { ...s, runtime: a.v, offset: a.v.serverNow - Date.now(), rome: a.v.overlay ? s.rome : null };
    case "view":
      return { ...s, view: a.v };
    case "lobby":
      return a.v.participants && s.lobby ? { ...s, lobby: { ...s.lobby, participants: a.v.participants } } : s;
    case "message":
      return { ...s, messages: [...s.messages.slice(-300), a.v] };
    case "invite": {
      const others = s.invites.filter((i) => i.id !== a.v.id);
      return { ...s, invites: [...others, a.v] };
    }
    case "rome":
      return { ...s, rome: a.v };
    case "romeClear":
      return { ...s, rome: null };
    case "report":
      return { ...s, report: a.v };
    case "requests":
      return { ...s, requests: a.v };
    case "lastRound":
      return { ...s, lastRound: a.v };
    case "lastRoundSeen":
      return { ...s, lastRound: null };
    case "ended":
      return { ...s, ended: a.v };
  }
}

/** Connexion temps réel à une session ; reconnexion automatique avec resynchronisation complète. */
export function useGame(sessionId: string | undefined) {
  const [state, dispatch] = useReducer(reducer, initial);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const socket = io(`${API_URL}/game`, {
      auth: { token: getToken(), sessionId },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;
    socket.on("connect", () => dispatch({ t: "connected", v: true }));
    socket.on("disconnect", () => dispatch({ t: "connected", v: false }));
    socket.on("error_message", (e) => dispatch({ t: "denied", v: e.message }));
    socket.on("state", (v) => dispatch({ t: "state", v }));
    socket.on("runtime", (v) => dispatch({ t: "runtime", v }));
    socket.on("view", (v) => dispatch({ t: "view", v }));
    socket.on("lobby", (v) => {
      dispatch({ t: "lobby", v });
      if (v.started || v.roleChanged) socket.emit("sync");
    });
    socket.on("message", (v) => dispatch({ t: "message", v }));
    socket.on("invite", (v) => dispatch({ t: "invite", v }));
    socket.on("rome", (v) => dispatch({ t: "rome", v }));
    socket.on("report", (v) => dispatch({ t: "report", v }));
    socket.on("requests", (v) => dispatch({ t: "requests", v }));
    socket.on("last_round", (v) => dispatch({ t: "lastRound", v }));
    socket.on("ended", (v) => dispatch({ t: "ended", v }));
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionId]);

  const emit = useCallback(<T = any>(event: string, payload?: unknown): Promise<Ack<T>> => {
    return new Promise((resolve) => {
      const s = socketRef.current;
      if (!s?.connected) return resolve({ ok: false, error: "Connexion interrompue — reconnexion en cours." });
      s.timeout(15000).emit(event, payload, (err: unknown, res: Ack<T>) => resolve(err ? { ok: false, error: "Le serveur n'a pas répondu." } : res));
    });
  }, []);

  const ackRome = useCallback(async () => {
    const r = await emit("rome:ack");
    if (r.ok) dispatch({ t: "romeClear" });
    return r;
  }, [emit]);

  const dismissLastRound = useCallback(() => dispatch({ t: "lastRoundSeen" }), []);

  return { state, emit, ackRome, dismissLastRound };
}

/** Horloge locale corrigée du décalage serveur (le serveur fait foi). */
export function useNow(intervalMs = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function remaining(deadline: number | null | undefined, offset: number, now: number): number | null {
  if (!deadline) return null;
  return Math.max(0, deadline - (now + offset));
}

export function fmtClock(ms: number | null): string {
  if (ms === null) return "--:--";
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
