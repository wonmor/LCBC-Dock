import os
import smtplib
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging

logger = logging.getLogger(__name__)

SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "noreply@lcbcdock.com")
BASE_URL = os.environ.get("BASE_URL", "https://lcbc-client.apps.johnseong.com")


def send_completion_email(to_email: str, job_id: str, protein_pdb_id: str,
                          ligand_name: str, best_affinity: float):
    if not SMTP_USER or not SMTP_PASS:
        logger.warning("SMTP credentials not configured, skipping email notification")
        return False

    subject = f"DockIt - Your docking job is complete!"

    html_body = f"""
    <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #000; color: #fff; padding: 40px;">
        <div style="max-width: 600px; margin: 0 auto; background: #111; border-radius: 16px; padding: 32px;">
            <h1 style="color: #93c5fd; font-weight: 300; font-size: 28px; margin-bottom: 8px;">
                DockIt
            </h1>
            <p style="color: #9ca3af; margin-bottom: 24px;">Your molecular docking job has completed.</p>

            <div style="background: #1a1a1a; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="color: #9ca3af; padding: 8px 0;">Job ID</td>
                        <td style="color: #fff; text-align: right; font-family: monospace;">{job_id[:8]}...</td>
                    </tr>
                    <tr>
                        <td style="color: #9ca3af; padding: 8px 0;">Protein</td>
                        <td style="color: #fff; text-align: right; font-weight: 600;">{protein_pdb_id.upper()}</td>
                    </tr>
                    <tr>
                        <td style="color: #9ca3af; padding: 8px 0;">Ligand</td>
                        <td style="color: #fff; text-align: right;">{ligand_name}</td>
                    </tr>
                    <tr>
                        <td style="color: #9ca3af; padding: 8px 0;">Best Binding Affinity</td>
                        <td style="color: #86efac; text-align: right; font-weight: 600;">{best_affinity} kcal/mol</td>
                    </tr>
                </table>
            </div>

            <a href="{BASE_URL}/results/{job_id}"
               style="display: inline-block; background: #93c5fd; color: #000; padding: 12px 24px;
                      border-radius: 8px; text-decoration: none; font-weight: 600; margin-bottom: 16px;">
                View Results &amp; Docked Pose
            </a>

            <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
                This email was sent by DockIt. If you did not submit this job, please ignore this email.
            </p>
        </div>
    </body>
    </html>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = FROM_EMAIL
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(FROM_EMAIL, to_email, msg.as_string())
        logger.info(f"Completion email sent to {to_email} for job {job_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False


def send_failure_email(to_email: str, job_id: str, protein_pdb_id: str,
                       ligand_name: str, error: str):
    if not SMTP_USER or not SMTP_PASS:
        logger.warning("SMTP credentials not configured, skipping email notification")
        return False

    subject = "DockIt - Docking job failed"

    html_body = f"""
    <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #000; color: #fff; padding: 40px;">
        <div style="max-width: 600px; margin: 0 auto; background: #111; border-radius: 16px; padding: 32px;">
            <h1 style="color: #93c5fd; font-weight: 300; font-size: 28px; margin-bottom: 8px;">
                DockIt
            </h1>
            <p style="color: #fca5a5; margin-bottom: 24px;">Unfortunately, your docking job encountered an error.</p>

            <div style="background: #1a1a1a; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="color: #9ca3af; padding: 8px 0;">Job ID</td>
                        <td style="color: #fff; text-align: right; font-family: monospace;">{job_id[:8]}...</td>
                    </tr>
                    <tr>
                        <td style="color: #9ca3af; padding: 8px 0;">Protein</td>
                        <td style="color: #fff; text-align: right;">{protein_pdb_id.upper()}</td>
                    </tr>
                    <tr>
                        <td style="color: #9ca3af; padding: 8px 0;">Ligand</td>
                        <td style="color: #fff; text-align: right;">{ligand_name}</td>
                    </tr>
                    <tr>
                        <td style="color: #9ca3af; padding: 8px 0;">Error</td>
                        <td style="color: #fca5a5; text-align: right;">{error[:200]}</td>
                    </tr>
                </table>
            </div>

            <p style="color: #9ca3af;">
                Please try again with different parameters or contact us if the issue persists.
            </p>

            <a href="{BASE_URL}/docking/protein"
               style="display: inline-block; background: #93c5fd; color: #000; padding: 12px 24px;
                      border-radius: 8px; text-decoration: none; font-weight: 600;">
                Try Again
            </a>
        </div>
    </body>
    </html>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = FROM_EMAIL
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(FROM_EMAIL, to_email, msg.as_string())
        return True
    except Exception as e:
        logger.error(f"Failed to send failure email to {to_email}: {e}")
        return False


def smtp_configured() -> bool:
    return bool(SMTP_USER and SMTP_PASS)


def _send_html(to_email: str, subject: str, html_body: str, reply_to: str | None = None) -> bool:
    if not smtp_configured():
        logger.warning("SMTP credentials not configured, skipping email")
        return False
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = FROM_EMAIL
    msg["To"] = to_email
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.attach(MIMEText(html_body, "html"))
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(FROM_EMAIL, to_email, msg.as_string())
        return True
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        return False


def send_login_email(to_email: str, link: str, code: str | None = None) -> bool:
    code_block = "" if not code else f"""
        <p style="color:#9ca3af;margin-top:24px;">Signing in on the MolDock phone app? Enter this code:</p>
        <p style="font-size:32px;letter-spacing:8px;font-weight:600;margin:8px 0 16px;">{code}</p>"""
    html = f"""
    <html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#000;color:#fff;padding:40px;">
      <div style="max-width:560px;margin:0 auto;background:#111;border-radius:16px;padding:32px;">
        <h1 style="font-weight:300;font-size:26px;margin:0 0 8px;">Mol<b>Dock</b></h1>
        <p style="color:#9ca3af;">Click to sign in. The link works once and expires in 30 minutes.</p>
        <a href="{link}" style="display:inline-block;background:#fff;color:#000;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;margin:16px 0;">Sign in to MolDock</a>{code_block}
        <p style="color:#6b7280;font-size:12px;">If you didn't ask for this, ignore this email.</p>
      </div></body></html>"""
    return _send_html(to_email, "Your MolDock sign-in link", html)


def send_lab_quote_email(owner_email: str, quote: dict) -> bool:
    import html as _html
    rows = "".join(f"<tr><td style='color:#9ca3af;padding:4px 12px 4px 0'>{_html.escape(str(k))}</td>"
                   f"<td>{_html.escape(str(v))}</td></tr>" for k, v in quote.items())
    html = f"<html><body style='font-family:sans-serif'><h2>New MolDock Lab quote request</h2><table>{rows}</table></body></html>"
    return _send_html(owner_email, f"MolDock Lab quote: {str(quote.get('institution', ''))[:80]}", html)


def send_lab_quote_customer(quote: dict, seat_price_cents: int, min_seats: int,
                            reply_to: str | None = None) -> bool:
    """The automatic quote the requester receives right after asking for one."""
    import html as _html
    seats = max(int(quote["seats"]), min_seats)
    total = seats * seat_price_cents
    issued = datetime.fromisoformat(quote["created_at"])
    valid_until = (issued + timedelta(days=30)).strftime("%B %d, %Y")
    money = lambda cents: f"${cents / 100:,.2f}"
    esc = lambda v: _html.escape(str(v))
    min_note = ("" if int(quote["seats"]) >= min_seats else
                f"<p style='color:#9ca3af;font-size:13px;'>Lab plans start at {min_seats} seats, "
                f"so this quote is for {min_seats}.</p>")
    row = lambda k, v: (f"<tr><td style='color:#9ca3af;padding:6px 16px 6px 0'>{k}</td>"
                        f"<td style='padding:6px 0'>{v}</td></tr>")
    html = f"""
    <html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#000;color:#fff;padding:40px;">
      <div style="max-width:600px;margin:0 auto;background:#111;border-radius:16px;padding:32px;">
        <h1 style="font-weight:300;font-size:26px;margin:0 0 8px;">Mol<b>Dock</b> Lab quote</h1>
        <p style="color:#9ca3af;">Hi {esc(quote["name"])}, thanks for your interest. Here is your quote for {esc(quote["institution"])}.</p>
        <table style="border-collapse:collapse;margin:16px 0;">
          {row("Quote", esc(quote["quote_id"]))}
          {row("Seats", f"{seats}")}
          {row("Price per seat", f"{money(seat_price_cents)} per year")}
          {row("Total", f"<b>{money(total)} per year</b> (USD, before any applicable tax)")}
          {row("Valid until", valid_until)}
        </table>
        {min_note}
        <p style="margin-top:20px;"><b>Every seat includes</b></p>
        <ul style="color:#d1d5db;line-height:1.7;padding-left:20px;">
          <li>Everything in MolDock Pro: 1,000 dockings a day per seat with the highest queue priority</li>
          <li>Virtual screening of up to 2,000 ligands per batch</li>
          <li>Private results shared inside your lab, kept until you delete them</li>
          <li>REST API keys, and the same plan on the web, iPhone, iPad, Android and Mac apps</li>
          <li>A PI or admin who adds and removes seats from the account page</li>
        </ul>
        <p style="margin-top:20px;"><b>To accept</b>, reply to this email with the billing contact and, if your institution needs one, a purchase order number. We'll send a Stripe invoice (card, ACH or wire) and switch on the seats as soon as it's paid. Course and classroom discounts are available on request.</p>
        <p style="color:#6b7280;font-size:12px;margin-top:24px;">Quote {esc(quote["quote_id"])}, issued {issued.strftime("%B %d, %Y")}. If you didn't request this quote, you can ignore this email.</p>
      </div></body></html>"""
    return _send_html(quote["email"], f"Your MolDock Lab quote {quote['quote_id']}", html, reply_to=reply_to)
