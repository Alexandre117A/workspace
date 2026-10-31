import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { config } from "./config";
import { Db } from "./db";

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
  kind: string;
  userId?: string | null;
}
export type MailStatus = "sent" | "failed" | "skipped";
export interface MailResult { status: MailStatus; configured: boolean; error?: string }

const FROM_RE = /^(?:[^<>@]*<\s*)?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+\s*>?$/;

/** Ce qui manque (ou est incohérent) dans la configuration d'envoi, en clair. Aucun secret n'est jamais renvoyé. */
export function mailDiagnosis() {
  const m = config.mail;
  const problems: string[] = [];
  let host = m.host;
  if (m.smtpUrl) { try { host = new URL(m.smtpUrl).host; } catch { problems.push("SMTP_URL n'est pas une adresse valide (ex. smtp://identifiant:cle@hote:587)."); } }
  if (m.provider === "smtp") {
    if (!m.smtpUrl && !m.host) problems.push("Aucun serveur SMTP : définissez SMTP_URL, ou SMTP_HOST (avec SMTP_PORT, SMTP_USER, SMTP_PASS).");
    if (!m.from) problems.push("GEONEX_MAIL_FROM est vide : indiquez l'expéditeur, ex. GEONEX <no-reply@votre-domaine>.");
    else if (!FROM_RE.test(m.from)) problems.push("GEONEX_MAIL_FROM n'est pas une adresse valide (ex. GEONEX <no-reply@votre-domaine>).");
    if (!/^https:\/\//.test(config.publicUrl) && process.env.NODE_ENV === "production") problems.push("GEONEX_PUBLIC_URL devrait être l'adresse https publique du service : les liens des e-mails en dépendent.");
  }
  const configured = m.provider === "smtp" && !problems.some((p) => !p.startsWith("GEONEX_PUBLIC_URL"));
  return { provider: m.provider, configured, from: m.from || null, host: host || null, publicUrl: config.publicUrl, problems };
}

/** Transport SMTP (délais courts : un fournisseur injoignable ne doit jamais bloquer une inscription plus de quelques secondes). */
export function smtpTransport() {
  const nodemailer = require("nodemailer");
  const m = config.mail;
  const timeouts = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };
  return nodemailer.createTransport(m.smtpUrl
    ? { url: m.smtpUrl, ...timeouts }
    : { host: m.host, port: m.port, secure: m.secure, auth: m.user ? { user: m.user, pass: m.pass } : undefined, ...timeouts });
}

/**
 * Envoi des e-mails transactionnels. Trois états honnêtes, toujours consignés dans `email_outbox` :
 *  - `sent`    : le serveur SMTP a accepté le message ;
 *  - `failed`  : l'envoi a échoué (le compte, lui, n'est jamais supprimé) ;
 *  - `skipped` : aucun fournisseur n'est configuré (rien n'est annoncé comme envoyé).
 * Le fournisseur « log » (développement et tests) écrit le message dans le journal du serveur et le garde en mémoire : il ne prétend
 * pas avoir envoyé un vrai e-mail (état `skipped`, `configured: false`).
 */
@Injectable()
export class Mailer {
  private readonly log = new Logger("Mailer");
  private transport: any = null;
  /** Derniers messages (fournisseur « log » seulement) : sert aux tests et au développement. */
  readonly captured: Mail[] = [];
  private failures = 0;

  constructor(private readonly db: Db) {}

  get provider(): string {
    return config.mail.provider;
  }

  get configured(): boolean {
    return mailDiagnosis().configured;
  }

  /** Faux après trois échecs d'envoi consécutifs : les règles qui dépendent des e-mails (adresse vérifiée exigée) se suspendent alors d'elles-mêmes. */
  get healthy(): boolean {
    return this.failures < 3;
  }

  diagnose() {
    return { ...mailDiagnosis(), healthy: this.healthy, consecutiveFailures: this.failures };
  }

  /** Poignée de main SMTP avec authentification, sans envoyer de message : confirme que l'hôte, le port et les identifiants sont bons. */
  async verify(): Promise<{ ok: boolean; error?: string }> {
    if (!this.configured) return { ok: false, error: "Aucun fournisseur SMTP configuré." };
    try {
      this.transport ??= smtpTransport();
      await this.transport.verify();
      this.failures = 0;
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: String(err?.code ?? err?.message ?? "erreur").slice(0, 200) };
    }
  }

  async send(mail: Mail): Promise<MailResult> {
    const id = randomUUID();
    const record = (status: MailStatus, error?: string) =>
      this.db.query("INSERT INTO email_outbox(id, user_id, kind, to_email, status, error, sent_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [id, mail.userId ?? null, mail.kind, mail.to, status, error ?? null, status === "sent" ? new Date().toISOString() : null]);
    if (config.mail.provider === "log") {
      this.captured.push(mail);
      if (this.captured.length > 100) this.captured.shift();
      this.log.log(`[e-mail simulé — non envoyé] ${mail.kind} → ${mail.to} : ${mail.subject}\n${mail.text}`);
      await record("skipped", "fournisseur de développement");
      return { status: "skipped", configured: false };
    }
    if (!this.configured) {
      await record("skipped", "aucun fournisseur d'e-mail configuré");
      return { status: "skipped", configured: false };
    }
    try {
      this.transport ??= smtpTransport();
      await this.transport.sendMail({
        from: config.mail.from, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text,
        ...(config.mail.replyTo ? { replyTo: config.mail.replyTo } : {}),
        headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" }, // message transactionnel : pas de réponse automatique en boucle
      });
      this.failures = 0;
      await record("sent");
      return { status: "sent", configured: true };
    } catch (err: any) {
      const code = String(err?.code ?? err?.message ?? "erreur").slice(0, 200);
      this.log.warn(`Échec d'envoi (${mail.kind}) : ${code}`);
      this.failures++;
      this.transport = null; // connexion peut-être périmée : on la recrée au prochain envoi
      await record("failed", code);
      return { status: "failed", configured: true, error: code };
    }
  }
}
