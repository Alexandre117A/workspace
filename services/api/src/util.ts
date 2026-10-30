import { BadRequestException, HttpException, HttpStatus } from "@nestjs/common";
import { randomInt } from "node:crypto";
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from "@geonex/shared";
import type { ZodType } from "zod";

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".") || "entrée"} : ${i.message}`).join(" ; ");
    throw new BadRequestException(msg);
  }
  return r.data;
}

/** Code d'invitation difficile à deviner : 31^10 ≈ 8·10^14 combinaisons. */
export function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  return code;
}

const EMBLEMS = ["▲", "◆", "●", "■", "✶", "⬢", "◈", "✦", "⬟", "◉", "✚", "⬣", "◐", "✧", "⬤", "◇"];
export function emblemFor(index: number): string {
  return EMBLEMS[index % EMBLEMS.length];
}

/** Limiteur simple de tentatives (codes d'invitation, connexion). */
export class AttemptLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly max: number, private readonly windowMs: number) {}

  check(key: string): void {
    const now = Date.now();
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    this.hits.set(key, list);
    if (list.length >= this.max) {
      throw new HttpException("Trop de tentatives. Réessayez dans quelques minutes.", HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  fail(key: string): void {
    const list = this.hits.get(key) ?? [];
    list.push(Date.now());
    this.hits.set(key, list);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}

export function seedFromUuid(id: string): number {
  return parseInt(id.replace(/-/g, "").slice(0, 8), 16);
}
