import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { api, setToken } from "./api";
import { storage } from "./storage";

export interface User {
  id: string;
  displayName: string;
  role: "user" | "owner";
  isGuest: boolean;
  email?: string | null;
  emailVerified?: boolean;
  avatarColor?: string;
  createdAt?: string;
  notifications?: { invitations: boolean; product: boolean };
  discoverable?: boolean;
  mail?: { configured: boolean };
  requireVerified?: boolean;
}

export interface RegisterInput { email: string; pseudonym: string; password: string; passwordConfirm: string; acceptTerms: true }
export interface MailState { status: "sent" | "failed" | "skipped"; configured: boolean }

interface AuthState {
  ready: boolean;
  user: User | null;
  login(email: string, password: string, remember?: boolean): Promise<void>;
  register(input: RegisterInput): Promise<MailState>;
  guest(displayName: string): Promise<void>;
  upgrade(input: RegisterInput): Promise<MailState>;
  /** Relit le compte sur le serveur (statut de vérification, profil). */
  refresh(): Promise<void>;
  /** Remplace le jeton après un changement de profil ou de mot de passe (les anciens jetons sont révoqués côté serveur). */
  replaceToken(token: string): Promise<void>;
  logout(): Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);
const KEY = "geonex.token";
const web = Platform.OS === "web";

/** « Rester connecté » : sur le web, sans cette option le jeton ne survit pas à la fermeture du navigateur (sessionStorage). */
async function saveToken(token: string, remember: boolean) {
  if (web && !remember) {
    try { globalThis.sessionStorage?.setItem(KEY, token); } catch { /* ignoré */ }
    await storage.remove(KEY);
  } else {
    await storage.set(KEY, token);
    if (web) try { globalThis.sessionStorage?.removeItem(KEY); } catch { /* ignoré */ }
  }
}
async function loadToken(): Promise<string | null> {
  if (web) try { const s = globalThis.sessionStorage?.getItem(KEY); if (s) return s; } catch { /* ignoré */ }
  return storage.get(KEY);
}
async function clearToken() {
  await storage.remove(KEY);
  if (web) try { globalThis.sessionStorage?.removeItem(KEY); } catch { /* ignoré */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    (async () => {
      const t = await loadToken();
      if (t) {
        setToken(t);
        try {
          setUser(await api<User>("/auth/me"));
        } catch {
          setToken(null);
          await clearToken();
        }
      }
      setReady(true);
    })();
  }, []);

  const accept = useCallback(async (res: { token: string; user: User }, remember = true) => {
    setToken(res.token);
    await saveToken(res.token, remember);
    setUser(res.user);
    try { setUser(await api<User>("/auth/me")); } catch { /* la réponse d'ouverture de session suffit */ }
  }, []);

  const value = useMemo<AuthState>(() => ({
    ready,
    user,
    login: async (email, password, remember = false) => accept(await api("/auth/login", { body: { email, password, remember } }), remember),
    register: async (input) => {
      const res = await api<{ token: string; user: User; email: MailState }>("/auth/register", { body: input });
      await accept(res, true);
      return res.email;
    },
    guest: async (displayName) => accept(await api("/auth/guest", { body: { displayName } })),
    upgrade: async (input) => {
      const res = await api<{ token: string; user: User; email: MailState }>("/auth/upgrade", { body: input });
      await accept(res, true);
      return res.email;
    },
    refresh: async () => setUser(await api<User>("/auth/me")),
    replaceToken: async (token) => {
      setToken(token);
      await saveToken(token, true);
      setUser(await api<User>("/auth/me"));
    },
    logout: async () => {
      setToken(null);
      await clearToken();
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

/** Messages d'erreur du serveur sans le préfixe technique du champ (« pseudonym : … »). */
export function cleanMessage(msg: string): string {
  return msg.split(" ; ").map((m) => m.replace(/^[\w.]+ : /, "")).join(" ");
}
