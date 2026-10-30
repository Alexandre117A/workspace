import { useEffect, useState } from "react";
import { router } from "expo-router";
import { api } from "./api";
import { useAuth } from "./auth";

export interface AppConfig {
  minDurationMinutes: number;
  recommendation: string;
  features: { engine: boolean; ai: boolean; research: boolean; voice: boolean; ads: boolean; demo: boolean };
}

let cached: AppConfig | null = null;

/** Fonctionnalités réellement disponibles côté serveur (jamais simulées dans l'interface). */
export function useConfig() {
  const [cfg, setCfg] = useState<AppConfig | null>(cached);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<AppConfig>("/config").then((c) => { cached = c; setCfg(c); }).catch((e) => setError(e.message));
  }, []);
  return { cfg, error };
}

/** Redirige vers l'identification si nécessaire, puis revient à l'écran demandé. */
export function useRequireAuth(next: string) {
  const { user, ready } = useAuth();
  useEffect(() => {
    if (ready && !user) router.replace({ pathname: "/auth", params: { next } });
  }, [ready, user, next]);
  return user;
}
