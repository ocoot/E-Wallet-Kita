/**
 * Kalender event dinamis — menggabungkan data hari libur nasional dari
 * Nager.Date API (+ fallback statis) dengan event tematik manual (Valentine,
 * Piala Dunia, dll) untuk overlay dekoratif di Dashboard.
 *
 * API: https://date.nager.at (gratis, tanpa API key)
 * API: https://thesportsdb.com (gratis, tanpa API key — jadwal sepakbola)
 * Fallback: data statis untuk hari libur & event olahraga utama.
 *
 * Cache: hasil fetch API disimpan di localStorage 24 jam.
 */

export type OverlayType = "confetti" | "fireworks" | "hearts" | "sparkles";

export interface EventOverlayConfig {
  /** Jenis animasi partikel overlay */
  type: OverlayType | null;
  /** Gradient class override untuk dashboard header (opsional) */
  gradientClass?: string;
  /** Emoji ikon kecil di samping tanggal (opsional) */
  emoji?: string;
}

export interface CalendarEvent {
  id: string;
  name: { id: string; en: string };
  overlay: EventOverlayConfig;
  /**
   * Tanggal tetap: [bulan, hari].
   * Untuk event multi-hari, gunakan range.
   */
  date?: { month: number; day: number };
  /** Range tanggal: [mulai_bulan, mulai_hari] – [selesai_bulan, selesai_hari] */
  range?: { start: { month: number; day: number }; end: { month: number; day: number } };
  /**
   * Nama hari libur dari Nager.Date untuk di-match (substring).
   * Contoh: "Christmas" akan match "Christmas Day" dari API.
   */
  matchHoliday?: string[];
  /** Negara asal event (ID = Indonesia, US = internasional, * = semua) */
  countryCode?: "ID" | "US" | "*";
}

/* ──────────────────────────────────────────────────────
 * Event tematik manual — tetap, tidak bergantung API
 * ────────────────────────────────────────────────────── */
const MANUAL_EVENTS: CalendarEvent[] = [
  {
    id: "valentine",
    name: { id: "Hari Kasih Sayang", en: "Valentine's Day" },
    date: { month: 2, day: 14 },
    overlay: { type: "hearts", emoji: "" },
    countryCode: "*",
  },
  {
    id: "new-year",
    name: { id: "Tahun Baru", en: "New Year's Day" },
    date: { month: 1, day: 1 },
    overlay: { type: "fireworks", emoji: "" },
    countryCode: "*",
  },
  {
    id: "christmas",
    name: { id: "Natal", en: "Christmas" },
    date: { month: 12, day: 25 },
    overlay: { type: "sparkles", emoji: "" },
    countryCode: "*",
  },
  {
    id: "halloween",
    name: { id: "Halloween", en: "Halloween" },
    date: { month: 10, day: 31 },
    overlay: { type: "sparkles", emoji: "" },
    countryCode: "*",
  },
  {
    id: "st-patrick",
    name: { id: "St. Patrick's Day", en: "St. Patrick's Day" },
    date: { month: 3, day: 17 },
    overlay: { type: "confetti", emoji: "" },
    countryCode: "*",
  },
  {
    id: "april-fools",
    name: { id: "April Mop", en: "April Fools' Day" },
    date: { month: 4, day: 1 },
    overlay: { type: "confetti", emoji: "" },
    countryCode: "*",
  },
  {
    id: "earth-day",
    name: { id: "Hari Bumi", en: "Earth Day" },
    date: { month: 4, day: 22 },
    overlay: { type: "sparkles", emoji: "" },
    countryCode: "*",
  },
  {
    id: "mother-day",
    name: { id: "Hari Ibu", en: "Mother's Day" },
    // Indonesia: 22 Des, Internasional: Minggu ke-2 Mei (pakai 12/22 aja)
    date: { month: 12, day: 22 },
    overlay: { type: "hearts", emoji: "" },
    countryCode: "ID",
  },
];

/* ──────────────────────────────────────────────────────
 * Event sepakbola — turnamen besar (tanggal tetap)
 * ────────────────────────────────────────────────────── */
const SPORTS_EVENTS: CalendarEvent[] = [
  {
    id: "fifa-world-cup",
    name: { id: "Piala Dunia FIFA", en: "FIFA World Cup" },
    // Piala Dunia 2026: 11 Juni – 19 Juli (host USA/Kanada/Meksiko)
    range: { start: { month: 6, day: 11 }, end: { month: 7, day: 19 } },
    overlay: { type: "confetti", emoji: "" },
    countryCode: "*",
  },
  {
    id: "uefa-champions-league",
    name: { id: "Liga Champions UEFA", en: "UEFA Champions League" },
    // Final UCL biasanya akhir Mei/awal Juni
    range: { start: { month: 5, day: 25 }, end: { month: 6, day: 3 } },
    overlay: { type: "sparkles", emoji: "" },
    countryCode: "*",
  },
  {
    id: "uefa-euro",
    name: { id: "Piala Eropa UEFA", en: "UEFA Euro" },
    // Euro 2028: tbd, tapi kita pakai range perkiraan Juni-Juli tahun genap
    range: { start: { month: 6, day: 14 }, end: { month: 7, day: 14 } },
    overlay: { type: "confetti", emoji: "" },
    countryCode: "*",
  },
  {
    id: "olympic-football",
    name: { id: "Sepakbola Olimpiade", en: "Olympic Football" },
    // Olimpiade 2028 Los Angeles: Juli-Agustus
    range: { start: { month: 7, day: 20 }, end: { month: 8, day: 10 } },
    overlay: { type: "confetti", emoji: "" },
    countryCode: "*",
  },
];

/* ──────────────────────────────────────────────────────
 * Pemetaan hari libur Nager.Date → overlay & emoji
 * ────────────────────────────────────────────────────── */
interface HolidayMapEntry {
  overlay: OverlayType;
  emoji: string;
}

const HOLIDAY_OVERLAY_MAP: Record<string, HolidayMapEntry> = {
  "new year": { overlay: "fireworks", emoji: "" },
  "christmas": { overlay: "sparkles", emoji: "" },
  "easter": { overlay: "confetti", emoji: "" },
  "good friday": { overlay: "sparkles", emoji: "" },
  "easter monday": { overlay: "confetti", emoji: "" },
  "independence": { overlay: "confetti", emoji: "" },
  "thanksgiving": { overlay: "confetti", emoji: "" },
  "halloween": { overlay: "sparkles", emoji: "" },
  "valentine": { overlay: "hearts", emoji: "" },
  "labour": { overlay: "confetti", emoji: "" },
  "pancasila": { overlay: "confetti", emoji: "" },
  "ascension": { overlay: "sparkles", emoji: "" },
  "assumption": { overlay: "sparkles", emoji: "" },
  "nyepi": { overlay: "sparkles", emoji: "" },
  "waisak": { overlay: "sparkles", emoji: "" },
  "idul fitri": { overlay: "confetti", emoji: "" },
  "idul adha": { overlay: "confetti", emoji: "" },
  "islamic new year": { overlay: "sparkles", emoji: "" },
  "prophet muhammad": { overlay: "sparkles", emoji: "" },
  "imlek": { overlay: "fireworks", emoji: "" },
  "vesak": { overlay: "sparkles", emoji: "" },
  "inauguration": { overlay: "confetti", emoji: "" },
  "president": { overlay: "confetti", emoji: "" },
  "veterans": { overlay: "sparkles", emoji: "" },
  "memorial": { overlay: "sparkles", emoji: "" },
  "juneteenth": { overlay: "confetti", emoji: "" },
  "martin luther": { overlay: "sparkles", emoji: "" },
  "columbus": { overlay: "confetti", emoji: "" },
  "presidents": { overlay: "confetti", emoji: "" },
};

/* ──────────────────────────────────────────────────────
 * API Nager.Date — hari libur nasional
 * ────────────────────────────────────────────────────── */

export interface NagerHoliday {
  date: string; // "2026-08-17"
  localName: string;
  name: string;
  countryCode: string;
  global: boolean;
  types: string[];
}

const CACHE_KEY = "ewk_holiday_cache_v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 jam

interface HolidayCache {
  fetchedAt: number;
  holidays: Record<string, NagerHoliday[]>; // key by countryCode
}

function readCache(): Record<string, NagerHoliday[]> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HolidayCache;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed.holidays;
  } catch {
    return null;
  }
}

function writeCache(countryCode: string, holidays: NagerHoliday[]) {
  try {
    const existing = readCache() || {};
    const updated = { ...existing, [countryCode]: holidays };
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), holidays: updated })
    );
  } catch {
    // Storage penuh/diblokir — abaikan
  }
}

async function fetchCountryHolidays(
  countryCode: string,
  year: number
): Promise<NagerHoliday[]> {
  const resp = await fetch(
    `https://date.nager.at/api/v3/publicholidays/${year}/${countryCode}`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (!resp.ok) throw new Error(`Nager.Date responded ${resp.status}`);
  const data: NagerHoliday[] = await resp.json();
  return data;
}

/**
 * Ambil data hari libur dari Nager.Date untuk suatu negara, dengan cache
 * localStorage 24 jam. Fallback ke array kosong kalau gagal (offline/down).
 */
export async function fetchHolidays(
  countryCode: string,
  year: number
): Promise<NagerHoliday[]> {
  const cached = readCache();
  if (cached?.[countryCode]) return cached[countryCode];
  try {
    const data = await fetchCountryHolidays(countryCode, year);
    writeCache(countryCode, data);
    return data;
  } catch (err) {
    console.warn(`[eventCalendar] Gagal fetch hari libur ${countryCode}:`, err);
    return [];
  }
}

/* ──────────────────────────────────────────────────────
 * Fallback statis — hari libur utama Indonesia & US
 * (2026 — andalkan API untuk update, ini jaring pengaman)
 * ────────────────────────────────────────────────────── */

const STATIC_HOLIDAYS_2026_ID: NagerHoliday[] = [
  { date: "2026-01-01", localName: "Tahun Baru Masehi", name: "New Year's Day", countryCode: "ID", global: true, types: ["Public"] },
  { date: "2026-03-29", localName: "Hari Raya Nyepi", name: "Nyepi", countryCode: "ID", global: true, types: ["Public"] },
  { date: "2026-04-03", localName: "Wafat Isa Almasih", name: "Good Friday", countryCode: "ID", global: true, types: ["Public"] },
  { date: "2026-03-31", localName: "Idul Fitri", name: "Idul Fitri", countryCode: "ID", global: true, types: ["Public"] },
  { date: "2026-04-01", localName: "Idul Fitri", name: "Idul Fitri", countryCode: "ID", global: true, types: ["Public"] },
  { date: "2026-05-01", localName: "Hari Buruh", name: "Labour Day", countryCode: "ID", global: true, types: ["Public"] },
  { date: "2026-05-21", localName: "Kenaikan Isa Almasih", name: "Ascension Day", countryCode: "ID", global: true, types: ["Public"] },
  { date: "2026-06-01", localName: "Hari Lahir Pancasila", name: "Pancasila Day", countryCode: "ID", global: true, types: ["Public"] },
  { date: "2026-06-07", localName: "Idul Adha", name: "Idul Adha", countryCode: "ID", global: true, types: ["Public"] },
  { date: "2026-08-17", localName: "Hari Kemerdekaan", name: "Independence Day", countryCode: "ID", global: true, types: ["Public"] },
  { date: "2026-12-25", localName: "Hari Natal", name: "Christmas Day", countryCode: "ID", global: true, types: ["Public"] },
];

const STATIC_HOLIDAYS_2026_US: NagerHoliday[] = [
  { date: "2026-01-01", localName: "New Year's Day", name: "New Year's Day", countryCode: "US", global: true, types: ["Public"] },
  { date: "2026-01-19", localName: "Martin Luther King Jr. Day", name: "Martin Luther King Jr. Day", countryCode: "US", global: true, types: ["Public"] },
  { date: "2026-02-16", localName: "Presidents' Day", name: "Presidents' Day", countryCode: "US", global: true, types: ["Public"] },
  { date: "2026-05-25", localName: "Memorial Day", name: "Memorial Day", countryCode: "US", global: true, types: ["Public"] },
  { date: "2026-06-19", localName: "Juneteenth", name: "Juneteenth", countryCode: "US", global: true, types: ["Public"] },
  { date: "2026-07-04", localName: "Independence Day", name: "Independence Day", countryCode: "US", global: true, types: ["Public"] },
  { date: "2026-09-07", localName: "Labor Day", name: "Labour Day", countryCode: "US", global: true, types: ["Public"] },
  { date: "2026-10-12", localName: "Columbus Day", name: "Columbus Day", countryCode: "US", global: true, types: ["Public"] },
  { date: "2026-11-26", localName: "Thanksgiving Day", name: "Thanksgiving Day", countryCode: "US", global: true, types: ["Public"] },
  { date: "2026-12-25", localName: "Christmas Day", name: "Christmas Day", countryCode: "US", global: true, types: ["Public"] },
];

/* ──────────────────────────────────────────────────────
 * API TheSportsDB — jadwal pertandingan sepakbola
 * ────────────────────────────────────────────────────── */

/**
 * Liga-liga top yang kita pantau.
 * Key = idLeague, Value = nama singkat (untuk log & matching).
 *
 * TheSportsDB free tier v3 mencakup liga-liga ini. FIFA World Cup juga
 * muncul di eventsday.php saat pertandingan sedang berlangsung.
 */
const TRACKED_LEAGUES: Record<string, string> = {
  "4328": "English Premier League",
  "4331": "German Bundesliga",
  "4332": "Italian Serie A",
  "4335": "Spanish La Liga",
};

export interface SportsDbEvent {
  idEvent: string;
  idLeague?: string;
  strEvent: string;
  strLeague: string;
  strSeason: string;
  dateEvent: string;
  strTime: string;
  strHomeTeam: string;
  strAwayTeam: string;
  strStatus: string;
  strThumb?: string;
}

const SPORTS_CACHE_KEY = "ewk_sports_cache_v1";
const SPORTS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 jam

interface SportsCache {
  fetchedAt: number;
  events: { date: string; leagueId: string; data: SportsDbEvent[] }[];
}

function readSportsCache(): SportsCache | null {
  try {
    const raw = localStorage.getItem(SPORTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SportsCache;
    if (Date.now() - parsed.fetchedAt > SPORTS_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSportsCache(events: SportsCache["events"]) {
  try {
    localStorage.setItem(
      SPORTS_CACHE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), events })
    );
  } catch {
    // abaikan
  }
}

/**
 * Fetch pertandingan sepakbola dari TheSportsDB untuk tanggal tertentu.
 * Otomatis coba semua liga yang di-track.
 */
export async function fetchFootballMatches(dateStr: string): Promise<SportsDbEvent[]> {
  const cached = readSportsCache();
  const cacheKey = { date: dateStr, leagueId: "all" };

  if (cached) {
    const hit = cached.events.find((e) => e.date === dateStr && e.leagueId === "all");
    if (hit) return hit.data;
  }

  try {
    const resp = await fetch(
      `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${dateStr}&s=Soccer`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!resp.ok) throw new Error(`TheSportsDB responded ${resp.status}`);

    const data = await resp.json();
    const allEvents: SportsDbEvent[] = (data?.events || []).filter(
      (e: SportsDbEvent) =>
        e.strLeague &&
        (Object.keys(TRACKED_LEAGUES).includes(e.idLeague) ||
         e.strLeague === "FIFA World Cup")
    );

    // Simpan ke cache
    const existing = readSportsCache();
    const newEvents = [
      ...(existing?.events || []).filter((e) => !(e.date === dateStr && e.leagueId === "all")),
      { date: dateStr, leagueId: "all", data: allEvents },
    ];
    writeSportsCache(newEvents);

    return allEvents;
  } catch (err) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      // offline — silent, wajar
    } else {
      console.debug(`[eventCalendar] Gagal fetch pertandingan ${dateStr}:`, err);
    }
    return [];
  }
}

/**
 * Cek apakah ada pertandingan dari liga top pada hari ini.
 * Kalau ada, trigger overlay confetti ringan dengan emoji .
 */
function matchFootballMatchday(today: Date, matches: SportsDbEvent[]): CalendarEvent | null {
  if (!matches || matches.length === 0) return null;

  // Minimal 3 pertandingan dari liga top = matchday (bukan cuma 1-2)
  const topLeagueCount = matches.filter((m) =>
    Object.keys(TRACKED_LEAGUES).includes(
      // cari idLeague dari match — sayangnya response eventsday tidak
      // selalu menyertakan idLeague di semua versi, fallback ke strLeague
      (m as any).idLeague ?? ""
    )
  ).length;

  if (topLeagueCount < 3) return null;

  return {
    id: `football-matchday-${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`,
    name: { id: "Matchday Sepakbola", en: "Football Matchday" },
    overlay: { type: "confetti", emoji: "" },
    countryCode: "*",
  };
}

/**
 * Ambil semua data sepakbola untuk hari ini — dari cache kalau ada,
 * dari API kalau belum. Panggil sekali di DashboardHeader.
 */
export async function fetchTodayFootball(): Promise<SportsDbEvent[]> {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return fetchFootballMatches(dateStr);
}

/* ──────────────────────────────────────────────────────
 * Deteksi event aktif (gabungan)
 * ────────────────────────────────────────────────────── */

function dateToKey(date: Date): string {
  return `${date.getMonth() + 1}-${date.getDate()}`;
}

function isDateMatch(
  date: Date,
  target: { month: number; day: number }
): boolean {
  return date.getMonth() + 1 === target.month && date.getDate() === target.day;
}

function isInRange(
  date: Date,
  start: { month: number; day: number },
  end: { month: number; day: number }
): boolean {
  const today = (date.getMonth() + 1) * 100 + date.getDate();
  const s = start.month * 100 + start.day;
  const e = end.month * 100 + end.day;
  return today >= s && today <= e;
}

/**
 * Cari event manual yang cocok dengan tanggal hari ini.
 */
function matchManualEvent(
  events: CalendarEvent[],
  today: Date
): CalendarEvent | null {
  for (const ev of events) {
    if (ev.date && isDateMatch(today, ev.date)) return ev;
    if (ev.range && isInRange(today, ev.range.start, ev.range.end)) return ev;
  }
  return null;
}

/**
 * Cari hari libur dari Nager.Date + fallback statis yang cocok dengan
 * tanggal hari ini, lalu map ke overlay config.
 */
function matchHoliday(
  today: Date,
  holidays: NagerHoliday[]
): CalendarEvent | null {
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  for (const h of holidays) {
    if (h.date !== dateStr) continue;

    // Cari manual event dengan matchHoliday dulu
    // (agar bisa dapat gradient khusus)
    // Lewati — manual events sudah di-match terpisah

    // Cari di HOLIDAY_OVERLAY_MAP berdasarkan nama
    const lowerName = h.name.toLowerCase();
    for (const [key, config] of Object.entries(HOLIDAY_OVERLAY_MAP)) {
      if (lowerName.includes(key)) {
        return {
          id: `holiday-${h.countryCode}-${h.date}`,
          name: {
            id: h.localName,
            en: h.name,
          },
          overlay: { type: config.overlay, emoji: config.emoji },
          countryCode: h.countryCode as "ID" | "US" | "*",
        };
      }
    }

    // Fallback: kalau tidak masuk mapping, tetap beri confetti ringan
    return {
      id: `holiday-${h.countryCode}-${h.date}`,
      name: { id: h.localName, en: h.name },
      overlay: { type: "confetti", emoji: "" },
      countryCode: h.countryCode as "ID" | "US" | "*",
    };
  }
  return null;
}

/**
 * Hasil deteksi event aktif — dipanggil dari komponen React.
 */
export interface ActiveEventResult {
  event: CalendarEvent;
  source: "manual" | "api" | "static-fallback" | "sports";
}

/**
 * Cari event yang aktif untuk tanggal tertentu.
 *
 * Prioritas:
 *  1. Manual events & sports events (Valentine, Piala Dunia, dll) — paling spesifik
 *  2. API Nager.Data holidays (kalau sudah di-fetch & cocok)
 *  3. Fallback statis (kalau API gagal)
 *  4. Matchday sepakbola dari liga top (kalau ada pertandingan hari ini)
 *
 * @param holidaysFromApi Hasil fetch dari Nager.Date (opsional — bisa null
 *   kalau belum di-fetch / masih loading).
 * @param footballMatches Hasil fetch dari TheSportsDB (opsional — null kalau
 *   belum di-fetch).
 */
export function getActiveEvent(
  today: Date,
  holidaysFromApi: NagerHoliday[] | null,
  footballMatches?: SportsDbEvent[] | null
): ActiveEventResult | null {
  // 1. Cek manual events dulu — override prioritas
  const manual = matchManualEvent(MANUAL_EVENTS, today);
  if (manual) return { event: manual, source: "manual" };

  // 2. Cek sports events (Piala Dunia, UCL, Euro, Olimpiade) — override juga
  const sports = matchManualEvent(SPORTS_EVENTS, today);
  if (sports) return { event: sports, source: "sports" };

  // 3. Cek dari API / fallback statis
  let holidays = holidaysFromApi;
  if (!holidays || holidays.length === 0) {
    // Fallback ke data statis berdasarkan tahun
    const year = today.getFullYear();
    // Gabung ID + US untuk coverage internasional
    holidays = [
      ...STATIC_HOLIDAYS_2026_ID.map((h) => ({ ...h, date: h.date.replace("2026", String(year)) })),
      ...STATIC_HOLIDAYS_2026_US.map((h) => ({ ...h, date: h.date.replace("2026", String(year)) })),
    ];
  }

  const matched = matchHoliday(today, holidays);
  if (matched) return { event: matched, source: holidaysFromApi ? "api" : "static-fallback" };

  // 4. Cek matchday sepakbola dari liga top
  if (footballMatches) {
    const matchday = matchFootballMatchday(today, footballMatches);
    if (matchday) return { event: matchday, source: "sports" };
  }

  return null;
}

/**
 * Hook-friendly helper: ambil data holiday + sepakbola dari API.
 * Panggil sekali di komponen DashboardHeader.
 *
 * Returns: { holidays, footballMatches }
 */
export async function fetchAllEvents(): Promise<{
  holidays: NagerHoliday[];
  footballMatches: SportsDbEvent[];
}> {
  const year = new Date().getFullYear();

  const [idHolidays, usHolidays, footballMatches] = await Promise.all([
    fetchHolidays("ID", year),
    fetchHolidays("US", year),
    fetchTodayFootball(),
  ]);

  return {
    holidays: [...idHolidays, ...usHolidays],
    footballMatches,
  };
}
