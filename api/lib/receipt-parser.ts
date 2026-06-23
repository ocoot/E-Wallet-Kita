import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' }
    }
  });
}

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

const MODELS = ["gemini-2.5-flash"];

export async function parseReceipt(imageBase64: string): Promise<ParsedReceipt> {
  if (!ai) {
    throw new Error("Gemini API key is not configured on the server.");
  }

  // Clean base64 and parse mimeType
  let cleanBase64 = imageBase64;
  let mimeType = "image/jpeg";

  if (imageBase64.includes(";base64,")) {
    const parts = imageBase64.split(";base64,");
    cleanBase64 = parts[1];
    mimeType = parts[0].replace("data:", "").split(";")[0];
  }

  const imagePart = {
    inlineData: {
      mimeType: mimeType,
      data: cleanBase64,
    },
  };

  const systemInstruction = `Anda adalah OCR parser struk belanja Indonesia tepercaya.
Analisis gambar struk belanja yang diberikan dan ekstrak detail berikut dalam bentuk JSON terstruktur:
1. 'merchant_name': Nama toko/merchant (misal: Indomaret, Alfamart, Kopi Kenangan, dll.).
2. 'receipt_date': Tanggal di struk belanja dalam format ISO (YYYY-MM-DD), default ke tanggal hari ini jika tidak terbaca.
3. 'total_amount': Total nominal uang yang dibayarkan (angka desimal/integer).
4. 'total_items': Jumlah total item barang atau kuantitas barang belanjaan.
5. 'items': Daftar barang belanjaan, masing-masing berisi 'name' (nama barang), 'qty' (kuantitas), 'unit_price' (harga satuan), dan 'subtotal' (subtotal).

Kembalikan data kosong atau nilai default yang logis jika ada kolom informasi yang tidak terbaca sama sekali dari struk. JANGAN mengarang data fiktif di luar struk.`;

  let lastError: any = null;

  for (const model of MODELS) {
    try {
      console.log(`🤖 Parsing receipt using model: ${model}`);
      console.log("========== RECEIPT OCR ==========");
      console.log("Model:", model);
      console.log("Mime:", mimeType);
      console.log("Base64 Length:", cleanBase64 ? cleanBase64.length : "null");
      console.log("=================================");
      
      const response = await ai.models.generateContent({
        model: model,
        contents: {
          parts: [
            imagePart,
            { text: "Ekstrak struk belanja ini ke format JSON sesuai skema yang diminta." }
          ]
        },
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              merchant_name: { type: Type.STRING },
              receipt_date: { type: Type.STRING },
              total_amount: { type: Type.NUMBER },
              total_items: { type: Type.NUMBER },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    qty: { type: Type.NUMBER },
                    unit_price: { type: Type.NUMBER },
                    subtotal: { type: Type.NUMBER }
                  },
                  required: ["name", "qty", "unit_price", "subtotal"]
                }
              }
            },
            required: ["merchant_name", "receipt_date", "total_amount", "total_items", "items"]
          }
        }
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error(`Empty response from model ${model}`);
      }

      const parsedJSON = JSON.parse(responseText.trim());
      return {
        merchant_name: parsedJSON.merchant_name || "Toko Tidak Dikenal",
        receipt_date: parsedJSON.receipt_date || new Date().toISOString().split("T")[0],
        total_amount: parsedJSON.total_amount || 0,
        total_items: parsedJSON.total_items || (parsedJSON.items ? parsedJSON.items.length : 0),
        items: parsedJSON.items || []
      };
    } catch (err: any) {
      console.error(`❌ parseReceipt failed with model ${model}:`);
      console.error(err);
      if (err?.response) {
        console.error("Response:", err.response);
      }
      if (err?.stack) {
        console.error("Stack:", err.stack);
      }
      lastError = err;
    }
  }

  throw new Error(`Seluruh model Gemini gagal memproses struk. Error terakhir: ${lastError?.message || lastError}`);
}
