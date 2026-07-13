import { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { logError } from "./_lib/errorLogger.js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // 1. Auth check to secure the endpoint
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.split(" ")[1];
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const {
      email,
      customerName,
      orderId,
      amount,
      paymentMethod,
      purchaseDate,
      pdfBase64,
    } = req.body;

    if (!email || !orderId || !pdfBase64) {
      res.status(400).json({ error: "Missing required fields: email, orderId, or pdfBase64" });
      return;
    }

    const smtpEmail = process.env.SMTP_EMAIL;
    const smtpPassword = process.env.SMTP_PASSWORD;

    if (!smtpEmail || !smtpPassword) {
      throw new Error("SMTP_EMAIL or SMTP_PASSWORD environment variables are not configured.");
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: smtpEmail,
        pass: smtpPassword,
      },
    });

    const mailOptions = {
      from: `"E-Wallet Kita" <${smtpEmail}>`,
      to: email,
      subject: "Struk Pembelian Premium E-Wallet Kita",
      attachments: [
        {
          filename: `Struk-${orderId}.pdf`,
          content: Buffer.from(pdfBase64, "base64"),
          contentType: "application/pdf",
        },
      ],
      html: `
      <h2>Pembayaran Premium Berhasil</h2>

      <p>Halo <b>${customerName}</b>,</p>

      <p>Terima kasih telah membeli Premium E-Wallet Kita.</p>

      <table cellpadding="6" style="border-collapse: collapse;">
        <tr>
          <td><b>Order ID</b></td>
          <td>${orderId}</td>
        </tr>

        <tr>
          <td><b>Tanggal</b></td>
          <td>${purchaseDate}</td>
        </tr>

        <tr>
          <td><b>Metode</b></td>
          <td>${paymentMethod}</td>
        </tr>

        <tr>
          <td><b>Total</b></td>
          <td>${amount}</td>
        </tr>
      </table>

      <br>

      <p>Status :</p>

      <h3 style="color:green">
     LUNAS
      </h3>

      <br>

      <small>
      Terima kasih telah menggunakan E-Wallet Kita.
      </small>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.messageId);

    res.status(200).json({ success: true, messageId: info.messageId });
  } catch (err: any) {
    console.error("Send receipt error:", err);
    await logError(supabase, {
      source: "send-receipt",
      level: "error",
      message: err?.message ? String(err.message) : "Gagal mengirim struk ke email",
      userId: user?.id ?? null,
      context: { order_id: (req.body as any)?.orderId ?? null, email: (req.body as any)?.email ?? null },
    });
    res.status(500).json({
      success: false,
      error: err.message || "Terjadi kesalahan internal ketika mengirim struk ke email",
    });
  }
}
