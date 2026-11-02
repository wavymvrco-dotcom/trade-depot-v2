import nodemailer from "nodemailer";

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

function getSmtpConfig(settings?: Record<string, any>): EmailConfig | null {
  const host = settings?.smtpHost || process.env.SMTP_HOST;
  const user = settings?.smtpUser || process.env.SMTP_USER;
  const pass = settings?.smtpPass || process.env.SMTP_PASS;
  const port = settings?.smtpPort || parseInt(process.env.SMTP_PORT || "587");
  const from = settings?.emailAddress || process.env.SMTP_FROM || user;
  if (!host || !user || !pass) return null;
  return { host, port, user, pass, from: from || user };
}

export async function sendEmail(
  settings: Record<string, any> | null,
  to: string,
  subject: string,
  html: string
): Promise<{ sent: boolean; error?: string }> {
  const cfg = getSmtpConfig(settings || {});
  if (!cfg) return { sent: false, error: "SMTP not configured" };
  try {
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
    });
    await transporter.sendMail({ from: `"TradeAI Terminal" <${cfg.from}>`, to, subject, html });
    return { sent: true };
  } catch (e: any) {
    return { sent: false, error: e.message };
  }
}

export function tradeAlertHtml(title: string, message: string, pl?: number) {
  const color = pl !== undefined ? (pl >= 0 ? "#22c55e" : "#ef4444") : "#00d4ff";
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  return `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0f;font-family:Inter,sans-serif;color:#e2e8f0">
<div style="max-width:480px;margin:32px auto;background:#111827;border:1px solid #1e293b;border-radius:12px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#00d4ff20,#0a0a0f);padding:24px 28px;border-bottom:1px solid #1e293b">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:40px;height:40px;background:${color}20;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px">📊</div>
      <div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">TradeAI Terminal</div>
        <div style="font-size:18px;font-weight:700;color:#f1f5f9">${safeTitle}</div>
      </div>
    </div>
  </div>
  <div style="padding:24px 28px">
    <p style="margin:0;color:#94a3b8;line-height:1.6">${safeMessage}</p>
    ${pl !== undefined ? `
    <div style="margin-top:20px;padding:14px 16px;background:${pl >= 0 ? "#22c55e" : "#ef4444"}15;border:1px solid ${pl >= 0 ? "#22c55e" : "#ef4444"}30;border-radius:8px">
      <div style="font-size:11px;color:#64748b;margin-bottom:4px">P&L</div>
      <div style="font-size:24px;font-weight:700;color:${pl >= 0 ? "#22c55e" : "#ef4444"}">${pl >= 0 ? "+" : ""}$${pl.toFixed(2)}</div>
    </div>` : ""}
  </div>
  <div style="padding:16px 28px;border-top:1px solid #1e293b;background:#0d1117">
    <p style="margin:0;font-size:11px;color:#475569">TradeAI Terminal · ${new Date().toUTCString()}</p>
  </div>
</div>
</body></html>`;
}

export async function verifySmtp(settings: Record<string, any>): Promise<{ ok: boolean; message: string }> {
  const cfg = getSmtpConfig(settings);
  if (!cfg) return { ok: false, message: "SMTP host, user and password are required" };
  try {
    const transporter = nodemailer.createTransport({
      host: cfg.host, port: cfg.port, secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
    });
    await transporter.verify();
    return { ok: true, message: `Connected to ${cfg.host}:${cfg.port}` };
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
}
