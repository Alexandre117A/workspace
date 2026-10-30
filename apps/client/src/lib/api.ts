import { Platform } from "react-native";

/**
 * Adresse du backend : EXPO_PUBLIC_API_URL (local, test, production).
 * Par défaut sur le web : même hôte, port 4000. Sur un téléphone, définir
 * EXPO_PUBLIC_API_URL avec l'adresse IP de l'ordinateur (voir docs/DEVELOPPEMENT.md).
 */
function defaultUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, "");
  if (Platform.OS === "web" && typeof location !== "undefined") return `${location.protocol}//${location.hostname}:4000`;
  return "http://localhost:4000";
}

export const API_URL = defaultUrl();

let token: string | null = null;
export function setToken(t: string | null) {
  token = t;
}
export function getToken() {
  return token;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError("Serveur GEONEX injoignable. Vérifiez votre connexion.", 0);
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join(" ") : data?.message ?? `Erreur ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}
