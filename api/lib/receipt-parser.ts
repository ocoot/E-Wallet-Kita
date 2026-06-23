import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const GEMINI_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
].filter(Boolean) as string[];

const OPENAI_KEYS = [
  process.env.OPENAI_API_KEY_1,
  process.env.OPENAI_API_KEY_2,
  process.env.OPENAI_API_KEY_3,
  process.env.OPENAI_API_KEY_4,
].filter(Boolean) as string[];

const CLAUDE_KEYS = [
  process.env.ANTHROPIC_API_KEY_1,
  process.env.ANTHROPIC_API_KEY_2,
  process.env.ANTHROPIC_API_KEY_3,
  process.env.ANTHROPIC_API_KEY_4,
].filter(Boolean) as string[];

export interface ParsedReceipt {
  merchant_name: string;
  receipt_date: string;
  total_amount: number;
  total_items: number;
  items: Array<{
    name: string;
    qty: number;
    unit_price: number;
    subtotal: number;
  }>;
}

function shouldFallback(err: any) {
  const text = JSON.stringify(err);

  return (
    text.includes("503") ||
    text.includes("429") ||
    text.includes("UNAVAILABLE") ||
    text.includes("RESOURCE_EXHAUSTED") ||
    text.includes("RATE_LIMIT")
  );
}

const systemInstruction = `Anda adalah OCR parser struk belanja Indonesia tepercaya.
Analisis gambar struk belanja yang diberikan dan ekstrak detail berikut dalam bentuk JSON terstruktur:
1. 'merchant_name': Nama toko/merchant (misal: Indomaret, Alfamart, Kopi Kenangan, dll.).
2. 'receipt_date': Tanggal di struk belanja dalam format ISO (YYYY-MM-DD), default ke tanggal hari ini jika tidak terbaca.
3. 'total_amount': Total nominal uang yang dibayarkan (angka desimal/integer).
4. 'total_items': Jumlah total item barang atau kuantitas barang belanjaan.
5. 'items': Daftar barang belanjaan, masing-masing berisi 'name' (nama barang), 'qty' (kuantitas), 'unit_price' (harga satuan), dan 'subtotal' (subtotal).

Kembalikan data kosong atau nilai default yang logis jika ada kolom informasi yang tidak terbaca sama sekali dari struk. JANGAN mengarang data fiktif di luar struk.`;

async function parseWithGemini(imageBase64: string, mimeType: string, apiKey: string): Promise<ParsedReceipt> {
  const ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' }
    }
  });
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: {
      parts: [
        { inlineData: { mimeType, data: imageBase64 } },
        { text: "Ekstrak struk belanja ini ke format JSON sesuai skema yang diminta." }
      ]
    },
    config: {
      systemInstruction,
      responseMimeType: "application/json",
    }
  });

  const parsedJSON = JSON.parse(response.text?.trim() || "{}");
  return {
    merchant_name: parsedJSON.merchant_name || "Toko Tidak Dikenal",
    receipt_date: parsedJSON.receipt_date || new Date().toISOString().split("T")[0],
    total_amount: parsedJSON.total_amount || 0,
    total_items: parsedJSON.total_items || (parsedJSON.items ? parsedJSON.items.length : 0),
    items: parsedJSON.items || []
  };
}

async function parseWithOpenAI(imageBase64: string, apiKey: string): Promise<ParsedReceipt> {
  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: systemInstruction
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Ekstrak struk belanja ini ke format JSON sesuai skema yang diminta." },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
        ]
      }
    ],
    response_format: { type: "json_object" }
  });

  const parsedJSON = JSON.parse(response.choices[0].message.content || "{}");
  return {
    merchant_name: parsedJSON.merchant_name || "Toko Tidak Dikenal",
    receipt_date: parsedJSON.receipt_date || new Date().toISOString().split("T")[0],
    total_amount: parsedJSON.total_amount || 0,
    total_items: parsedJSON.total_items || (parsedJSON.items ? parsedJSON.items.length : 0),
    items: parsedJSON.items || []
  };
}

async function parseWithClaude(imageBase64: string, apiKey: string): Promise<ParsedReceipt> {
  const claude = new Anthropic({ apiKey });

  const response = await claude.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    system: systemInstruction,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Ekstrak struk belanja ini ke format JSON sesuai skema yang diminta." },
        { 
          type: "image", 
          source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } 
        }
      ]
    }]
  });

  const content = (response.content[0] as any).text;
  const parsedJSON = JSON.parse(content || "{}");
  return {
    merchant_name: parsedJSON.merchant_name || "Toko Tidak Dikenal",
    receipt_date: parsedJSON.receipt_date || new Date().toISOString().split("T")[0],
    total_amount: parsedJSON.total_amount || 0,
    total_items: parsedJSON.total_items || (parsedJSON.items ? parsedJSON.items.length : 0),
    items: parsedJSON.items || []
  };
}

export async function parseReceipt(imageBase64: string): Promise<ParsedReceipt> {
  let cleanBase64 = imageBase64;
  let mimeType = "image/jpeg";
  if (imageBase64.includes(";base64,")) {
    const parts = imageBase64.split(";base64,");
    cleanBase64 = parts[1];
    mimeType = parts[0].replace("data:", "").split(";")[0];
  }

  for (const key of GEMINI_KEYS) {
    try {
      return await parseWithGemini(cleanBase64, mimeType, key);
    } catch (err: any) {
      if (!shouldFallback(err)) throw err;
      console.log("⚠️ Gemini API key unavailable or limit reached, trying next...");
    }
  }

  for (const key of OPENAI_KEYS) {
    try {
      return await parseWithOpenAI(cleanBase64, key);
    } catch (err: any) {
      if (!shouldFallback(err)) throw err;
      console.log("⚠️ OpenAI API key unavailable or limit reached, trying next...");
    }
  }

  for (const key of CLAUDE_KEYS) {
    try {
      return await parseWithClaude(cleanBase64, key);
    } catch (err: any) {
      if (!shouldFallback(err)) throw err;
      console.log("⚠️ Claude API key unavailable or limit reached, trying next...");
    }
  }
  
  throw new Error("All receipt parsing services are currently unavailable or overloaded.");
}
