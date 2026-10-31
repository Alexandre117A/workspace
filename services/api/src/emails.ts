import { config } from "./config";

/**
 * Modèles d'e-mails GEONEX : HTML compatible Gmail et Outlook (tableaux, styles en ligne, aucune image lourde) et version texte.
 * Identité Atlas stratégique : en-tête bleu marine avec le globe, surface ivoire, filets fins, accents bleu atlas et or.
 */
const NAVY = "#10233D", ATLAS = "#284D74", BRASS = "#B89A5D", IVORY = "#F3F0E9", INK = "#1B2430", STONE = "#6B7684";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

interface Layout { preheader: string; title: string; intro?: string; blocks?: { label: string; text: string }[]; paragraphs?: string[]; cta?: { label: string; url: string }; note?: string }

function page(l: Layout): string {
  const base = config.publicUrl;
  const blocks = (l.blocks ?? []).map((b) => `
      <tr><td style="padding:14px 0;border-top:1px solid #DDD6C5;">
        <div style="font:600 11px Arial,sans-serif;letter-spacing:2px;color:${BRASS};text-transform:uppercase;">${esc(b.label)}</div>
        <div style="font:15px/22px Georgia,serif;color:${INK};padding-top:4px;">${esc(b.text)}</div>
      </td></tr>`).join("");
  const paragraphs = (l.paragraphs ?? []).map((p) => `<p style="margin:0 0 14px;font:16px/24px Georgia,serif;color:${INK};">${esc(p)}</p>`).join("");
  const cta = l.cta ? `
      <tr><td align="center" style="padding:26px 0 8px;">
        <a href="${esc(l.cta.url)}" style="display:inline-block;background:${NAVY};color:#FFFFFF;font:600 13px Arial,sans-serif;letter-spacing:2px;text-decoration:none;padding:15px 30px;border-bottom:3px solid ${BRASS};">${esc(l.cta.label)}</a>
      </td></tr>
      <tr><td align="center" style="font:12px/18px Arial,sans-serif;color:${STONE};padding-bottom:10px;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><a href="${esc(l.cta.url)}" style="color:${ATLAS};word-break:break-all;">${esc(l.cta.url)}</a></td></tr>` : "";
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(l.title)}</title></head>
<body style="margin:0;padding:0;background:#E7E3D8;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(l.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E7E3D8;"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FAF9F6;border:1px solid #D7CFBA;">
    <tr><td style="background:${NAVY};padding:22px 28px;border-bottom:3px solid ${BRASS};">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:14px;"><img src="${esc(base)}/apple-touch-icon.png" width="44" height="44" alt="GEONEX" style="display:block;border:0;border-radius:22px;"></td>
        <td style="font:600 22px Arial,sans-serif;letter-spacing:7px;color:${IVORY};">GEONEX</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:32px 28px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="font:600 26px/32px Georgia,serif;color:${NAVY};padding-bottom:14px;">${esc(l.title)}</td></tr>
        ${l.intro ? `<tr><td style="font:italic 17px/26px Georgia,serif;color:${ATLAS};padding-bottom:18px;">${esc(l.intro)}</td></tr>` : ""}
        <tr><td>${paragraphs}</td></tr>
        ${blocks}
        ${cta}
        ${l.note ? `<tr><td style="padding-top:18px;border-top:1px solid #DDD6C5;font:13px/20px Arial,sans-serif;color:${STONE};">${esc(l.note)}</td></tr>` : ""}
      </table>
    </td></tr>
    <tr><td style="padding:22px 28px 28px;">
      <div style="font:600 12px Arial,sans-serif;letter-spacing:2px;color:${NAVY};">GEONEX</div>
      <div style="font:italic 13px Georgia,serif;color:${STONE};padding-top:2px;">Comprendre le monde. Simuler ses transformations.</div>
      <div style="font:11px/17px Arial,sans-serif;color:${STONE};padding-top:12px;">Plateforme gratuite, sans publicité. Vous recevez ce message parce qu'une action a été effectuée avec votre adresse e-mail sur GEONEX. ${esc(base)}</div>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

function text(l: Layout): string {
  return [l.title, "", l.intro ?? "", ...(l.paragraphs ?? []), ...(l.blocks ?? []).flatMap((b) => ["", b.label.toUpperCase(), b.text]), l.cta ? `\n${l.cta.label} : ${l.cta.url}` : "", l.note ? `\n${l.note}` : "", "\nL'équipe GEONEX\nComprendre le monde. Simuler ses transformations.", config.publicUrl]
    .filter((x) => x !== undefined).join("\n").replace(/\n{3,}/g, "\n\n");
}

export interface Rendered { subject: string; html: string; text: string }
const build = (subject: string, l: Layout): Rendered => ({ subject, html: page(l), text: text(l) });

/** Bienvenue + vérification de l'adresse dans un seul message (évite une succession inutile d'e-mails). */
export function welcomeEmail(p: { pseudonym: string; verifyUrl: string }): Rendered {
  return build("Bienvenue sur GEONEX — Votre aventure géopolitique commence.", {
    preheader: "Votre inscription a bien été prise en compte. Confirmez votre adresse pour activer votre compte.",
    title: `Bienvenue sur GEONEX, ${p.pseudonym} !`,
    intro: "Votre inscription a bien été prise en compte.",
    paragraphs: [
      "Vous rejoignez désormais une plateforme consacrée à l'exploration de l'histoire, des relations internationales et des grandes décisions géopolitiques.",
      "Avec GEONEX, vous pouvez :",
    ],
    blocks: [
      { label: "Comprendre", text: "Explorer les grandes crises historiques et contemporaines, identifier leurs acteurs et découvrir les rapports de force qui façonnent les événements." },
      { label: "Simuler", text: "Incarner un État, participer à des négociations, confronter des stratégies et prendre part à des situations géopolitiques complexes." },
      { label: "Décider", text: "Prendre des décisions politiques, diplomatiques ou stratégiques et observer leurs conséquences dans un monde en évolution." },
    ],
    cta: { label: "ACCÉDER À MON ESPACE GEONEX", url: p.verifyUrl },
    note: "Ce lien confirme votre adresse e-mail ; il est personnel, valable 48 heures et ne peut servir qu'une fois. Vous pouvez dès maintenant découvrir les scénarios, rejoindre une session ou créer votre propre simulation. Bienvenue dans GEONEX.",
  });
}

export function verifyEmail(p: { pseudonym: string; verifyUrl: string; change?: boolean }): Rendered {
  return build(p.change ? "GEONEX — Confirmez votre nouvelle adresse e-mail" : "GEONEX — Confirmez votre adresse e-mail", {
    preheader: "Confirmez que cette adresse vous appartient.",
    title: p.change ? "Confirmez votre nouvelle adresse" : "Confirmez votre adresse e-mail",
    paragraphs: [`Bonjour ${p.pseudonym},`, p.change ? "Vous avez demandé à utiliser cette adresse pour votre compte GEONEX. Confirmez-la pour finaliser le changement." : "Confirmez que cette adresse vous appartient pour activer votre compte GEONEX."],
    cta: { label: "CONFIRMER MON ADRESSE", url: p.verifyUrl },
    note: "Ce lien est personnel, valable 48 heures et à usage unique. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : rien ne sera modifié.",
  });
}

export function resetEmail(p: { pseudonym: string; resetUrl: string }): Rendered {
  return build("GEONEX — Réinitialisation de votre mot de passe", {
    preheader: "Un lien temporaire pour choisir un nouveau mot de passe.",
    title: "Réinitialiser votre mot de passe",
    paragraphs: [`Bonjour ${p.pseudonym},`, "Une réinitialisation du mot de passe a été demandée pour votre compte GEONEX. Cliquez sur le bouton pour en choisir un nouveau."],
    cta: { label: "CHOISIR UN NOUVEAU MOT DE PASSE", url: p.resetUrl },
    note: "Ce lien expire dans une heure et ne peut servir qu'une fois. Si vous n'avez rien demandé, ignorez ce message : votre mot de passe actuel reste valable. GEONEX ne vous enverra jamais votre mot de passe par e-mail.",
  });
}

/** Message de test de la configuration d'envoi (page d'administration et script `npm run mail:test`). */
export function testEmail(p: { to: string }): Rendered {
  return build("GEONEX — Test d'envoi d'e-mails", {
    preheader: "Si vous lisez ce message, l'envoi d'e-mails de GEONEX fonctionne.",
    title: "L'envoi d'e-mails fonctionne.",
    paragraphs: [`Ce message a été envoyé à ${p.to} pour vérifier la configuration de GEONEX : fournisseur, expéditeur et adresse publique.`, "Vérifiez qu'il n'est pas arrivé dans les courriers indésirables, et que l'expéditeur affiché est bien le vôtre."],
    cta: { label: "OUVRIR GEONEX", url: config.publicUrl },
    note: "Message technique, sans action à effectuer.",
  });
}

export function inviteEmail(p: { from: string; session: string; url: string }): Rendered {
  return build(`${p.from} vous invite à rejoindre une simulation GEONEX`, {
    preheader: `${p.from} vous invite à participer à « ${p.session} ».`,
    title: "Vous êtes invité à rejoindre une simulation GEONEX.",
    paragraphs: [`Le joueur ${p.from} vous invite à participer à :`],
    blocks: [{ label: "Simulation", text: p.session }],
    cta: { label: "REJOINDRE LA SIMULATION", url: p.url },
    note: "Vous devrez vous connecter, ou créer un compte gratuit, pour rejoindre la session. Cette invitation expire dans 7 jours. Si vous ne connaissez pas cette personne, ignorez ce message.",
  });
}
