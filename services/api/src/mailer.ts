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
export interface MailResult { status: MailStatus; configured: boolean }

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

  constructor(private readonly db: Db) {}

  get provider(): string {
    return config.mail.provider;
  }

  get configured(): boolean {
    return config.mail.provider === "smtp" && !!config.mail.from && !!(config.mail.smtpUrl || config.mail.host);
  }

  private smtp() {
    if (!this.transport) {
      const nodemailer = require("nodemailer");
      const m = config.mail;
      this.transport = nodemailer.createTransport(m.smtpUrl || { host: m.host, port: m.port, secure: m.secure, auth: m.user ? { user: m.user, pass: m.pass } : undefined });
    }
    return this.transport;
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
      await this.smtp().sendMail({ from: config.mail.from, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text });
      await record("sent");
      return { status: "sent", configured: true };
    } catch (err: any) {
      this.log.warn(`Échec d'envoi (${mail.kind}) : ${err?.code ?? err?.message ?? err}`);
      await record("failed", String(err?.code ?? err?.message ?? "erreur").slice(0, 200));
      return { status: "failed", configured: true };
    }
  }
}
