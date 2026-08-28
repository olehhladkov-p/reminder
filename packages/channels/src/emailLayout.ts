export interface EmailLayoutOptions {
  /** Short preview text shown next to the subject in most inboxes. */
  preheader?: string
  heading: string
  /** Pre-rendered inner HTML - callers are responsible for escaping any interpolated content. */
  bodyHtml: string
  cta?: { label: string; url: string }
  footerNote?: string
}

/**
 * Shared inline-styled wrapper for both the auth (magic-link) email and the
 * reminder notification emails, so a signed-in user's inbox sees one
 * consistent "Subscription Reminder" identity rather than two ad-hoc designs.
 * Inline styles only - email clients don't reliably support <style> blocks.
 */
export function renderEmailLayout(options: EmailLayoutOptions): string {
  const cta = options.cta
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 28px 0;">
        <tr>
          <td style="border-radius: 8px; background: #111827;">
            <a href="${options.cta.url}" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 15px;">${options.cta.label}</a>
          </td>
        </tr>
      </table>`
    : ''

  return `
<!doctype html>
<html>
  <body style="margin: 0; padding: 0; background: #f4f4f5;">
    ${options.preheader ? `<span style="display: none; max-height: 0; overflow: hidden;">${options.preheader}</span>` : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f4f4f5; padding: 32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width: 480px; width: 100%; background: #ffffff; border-radius: 12px; padding: 32px;">
            <tr>
              <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                <p style="margin: 0 0 20px; font-size: 13px; font-weight: 700; letter-spacing: 0.02em; color: #6b7280; text-transform: uppercase;">Subscription Reminder</p>
                <h1 style="margin: 0 0 12px; font-size: 20px; color: #111827;">${options.heading}</h1>
                <div style="font-size: 15px; line-height: 1.6; color: #374151;">${options.bodyHtml}</div>
                ${cta}
                ${options.footerNote ? `<p style="margin: 24px 0 0; font-size: 13px; color: #9ca3af;">${options.footerNote}</p>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim()
}
