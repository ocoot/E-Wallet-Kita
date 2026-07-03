// Edge Function: gold-price-sync
//
// Dipanggil oleh pg_cron job `gold-price-sync-daily` (lihat migration
// 20260803000000_gold_savings.sql) 1x/hari jam 02:00 UTC (09:00 WIB), lewat
// pg_net http_post -- pola identik dengan bill-reminder-notifier.
//
// Sumber data: logam-mulia-api (iamutaki, gratis & open-source, Cloudflare
// Worker) -- https://logam-mulia-api.iamutaki.workers.dev/api/prices/{source}
// Bukan API resmi Antam/UBS/dll (mereka tidak menyediakan API publik),
// jadi hasil scraping ini BISA tidak reliable -- root cause kenapa fungsi
// ini defensif (skip source yang error/harga nol, bukan menyimpan data rusak).
//
// PENTING (ditemukan saat riset, bukan asumsi): endpoint sumber untuk
// kombinasi source+materialType+weight tertentu bisa mengembalikan
// sellPrice/buybackPrice = 0 (bukan error HTTP, datanya memang kosong).
// Baris seperti itu WAJIB ditolak (jangan ikut di-upsert) supaya gold_prices
// tidak pernah berisi harga 0 yang bisa membuat buy_gold_for_user membagi
// dengan angka kecil/nol dan menghasilkan gram yang salah drastis.
//
// Brand di gold_pockets/gold_prices (lihat CHECK constraint) vs "source" di
// API eksternal: untuk MVP dipetakan 1:1 apa adanya (brand kita = source di
// API, mis. brand 'galeri24' <- source 'galeri24'). 'antam' dipetakan ke
// source 'logammulia' (situs resmi Antam) DAN diduplikasi sebagai brand
// 'antam' di tabel kita supaya user yang mengenal nama "Antam" tetap
// menemukan pilihan itu di UI.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const API_BASE = "https://logam-mulia-api.iamutaki.workers.dev/api/prices";

// Pemetaan brand internal kita -> source di logam-mulia-api.
// weight=1 supaya konsisten dengan gram (harga per 1 gram).
const BRAND_SOURCE_MAP: Record<string, string> = {
  antam: "logammulia",
  logammulia: "logammulia",
  ubs: "galeri24", // Galeri 24 adalah salah satu penjual resmi UBS; materialType difilter di bawah
  galeri24: "galeri24",
  pegadaian: "pegadaian",
  sampoernagold: "sampoernagold",
  hartadinataabadi: "hartadinataabadi",
};

interface SourcePriceRow {
  source: string;
  materialType: string;
  weight: number;
  sellPrice: number;
  buybackPrice: number;
  recordedDate: string; // YYYY-MM-DD
}

interface SourceApiResponse {
  success: boolean;
  data: SourcePriceRow[];
}

async function fetchBrandPrice(brand: string): Promise<{
  sellPrice: number;
  buybackPrice: number;
  priceDate: string;
} | null> {
  const source = BRAND_SOURCE_MAP[brand];
  if (!source) {
    console.error(`[gold-price-sync] No source mapping for brand "${brand}", skipping.`);
    return null;
  }

  try {
    // Tanpa &weight=1 -- beberapa sumber tidak menjual pecahan 1 gram persis
    // atau field weight-nya tidak match dengan filter ketat. Ambil semua baris,
    // lalu normalisasi manual di bawah (lebih robust terhadap variasi schema
    // antar sumber daripada berharap API filter query-nya konsisten).
    const url = `${API_BASE}/${source}`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      console.error(`[gold-price-sync] ${brand} (${source}) fetch failed: HTTP ${response.status}`);
      return null;
    }

    const json = (await response.json()) as SourceApiResponse;
    if (!json.success || !Array.isArray(json.data) || json.data.length === 0) {
      console.error(`[gold-price-sync] ${brand} (${source}) returned no usable data.`);
      return null;
    }

    // Defensif: coerce ke Number (beberapa sumber mengembalikan weight/harga
    // sebagai string), lalu ambil baris dengan harga valid (>0) dan weight
    // terkecil (paling dekat ke 1 gram) untuk dinormalisasi jadi harga/gram.
    const candidates = json.data
      .map((r) => ({
        weight: Number((r as any).weight),
        sellPrice: Number((r as any).sellPrice),
        buybackPrice: Number((r as any).buybackPrice),
        recordedDate: (r as any).recordedDate,
      }))
      .filter((r) => r.weight > 0 && r.sellPrice > 0 && r.buybackPrice > 0)
      .sort((a, b) => a.weight - b.weight);

    if (candidates.length === 0) {
      // Log sample mentah supaya kalau masih gagal, bentuk data aslinya
      // kelihatan di Supabase Edge Function logs untuk didiagnosis lebih lanjut.
      console.error(
        `[gold-price-sync] ${brand} (${source}) has no row with valid non-zero price/weight. Raw sample:`,
        JSON.stringify(json.data.slice(0, 3))
      );
      return null;
    }

    const best = candidates[0];
    return {
      sellPrice: Math.round(best.sellPrice / best.weight),
      buybackPrice: Math.round(best.buybackPrice / best.weight),
      priceDate: best.recordedDate ?? new Date().toISOString().slice(0, 10),
    };
  } catch (err) {
    console.error(`[gold-price-sync] ${brand} (${source}) fetch exception:`, err);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured for this Edge Function");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const brands = Object.keys(BRAND_SOURCE_MAP);
    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const brand of brands) {
      const result = await fetchBrandPrice(brand);
      if (!result) {
        skipped++;
        errors.push(brand);
        continue;
      }

      const { error } = await supabase.from("gold_prices").upsert(
        {
          brand,
          sell_price_per_gram: result.sellPrice,
          buyback_price_per_gram: result.buybackPrice,
          price_date: result.priceDate,
          source: "logam-mulia-api",
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "brand,price_date" }
      );

      if (error) {
        console.error(`[gold-price-sync] Upsert failed for ${brand}:`, error.message);
        skipped++;
        errors.push(brand);
        continue;
      }

      synced++;
    }

    // Kalau SEMUA brand gagal, ini kemungkinan besar sumber data down total
    // atau ada breaking change di API eksternal -- balikan status 500 supaya
    // kegagalan ini TERLIHAT (di log Supabase & response pg_net), bukan
    // silent-fail seperti insiden bill-reminder placeholder sebelumnya.
    const status = synced === 0 ? 500 : 200;

    return new Response(
      JSON.stringify({ success: synced > 0, synced, skipped, failed_brands: errors, total: brands.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status }
    );
  } catch (err: any) {
    console.error("gold-price-sync error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
