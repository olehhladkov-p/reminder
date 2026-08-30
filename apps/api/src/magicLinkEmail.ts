import { renderEmailLayout } from '@reminder/channels'
import { Resend } from 'resend'
import { env } from './env.js'

export async function sendMagicLinkEmail(email: string, url: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    throw new Error(
      'sendMagicLinkEmail: RESEND_API_KEY/RESEND_FROM_EMAIL are not set. Set DEV_LOG_MAGIC_LINK=true for local development instead.',
    )
  }
  const resend = new Resend(env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: `Subscription Reminder <${env.RESEND_FROM_EMAIL}>`,
    to: email,
    subject: 'Your sign-in link',
    html: renderEmailLayout({
      preheader: 'Tap the button below to sign in - this link expires in 5 minutes.',
      heading: 'Sign in to Subscription Reminder',
      bodyHtml: `<p style="margin: 0;">Tap the button below to finish signing in as <strong>${email}</strong>.</p>`,
      cta: { label: 'Sign in', url },
      footerNote:
        "This link expires in 5 minutes and can only be used once. If you didn't request it, you can safely ignore this email.",
    }),
  })
  if (error) {
    throw new Error(`sendMagicLinkEmail: ${error.message}`)
  }
}
