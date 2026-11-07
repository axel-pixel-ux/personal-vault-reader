import nodemailer from 'nodemailer';

export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  const port = Number(SMTP_PORT ?? 465);
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: SMTP_SECURE ? SMTP_SECURE === 'true' : port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

/** Envoie l'e-mail de réinitialisation de mot de passe. */
export async function sendPasswordResetMail(to: string, link: string): Promise<void> {
  const transporter = createTransporter();
  if (!transporter) {
    throw new Error('smtp_not_configured');
  }
  const from = process.env.SMTP_FROM || `"Folio" <${process.env.SMTP_USER}>`;
  await transporter.sendMail({
    from,
    to,
    subject: 'Folio — Réinitialisation de votre mot de passe',
    text:
      `Bonjour,\n\n` +
      `Vous avez demandé à réinitialiser votre mot de passe Folio.\n\n` +
      `Cliquez sur ce lien (valable 1 heure) pour choisir un nouveau mot de passe :\n${link}\n\n` +
      `Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail.`,
    html: `
      <div style="font-family: Georgia, serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #1c1917; background: #faf8f5; border: 1px solid #e7e2da; border-radius: 12px;">
        <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: #78716c; margin: 0 0 8px;">Folio — Bibliothèque personnelle</p>
        <h2 style="font-size: 22px; font-weight: 600; margin: 0 0 16px;">Réinitialisation de votre mot de passe</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #44403c; margin: 0 0 24px;">
          Vous avez demandé à définir un nouveau mot de passe pour votre compte Folio. Cliquez sur le bouton ci-dessous (lien valable pendant <strong>1 heure</strong>) :
        </p>
        <p style="margin: 0 0 24px;">
          <a href="${link}" style="display: inline-block; background: #1c1917; color: #faf8f5; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-size: 14px; font-weight: 600;">
            Choisir un nouveau mot de passe
          </a>
        </p>
        <p style="font-size: 12px; line-height: 1.5; color: #78716c; word-break: break-all; margin: 0 0 16px;">
          Ou copiez ce lien dans votre navigateur :<br/>
          <a href="${link}" style="color: #57534e;">${link}</a>
        </p>
        <hr style="border: 0; border-top: 1px solid #e7e2da; margin: 20px 0;" />
        <p style="font-size: 12px; color: #a8a29e; margin: 0;">
          Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message.
        </p>
      </div>
    `,
  });
}
