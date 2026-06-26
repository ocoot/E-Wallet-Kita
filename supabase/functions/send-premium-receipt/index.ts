import { serve } from "https://deno.land/std/http/server.ts";
import { Resend } from "npm:resend";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

serve(async (req) => {
  try {
    const body = await req.json();

    const {
      email,
      customerName,
      orderId,
      amount,
      paymentMethod,
      purchaseDate,
      pdfBase64,
    } = body;

    const { error } = await resend.emails.send({
      from: "E-Wallet Kita <onboarding@resend.dev>",
      to: email,
      subject: "Struk Pembelian Premium E-Wallet Kita",

      attachments: [
        {
          filename: `Struk-${orderId}.pdf`,
          content: pdfBase64,
        },
      ],

      html: `
      <h2>Pembayaran Premium Berhasil</h2>

      <p>Halo <b>${customerName}</b>,</p>

      <p>Terima kasih telah membeli Premium E-Wallet Kita.</p>

      <table cellpadding="6">
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
      ✅ LUNAS
      </h3>

      <br>

      <small>
      Terima kasih telah menggunakan E-Wallet Kita.
      </small>
      `,
    });

    if (error) {
      return new Response(
        JSON.stringify(error),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

  } catch (err) {

    return new Response(
      JSON.stringify({
        success: false,
        message: err.message,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
});