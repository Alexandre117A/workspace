/**
 * Limitation de débit par adresse IP, en mémoire (sans dépendance) : protège un site public contre la création massive
 * de comptes invités et les rafales de requêtes. Les connexions temps réel (Socket.IO) ne sont pas concernées.
 * Désactivable avec GEONEX_RATE_LIMIT=off (tests automatisés).
 */
type Req = { ip?: string; method: string; path: string; headers: Record<string, any> };
type Res = { status(code: number): Res; set(name: string, value: string): Res; json(body: unknown): void };

interface Rule {
  name: string;
  windowMs: number;
  max: number;
  match: (req: Req) => boolean;
}

const RULES: Rule[] = [
  // Création de comptes / connexions : 60 par minute et par IP (une classe entière derrière la même adresse reste possible).
  { name: "auth", windowMs: 60_000, max: 60, match: (r) => r.method === "POST" && r.path.startsWith("/api/auth/") },
  // Création de sessions et de simulations : coûteuses pour le moteur.
  { name: "create", windowMs: 60_000, max: 40, match: (r) => r.method === "POST" && (r.path === "/api/sessions" || r.path.startsWith("/api/scenarios/")) },
  // Tout le reste de l'API (hors santé) : large, pour ne gêner personne.
  { name: "api", windowMs: 60_000, max: 1500, match: (r) => r.path.startsWith("/api/") && r.path !== "/api/health" },
];

export function rateLimiter() {
  if (process.env.GEONEX_RATE_LIMIT === "off") return (_req: unknown, _res: unknown, next: () => void) => next();
  const hits = new Map<string, { count: number; reset: number }>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, 60_000);
  sweep.unref();
  return (req: Req, res: Res, next: () => void) => {
    const now = Date.now();
    const ip = req.ip ?? "?";
    for (const rule of RULES) {
      if (!rule.match(req)) continue;
      const key = `${rule.name}:${ip}`;
      const slot = hits.get(key);
      if (!slot || slot.reset <= now) {
        hits.set(key, { count: 1, reset: now + rule.windowMs });
        continue;
      }
      if (++slot.count > rule.max) {
        res.set("retry-after", String(Math.ceil((slot.reset - now) / 1000)));
        res.status(429).json({ statusCode: 429, error: "Too Many Requests", message: "Trop de requêtes : patientez quelques instants avant de réessayer." });
        return;
      }
    }
    next();
  };
}
