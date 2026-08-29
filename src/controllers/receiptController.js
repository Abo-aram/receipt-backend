import crypto from "crypto";
import sharp from "sharp";
import { GoogleGenAI } from "@google/genai";
import { receiptSchema } from "../schemas/receiptSchema.js";

// Cache AI client instance to avoid repeated initialization overhead
let aiClientInstance = null;

function getAIClient(apiKey) {
  if (!aiClientInstance) {
    aiClientInstance = new GoogleGenAI({ apiKey });
  }
  return aiClientInstance;
}

// In-Memory Deduplication Cache (Key: SHA-256 Hash of image buffer, Value: { data, expiresAt })
const scanCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_ENTRIES = 500;

function getCachedResult(hash) {
  const entry = scanCache.get(hash);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    scanCache.delete(hash);
    return null;
  }
  return entry.data;
}

function setCachedResult(hash, data) {
  if (scanCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = scanCache.keys().next().value;
    scanCache.delete(oldestKey);
  }
  scanCache.set(hash, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function getFriendlyErrorMessage(error) {
  const msg = error?.message || String(error);

  if (
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.toLowerCase().includes("quota")
  ) {
    const retryMatch =
      msg.match(/retry in ([0-9.]+)s/i) ||
      msg.match(/retryDelay":"([0-9]+)s"/i);

    if (retryMatch && retryMatch[1]) {
      const seconds = Math.ceil(parseFloat(retryMatch[1]));
      return `Free tier rate limit reached. Please wait ${seconds} seconds and try again.`;
    }
    return "The AI service is currently busy (rate limit). Please wait a few seconds and try again.";
  }
  if (msg.includes("API_KEY") || msg.includes("API key")) {
    return "Server configuration issue: GEMINI_API_KEY is invalid or missing.";
  }
  if (msg.includes("404") || msg.includes("NOT_FOUND")) {
    return "AI model service temporarily unavailable. Please try again.";
  }
  if (
    msg.includes("ENOTFOUND") ||
    msg.includes("fetch failed") ||
    msg.includes("ETIMEDOUT")
  ) {
    return "Network connection issue reaching AI services. Please check your internet connection.";
  }
  if (msg.includes("JSON") || msg.includes("SyntaxError")) {
    return "Could not read receipt items clearly. Please capture a sharper photo with better lighting.";
  }

  return "Could not process this receipt. Please make sure the photo is clear, upright, and contains a readable receipt.";
}

export const parseReceipt = async (req, res) => {
  const startTime = Date.now();
  const reqTime = new Date().toLocaleTimeString();

  console.log(`\n=======================================================`);
  console.log(`📥 [${reqTime}] NEW RECEIPT UPLOAD REQUEST`);
  console.log(`=======================================================`);

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("❌ [CONFIG ERROR] GEMINI_API_KEY is not defined in environment.");
      return res.status(500).json({
        success: false,
        error: "Server configuration issue: GEMINI_API_KEY is not defined.",
      });
    }

    if (!req.file) {
      console.warn("⚠️ [VALIDATION ERROR] No image file attached in multipart request.");
      return res.status(400).json({
        success: false,
        error: "No image was uploaded. Please take or pick a photo of a receipt.",
      });
    }

    const originalSizeKb = (req.file.buffer.length / 1024).toFixed(1);
    console.log(`📸 [STEP 1/4] Image received:`);
    console.log(`   • Original File:   ${req.file.originalname || "image.jpg"}`);
    console.log(`   • Original Size:   ${originalSizeKb} KB`);
    console.log(`   • MIME Type:       ${req.file.mimetype}`);

    // 1. Fast image optimization (scales down to 1024px width, auto-oriented)
    const optStart = Date.now();
    const optimizedBuffer = await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 1024, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const optTime = Date.now() - optStart;
    const optimizedSizeKb = (optimizedBuffer.length / 1024).toFixed(1);

    console.log(`🖼️  [STEP 2/4] Sharp Image Optimization:`);
    console.log(`   • Compressed Size: ${optimizedSizeKb} KB (${((1 - optimizedBuffer.length / req.file.buffer.length) * 100).toFixed(0)}% reduction)`);
    console.log(`   • Duration:        ${optTime} ms`);

    // 2. Compute SHA-256 hash for deduplication
    const imageHash = crypto.createHash("sha256").update(optimizedBuffer).digest("hex");
    const cachedData = getCachedResult(imageHash);

    if (cachedData) {
      const totalTime = Date.now() - startTime;
      console.log(`⚡ [CACHE HIT] Served duplicate scan from memory in ${totalTime}ms ($0 Gemini API cost)`);
      console.log(`=======================================================\n`);
      return res.status(200).json({
        success: true,
        data: cachedData,
        cached: true,
      });
    }

    const ai = getAIClient(apiKey);
    const imageBase64 = optimizedBuffer.toString("base64");
    const modelName = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

    // 3. Direct extraction with optimized fast vision model
    console.log(`🤖 [STEP 3/4] Dispatching to Google Gemini Vision AI...`);
    console.log(`   • Target Model:    ${modelName}`);
    console.log(`   • Payload Size:    ${(imageBase64.length / 1024).toFixed(1)} KB (Base64)`);

    const aiStart = Date.now();
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: imageBase64,
              },
            },
            {
              text: "Analyze this image. First determine if this image is a valid, readable receipt/bill/invoice. If it is NOT a receipt or is unreadable, set isReceipt to false with an errorMessage. If it IS a receipt, extract the exact currency symbol or currency code shown on the receipt (e.g. $, €, £, ¥, ₹, IQD, USD, EUR, GBP, SAR, AED, etc.), all line items with quantities and prices, subtotal, tax, tip, and total amount.",
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: receiptSchema,
        temperature: 0.1,
      },
    });
    const aiTime = Date.now() - aiStart;

    console.log(`✨ [STEP 4/4] Gemini response received in ${aiTime} ms`);

    const parsedData = JSON.parse(response.text);

    // 4. Receipt detection & validation
    if (
      parsedData.isReceipt === false ||
      !parsedData.items ||
      parsedData.items.length === 0
    ) {
      console.warn(`⚠️ [OCR WARNING] Non-receipt or unreadable image uploaded.`);
      console.warn(`   • Reason: ${parsedData.errorMessage || "No items detected"}`);
      console.log(`=======================================================\n`);
      return res.status(422).json({
        success: false,
        error:
          parsedData.errorMessage ||
          "No receipt detected in this image. Please take a clear picture of a valid receipt.",
      });
    }

    // Save successful parse to cache
    setCachedResult(imageHash, parsedData);

    const totalTime = Date.now() - startTime;
    const currency = parsedData.currency || "$";

    console.log(`-------------------------------------------------------`);
    console.log(`🎉 [SUCCESS] Receipt Data Extracted in ${totalTime} ms:`);
    console.log(`   • Merchant:  ${parsedData.merchantName || "Unknown"}`);
    console.log(`   • Currency:  ${currency}`);
    console.log(`   • Items:     ${parsedData.items.length} item(s) found`);
    parsedData.items.forEach((item, idx) => {
      console.log(
        `     [${idx + 1}] ${item.name} (x${item.quantity || 1}) - ${currency} ${Number(item.price).toFixed(2)}`
      );
    });
    if (parsedData.subtotal != null) console.log(`   • Subtotal:  ${currency} ${Number(parsedData.subtotal).toFixed(2)}`);
    if (parsedData.tax != null)      console.log(`   • Tax:       ${currency} ${Number(parsedData.tax).toFixed(2)}`);
    if (parsedData.tip != null)      console.log(`   • Tip:       ${currency} ${Number(parsedData.tip).toFixed(2)}`);
    console.log(`   • Total:     ${currency} ${Number(parsedData.total).toFixed(2)}`);
    console.log(`=======================================================\n`);

    return res.status(200).json({ success: true, data: parsedData });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`❌ [OCR ERROR] Parsing failed after ${totalTime} ms:`, error);
    console.log(`=======================================================\n`);
    const friendlyMessage = getFriendlyErrorMessage(error);
    return res.status(500).json({
      success: false,
      error: friendlyMessage,
    });
  }
};
