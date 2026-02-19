import nodemailer from "nodemailer";
import { config } from "@backend/config.ts";

// Create reusable transporter
const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASS,
    },
});

interface SendEmailParams {
    to: string;
    subject: string;
    html: string;
}

async function sendEmail(params: SendEmailParams): Promise<boolean> {
    try {
        if (!config.SMTP_PASS) {
            console.warn("[Email] SMTP_PASS not set, skipping email send to:", params.to);
            return false;
        }

        await transporter.sendMail({
            from: config.SMTP_FROM,
            to: params.to,
            subject: params.subject,
            html: params.html,
        });

        console.log(`[Email] Successfully sent email to ${params.to}`);
        return true;
    } catch (error) {
        console.error("[Email] Failed to send email:", error);
        return false;
    }
}

interface NewUserEmailParams {
    name: string;
    email: string;
    password: string;
    userType: "mahasiswa" | "pegawai";
    identifier: string; // NIM for mahasiswa, NIP for pegawai
    jabatan?: string; // Only for pegawai
}

export async function sendNewUserWelcomeEmail(params: NewUserEmailParams): Promise<boolean> {
    const identifierLabel = params.userType === "mahasiswa" ? "NIM" : "NIP";
    const userTypeLabel = params.userType === "mahasiswa" ? "Mahasiswa" : "Pegawai";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      margin: 0;
      padding: 0;
      background-color: #f4f6f9;
    }
    .container {
      max-width: 600px;
      margin: 30px auto;
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
    }
    .header {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      padding: 32px 24px;
      text-align: center;
    }
    .header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 24px;
      font-weight: 700;
    }
    .header p {
      color: rgba(255, 255, 255, 0.85);
      margin: 8px 0 0;
      font-size: 14px;
    }
    .body-content {
      padding: 32px 24px;
    }
    .greeting {
      font-size: 18px;
      color: #1f2937;
      margin-bottom: 16px;
    }
    .message {
      color: #4b5563;
      font-size: 14px;
      line-height: 1.7;
      margin-bottom: 24px;
    }
    .credentials {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 24px;
    }
    .credentials h3 {
      color: #374151;
      margin: 0 0 16px 0;
      font-size: 15px;
      font-weight: 600;
    }
    .cred-row {
      display: flex;
      padding: 10px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .cred-row:last-child {
      border-bottom: none;
    }
    .cred-label {
      color: #6b7280;
      font-size: 13px;
      min-width: 100px;
      font-weight: 500;
    }
    .cred-value {
      color: #111827;
      font-size: 13px;
      font-weight: 600;
      word-break: break-all;
    }
    .password-box {
      background: #fef3c7;
      border: 1px solid #fcd34d;
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 24px;
    }
    .password-box p {
      margin: 0;
      color: #92400e;
      font-size: 13px;
      line-height: 1.6;
    }
    .password-box strong {
      color: #78350f;
    }
    .footer {
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      padding: 20px 24px;
      text-align: center;
    }
    .footer p {
      color: #9ca3af;
      font-size: 12px;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>E-Office FSM</h1>
      <p>Sistem Persuratan Elektronik</p>
    </div>
    <div class="body-content">
      <p class="greeting">Halo, <strong>${params.name}</strong>!</p>
      <p class="message">
        Akun <strong>${userTypeLabel}</strong> Anda telah berhasil dibuat di sistem E-Office 
        Fakultas Sains dan Matematika (FSM). Berikut adalah informasi akun Anda:
      </p>

      <div class="credentials">
        <h3>📋 Informasi Akun</h3>
        <div class="cred-row">
          <span class="cred-label">${identifierLabel}</span>
          <span class="cred-value">${params.identifier}</span>
        </div>
        <div class="cred-row">
          <span class="cred-label">Email</span>
          <span class="cred-value">${params.email}</span>
        </div>
        ${params.jabatan ? `
        <div class="cred-row">
          <span class="cred-label">Jabatan</span>
          <span class="cred-value">${params.jabatan}</span>
        </div>
        ` : ""}
        <div class="cred-row">
          <span class="cred-label">Password</span>
          <span class="cred-value">${params.password}</span>
        </div>
      </div>

      <div class="password-box">
        <p>
          <strong>⚠️ Penting:</strong> Demi keamanan akun Anda, segera ganti password 
          setelah login pertama kali. Password default Anda adalah 
          <strong>${identifierLabel}</strong> Anda.
        </p>
      </div>

      <p class="message">
        Silakan login menggunakan email dan password di atas, kemudian segera ubah 
        password Anda melalui halaman profil.
      </p>
    </div>
    <div class="footer">
      <p>Email ini dikirim secara otomatis oleh sistem E-Office FSM. Mohon tidak membalas email ini.</p>
    </div>
  </div>
</body>
</html>
  `;

    return sendEmail({
        to: params.email,
        subject: `[E-Office FSM] Akun ${userTypeLabel} Anda Telah Dibuat`,
        html,
    });
}

export const emailService = {
    sendEmail,
    sendNewUserWelcomeEmail,
};
