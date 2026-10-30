import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setToken } from "./api";
import { storage } from "./storage";

export interface User {
  id: string;
  displayName: string;
  role: "user" | "owner";
  isGuest: boolean;
  email?: string | null;
}

interface AuthState {
  ready: boolean;
  user: User | null;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string, displayName: string): Promise<void>;
  guest(displayName: string): Promise<void>;
  upgrade(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);
const KEY = "geonex.token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    (async () => {
      const t = await storage.get(KEY);
      if (t) {
        setToken(t);
        try {
          setUser(await api<User>("/auth/me"));
        } catch {
          setToken(null);
          await storage.remove(KEY);
        }
      }
      setReady(true);
    })();
  }, []);

  const accept = useCallback(async (res: { token: string; user: User }) => {
    setToken(res.token);
    await storage.set(KEY, res.token);
    setUser(res.user);
  }, []);

  const value = useMemo<AuthState>(() => ({
    ready,
    user,
    login: async (email, password) => accept(await api("/auth/login", { body: { email, password } })),
    register: async (email, password, displayName) => accept(await api("/auth/register", { body: { email, password, displayName } })),
    guest: async (displayName) => accept(await api("/auth/guest", { body: { displayName } })),
    upgrade: async (email, password) => accept(await api("/auth/upgrade", { body: { email, password } })),
    logout: async () => {
      setToken(null);
      await storage.remove(KEY);
      setUser(null);
    },
  }), [ready, user, accept]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider manquant");
  return v;
}
