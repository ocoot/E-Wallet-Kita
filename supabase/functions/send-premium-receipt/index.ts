import { serve } from "https://deno.land/std/http/server.ts";
import { Resend } from "npm:resend";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

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

    const result = await resend.emails.send({
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

    console.log("Resend API Result:", result);

    if (result.error) {
      return new Response(
        JSON.stringify(result),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: result.data,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );

  } catch (err) {
    console.error("Function Error Encountered:", err);

    return new Response(
      JSON.stringify({
        success: false,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : null,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});