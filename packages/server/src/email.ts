import { Resend } from 'resend';
import type { ServerConfig } from './config.ts';
import { log } from './log.ts';

export interface Mail {
	to: string;
	subject: string;
	html: string;
	text: string;
}

export interface Mailer {
	send(mail: Mail): Promise<void>;
}

export function createMailer(cfg: ServerConfig['resend']): Mailer {
	if (!cfg.apiKey) {
		return {
			async send(mail) {
				log.warn({ to: mail.to, subject: mail.subject, text: mail.text }, 'RESEND_API_KEY not set — email logged, not sent');
			}
		};
	}
	const resend = new Resend(cfg.apiKey);
	return {
		async send(mail) {
			const { error } = await resend.emails.send({ from: cfg.from, ...mail });
			if (error) throw new Error(`Resend: ${error.message}`);
		}
	};
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Minimal, client-safe transactional layout: one message, one button. */
export function actionEmail(o: { to: string; subject: string; heading: string; body: string; cta: string; url: string; footer: string }): Mail {
	const html = `<!doctype html><html><body style="margin:0;background:#f5f0df;font-family:Nunito,-apple-system,Segoe UI,Roboto,sans-serif;color:#2b2a24">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#fdfaf0;border:2px solid #2b2a24;border-radius:12px;box-shadow:4px 4px 0 #2b2a24;padding:32px">
<tr><td style="font-family:'Baloo 2',Nunito,'Arial Rounded MT Bold',sans-serif;font-size:28px;font-weight:700;padding-bottom:8px">bok</td></tr>
<tr><td style="font-size:20px;font-weight:600;padding:8px 0">${esc(o.heading)}</td></tr>
<tr><td style="font-size:16px;line-height:1.5;padding-bottom:24px">${esc(o.body)}</td></tr>
<tr><td><a href="${esc(o.url)}" style="display:inline-block;background:#79c08f;color:#2b2a24;border:2px solid #2b2a24;box-shadow:3px 3px 0 #2b2a24;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700">${esc(o.cta)}</a></td></tr>
<tr><td style="font-size:13px;color:#5c584c;padding-top:24px;word-break:break-all">${esc(o.footer)}<br>${esc(o.url)}</td></tr>
</table></td></tr></table></body></html>`;
	return { to: o.to, subject: o.subject, html, text: `${o.heading}\n\n${o.body}\n\n${o.cta}: ${o.url}\n\n${o.footer}` };
}
