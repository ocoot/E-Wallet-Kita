// Edge Function: gold-price-sync
//
// Dipanggil oleh pg_cron job `gold-price-sync-daily` (lihat migration
// 20260803000000_gold_savings.sql) 1x/hari jam 02:00 UTC (09:00 WIB), lewat
// pg_net http_post -- pola identik dengan bill-reminder-notifier.
//
// Cakupan brand SEKARANG DIPERSEMPIT ke 4 sesuai kebutuhan riil: antam,
// pegadaian, ubs, galeri24 (brand lain seperti sampoernagold/hartadinataabadi
// tidak lagi disinkron -- constraint DB tetap mengizinkannya untuk
// kompatibilitas, tapi tidak aktif di-fetch supaya tidak buang-buang kuota
// fallback untuk brand yang tidak dipakai).
//
// ARSITEKTUR 2 SUMBER (PRIMARY -> FALLBACK PER-BRAND, bukan all-or-nothing):
//   1. PRIMARY: logam-mulia-api (iamutaki, gratis, tanpa API key)
//   2. FALLBACK: Emas API ID (emas.maulanar.my.id, gratis dgn API key,
//      60 hits/bulan) -- HANYA dipanggil untuk brand yang gagal di primary,
//      bukan dipanggil sekaligus semua brand tiap sync. Kalau iamutaki sehat
//      (kondisi normal), fallback ini 0 hit/bulan.
//   Kalau EMAS_API_ID_KEY belum di-set sebagai secret, fallback di-skip
//   dengan warning (bukan crash) -- fitur tetap jalan pakai primary saja,
//   cuma tanpa jaring pengaman kalau primary down.
//
// BUG YANG DIPERBAIKI DI VERSI INI (root cause, bukan kosmetik):
// Source "galeri24" di iamutaki menjual LEBIH DARI SATU brand fisik (Antam,
// UBS, Lotus Archi, Dinar, Batik Series edisi khusus, dst) dalam satu
// response, dibedakan lewat field `materialType`. Versi sebelumnya untuk
// brand "galeri24" dan "ubs" cuma filter LONGGAR (materialTypeIncludes /
// materialTypeExcludes kata "ubs"), BUKAN exact-match seperti yang sudah
// benar dipakai brand "antam" (materialTypeExact "emas batangan"). Akibat
// nyata (dikonfirmasi lewat fetch live ke API, bukan asumsi):
//   - brand "galeri24": filter exclude "ubs" saja MELOLOSKAN materialType
//     lain seperti "BATIK SERIES" yang beratnya bisa 0.02g -- lebih kecil
//     dari "GALERI 24" 0.5g/1g yang dimaksud. Karena baris berat-terkecil
//     yang menang, "galeri24" bisa kesimpan harga BATIK SERIES 0.02g
//     (~Rp5.55jt/gram, buyback 0 -> null) padahal seharusnya GALERI 24 1g
//     (~Rp2.64jt/gram, buyback ada).
//   - brand "ubs": filter includes "ubs" saja MELOLOSKAN "UBS DISNEY",
//     "UBS ELSA", "UBS ANNA", dst (edisi kolektor). "UBS DISNEY" 0.1g bisa
//     menang atas "UBS" 1g standar (~Rp3.53jt/gram vs ~Rp2.65jt/gram,
//     buyback 0 -> null padahal UBS standar punya buyback).
// Fix: exact-match materialType ("galeri 24" utuh utk galeri24, "ubs" utuh
// utk ubs -- BUKAN includes/excludes), persis pola antam.
//
// FIX KEDUA di versi ini: pemilihan baris representatif sebelumnya SELALU
// pakai berat TERKECIL yang tersisa, bukan berat 1 gram. Harga emas batangan
// tidak linear per gram (pecahan kecil lebih mahal per gram karena biaya
// cetak/sertifikasi tetap) -- dikonfirmasi live: Antam-materialType 0.5g di
// logammulia = Rp2.77jt/gram vs baris 1g = Rp2.67jt/gram. Fix: cari baris
// weight === 1 dulu; HANYA fallback ke berat terkecil (dengan console.warn
// eksplisit) kalau source itu memang tidak punya baris 1g sama sekali
// (kasus nyata: "pegadaian" cuma py 1 baris, weight 0.01g).
//
// PENTING (ditemukan saat riset, bukan asumsi): endpoint sumber untuk
// kombinasi source+materialType+weight tertentu bisa mengembalikan
// sellPrice/buybackPrice = 0/null (bukan error HTTP, datanya memang kosong).
// Baris seperti itu WAJIB ditolak (jangan ikut di-upsert) supaya gold_prices
// tidak pernah berisi harga 0 yang bisa membuat buy_gold_for_user membagi
// dengan angka kecil/nol dan menghasilkan gram yang salah drastis.
// buybackPrice yang null/0 TETAP diterima sebagai sell-only (lihat migration
// 20260803020000_allow_null_buyback_price.sql) -- Jual diblokir otomatis
// oleh sell_gold_for_user sampai buyback tersedia.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TARGET_BRANDS = ["antam", "pegadaian", "ubs", "galeri24"] as const;
type TargetBrand = typeof TARGET_BRANDS[number];

interface PriceResult {
  sellPrice: number;
  buybackPrice: number | null;
  priceDate: string;
}

// ── PRIMARY: logam-mulia-api (iamutaki) ─────────────────────────────────
const PRIMARY_API_BASE = "https://logam-mulia-api.iamutaki.workers.dev/api/prices";

const PRIMARY_CONFIG: Record<TargetBrand, { source: string; materialTypeExact?: string; materialTypeIncludes?: string[]; materialTypeExcludes?: string[] }> = {
  // materialTypeExact "emas batangan" WAJIB persis, BUKAN includes -- kalau
  // pakai includes, "Emas Batangan Gift Series"/"...Imlek"/"...Batik Seri
  // III" ikut lolos (varian edisi khusus/kolektor, harga per gram biasanya
  // lebih mahal dari batangan standar, jadi tidak representatif buat
  // referensi harga umum).
  antam: { source: "logammulia", materialTypeExact: "emas batangan" },
  pegadaian: { source: "pegadaian" }, // BELUM DIKONFIRMASI single-brand atau tidak -- lihat log kalau ada >1 materialType
  // exact-match, BUKAN includes/excludes -- lihat catatan bug di header file:
  // includes/excludes longgar meloloskan varian lain (Batik Series, UBS
  // Disney/Elsa/Anna, dst) yang beratnya bisa lebih kecil dan mengalahkan
  // baris "GALERI 24"/"UBS" standar saat sorting berat-terkecil.
  galeri24: { source: "galeri24", materialTypeExact: "galeri 24" }, // representasi "harga listing Galeri24", BUKAN produk UBS/Batik/Lotus/Dinar
  ubs: { source: "galeri24", materialTypeExact: "ubs" }, // UBS standar saja, BUKAN UBS Disney/Elsa/Anna/Mickey/Hello Kitty
};

async function fetchFromPrimary(brand: TargetBrand): Promise<PriceResult | null> {
  const config = PRIMARY_CONFIG[brand];

  try {
    const url = `${PRIMARY_API_BASE}/${config.source}`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      console.error(`[primary] ${brand} (${config.source}) fetch failed: HTTP ${response.status}`);
      return null;
    }

    const json = await response.json();
    if (!json.success || !Array.isArray(json.data) || json.data.length === 0) {
      console.error(`[primary] ${brand} (${config.source}) returned no usable data.`);
      return null;
    }

    let rows = json.data.map((r: any) => ({
      weight: Number(r.weight),
      sellPrice: Number(r.sellPrice),
      buybackPrice: Number(r.buybackPrice),
      material: String(r.material ?? ""),
      materialType: String(r.materialType ?? ""),
      recordedDate: r.recordedDate,
    })).filter((r: any) => r.weight > 0 && r.sellPrice > 0);

    // LAPIS 1 (safety net wajib): buang apapun yang bukan emas -- source ini
    // ternyata juga menjual PERAK ("Perak Murni", "Perak Heritage") dalam
    // response yang sama. Tanpa filter ini, brand emas kita bisa kesimpan
    // harga perak kalau kebetulan beratnya lebih kecil. Kalau field
    // `material` kosong/tidak ada di suatu baris, baris itu tetap dibuang
    // (fail-safe: mending skip daripada berisiko salah logam).
    const beforeMaterialFilter = rows.length;
    rows = rows.filter((r: any) => r.material.toLowerCase() === "gold");
    if (rows.length === 0 && beforeMaterialFilter > 0) {
      console.error(`[primary] ${brand} (${config.source}): semua ${beforeMaterialFilter} baris terbuang oleh filter material=gold. Distinct material seen:`, JSON.stringify([...new Set(json.data.map((r: any) => r.material))]));
      return null;
    }

    // LAPIS 2: materialType, kalau dikonfigurasi.
    if (config.materialTypeExact) {
      const target = config.materialTypeExact.toLowerCase();
      const before = rows.length;
      rows = rows.filter((r: any) => r.materialType.toLowerCase() === target);
      if (rows.length === 0) {
        console.error(
          `[primary] ${brand} (${config.source}): tidak ada baris dengan materialType persis "${config.materialTypeExact}" dari ${before} kandidat emas. Distinct materialType (emas saja):`,
          JSON.stringify([...new Set(json.data.filter((r: any) => String(r.material ?? "").toLowerCase() === "gold").map((r: any) => r.materialType))])
        );
        return null;
      }
    }
    if (config.materialTypeIncludes) {
      const before = rows.length;
      rows = rows.filter((r: any) =>
        config.materialTypeIncludes!.some(kw => r.materialType.toLowerCase().includes(kw))
      );
      if (rows.length === 0) {
        console.error(
          `[primary] ${brand} (${config.source}): no row matched materialType includes [${config.materialTypeIncludes.join(",")}] out of ${before} candidate(s). Distinct materialType seen:`,
          JSON.stringify([...new Set(json.data.map((r: any) => r.materialType))])
        );
        return null;
      }
    }
    if (config.materialTypeExcludes) {
      rows = rows.filter((r: any) =>
        !config.materialTypeExcludes!.some(kw => r.materialType.toLowerCase().includes(kw))
      );
      if (rows.length === 0) {
        console.error(`[primary] ${brand} (${config.source}): all rows excluded by materialType filter, nothing left.`);
        return null;
      }
    }
    // Kalau tidak ada filter sama sekali (mis. pegadaian) dan ternyata ada
    // >1 materialType berbeda, itu sinyal source ini multi-brand juga --
    // log supaya bisa dikalibrasi filter yang tepat di iterasi berikutnya,
    // sama seperti proses kalibrasi UBS sebelumnya.
    if (!config.materialTypeIncludes && !config.materialTypeExcludes) {
      const distinct = [...new Set(rows.map((r: any) => r.materialType))];
      if (distinct.length > 1) {
        console.warn(`[primary] ${brand} (${config.source}): source ini mengembalikan >1 materialType (${JSON.stringify(distinct)}) tapi belum ada filter -- mungkin perlu dikalibrasi seperti UBS. Sementara pakai baris berat-terkecil apa adanya.`);
      }
    }

    // LAPIS 3 (fix normalisasi per-gram): prioritaskan baris weight === 1
    // secara eksplisit -- ini yang paling representatif untuk "harga per
    // gram" yang biasa ditampilkan publik. Harga emas batangan TIDAK linear
    // per gram (pecahan kecil lebih mahal per gram akibat biaya cetak/
    // sertifikasi tetap), jadi baris berat-terkecil BUKAN proxy yang aman
    // untuk baris 1g kalau baris 1g itu sendiri tersedia. Fallback ke berat
    // terkecil HANYA kalau source tsb memang tidak punya baris 1g sama
    // sekali (mis. "pegadaian" yang cuma py 1 baris, weight 0.01g) --
    // fallback ini di-log eksplisit supaya kelihatan di monitoring, bukan
    // silent approximation.
    const exactGramRows = rows.filter((r: any) => r.weight === 1);
    let best: any;
    if (exactGramRows.length > 0) {
      best = exactGramRows[0];
    } else {
      rows.sort((a: any, b: any) => a.weight - b.weight);
      best = rows[0];
      console.warn(
        `[primary] ${brand} (${config.source}): tidak ada baris weight===1, fallback ke berat terkecil yang tersedia (${best.weight}g). Harga per-gram hasil normalisasi ini adalah APROKSIMASI, bukan kuotasi 1g asli.`
      );
    }
    const hasBuyback = Number.isFinite(best.buybackPrice) && best.buybackPrice > 0;

    return {
      sellPrice: Math.round(best.sellPrice / best.weight),
      buybackPrice: hasBuyback ? Math.round(best.buybackPrice / best.weight) : null,
      priceDate: best.recordedDate ?? new Date().toISOString().slice(0, 10),
    };
  } catch (err) {
    console.error(`[primary] ${brand} (${config.source}) fetch exception:`, err);
    return null;
  }
}

// ── FALLBACK: Emas API ID ────────────────────────────────────────────────
const SECONDARY_API_BASE = "https://emas.maulanar.my.id/api/prices";

const SECONDARY_CONFIG: Record<TargetBrand, { resource: string; brand?: string; excludeBrandContains?: string }> = {
  antam: { resource: "antam" },
  pegadaian: { resource: "pegadaian" }, // sama seperti primary, belum dikonfirmasi single-brand
  galeri24: { resource: "galeri24", excludeBrandContains: "ubs" },
  ubs: { resource: "galeri24", brand: "UBS" },
};

async function fetchFromSecondary(brand: TargetBrand): Promise<PriceResult | null> {
  const apiKey = Deno.env.get("EMAS_API_ID_KEY");
  if (!apiKey) {
    console.warn(`[fallback] EMAS_API_ID_KEY belum di-set sebagai secret -- fallback untuk "${brand}" di-skip, bukan crash.`);
    return null;
  }

  const config = SECONDARY_CONFIG[brand];
  try {
    const params = new URLSearchParams({ resource: config.resource, weight: "1" });
    if (config.brand) params.set("brand", config.brand);
    const url = `${SECONDARY_API_BASE}?${params.toString()}`;

    const response = await fetch(url, { headers: { "X-API-Key": apiKey, Accept: "application/json" } });
    if (!response.ok) {
      console.error(`[fallback] ${brand} fetch failed: HTTP ${response.status}`);
      return null;
    }

    const json = await response.json();
    if (json.status !== "success" || !Array.isArray(json.data) || json.data.length === 0) {
      console.error(`[fallback] ${brand} returned no usable data.`);
      return null;
    }

    let rows = json.data.filter((r: any) => Number(r.sell_price) > 0 && Number(r.weight) > 0);

    if (config.excludeBrandContains) {
      rows = rows.filter((r: any) => !String(r.brand ?? "").toLowerCase().includes(config.excludeBrandContains!));
      if (rows.length === 0) {
        console.error(`[fallback] ${brand}: semua baris terfilter oleh excludeBrandContains. Brand asli yang muncul:`, JSON.stringify([...new Set(json.data.map((r: any) => r.brand))]));
        return null;
      }
    }

    rows.sort((a: any, b: any) => Number(a.weight) - Number(b.weight));
    const row = rows[0];
    const hasBuyback = Number.isFinite(Number(row.buyback_price)) && Number(row.buyback_price) > 0;

    return {
      sellPrice: Math.round(Number(row.sell_price) / Number(row.weight)),
      buybackPrice: hasBuyback ? Math.round(Number(row.buyback_price) / Number(row.weight)) : null,
      priceDate: row.date ?? new Date().toISOString().slice(0, 10),
    };
  } catch (err) {
    console.error(`[fallback] ${brand} fetch exception:`, err);
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

    let synced = 0;
    let skipped = 0;
    const usedFallbackFor: string[] = [];
    const failedBrands: string[] = [];

    for (const brand of TARGET_BRANDS) {
      let result = await fetchFromPrimary(brand);
      let sourceLabel = "logam-mulia-api";

      if (!result) {
        console.warn(`[gold-price-sync] Primary gagal untuk "${brand}", mencoba fallback...`);
        result = await fetchFromSecondary(brand);
        sourceLabel = "emas-api-id";
        if (result) usedFallbackFor.push(brand);
      }

      if (!result) {
        skipped++;
        failedBrands.push(brand);
        console.error(`[gold-price-sync] "${brand}" gagal di PRIMARY dan FALLBACK -- harga lama (kalau ada) dibiarkan, staleness guard akan memblokir transaksi kalau sudah terlalu basi.`);
        continue;
      }

      const { error } = await supabase.from("gold_prices").upsert(
        {
          brand,
          sell_price_per_gram: result.sellPrice,
          buyback_price_per_gram: result.buybackPrice,
          price_date: result.priceDate,
          source: sourceLabel,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "brand,price_date" }
      );

      if (error) {
        console.error(`[gold-price-sync] Upsert failed for ${brand}:`, error.message);
        skipped++;
        failedBrands.push(brand);
        continue;
      }

      synced++;
    }

    if (usedFallbackFor.length > 0) {
      console.warn(`[gold-price-sync] Brand yang dilayani FALLBACK (Emas API ID) kali ini: ${usedFallbackFor.join(", ")}`);
    }

    // Kalau SEMUA brand gagal (primary & fallback dua-duanya), balikan status
    // 500 supaya kegagalan ini TERLIHAT, bukan silent-fail.
    const status = synced === 0 ? 500 : 200;

    return new Response(
      JSON.stringify({
        success: synced > 0,
        synced,
        skipped,
        failed_brands: failedBrands,
        used_fallback_for: usedFallbackFor,
        total: TARGET_BRANDS.length,
      }),
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
