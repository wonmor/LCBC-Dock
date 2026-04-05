import os
import smtplib
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

    subject = f"LCBC Dock - Your docking job is complete!"

    html_body = f"""
    <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #000; color: #fff; padding: 40px;">
        <div style="max-width: 600px; margin: 0 auto; background: #111; border-radius: 16px; padding: 32px;">
            <h1 style="color: #93c5fd; font-weight: 300; font-size: 28px; margin-bottom: 8px;">
                LCBC <span style="font-weight: 600;">DOCK</span>
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
                This email was sent by LCBC Dock. If you did not submit this job, please ignore this email.
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

    subject = "LCBC Dock - Docking job failed"

    html_body = f"""
    <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #000; color: #fff; padding: 40px;">
        <div style="max-width: 600px; margin: 0 auto; background: #111; border-radius: 16px; padding: 32px;">
            <h1 style="color: #93c5fd; font-weight: 300; font-size: 28px; margin-bottom: 8px;">
                LCBC <span style="font-weight: 600;">DOCK</span>
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
