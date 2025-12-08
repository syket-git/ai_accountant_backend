import dotenv from "dotenv";
import fs from "fs";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Transcribe audio using OpenAI Whisper API
 */
export async function transcribeAudio(
  audioBuffer,
  originalFilename = "audio.webm"
) {
  try {
    // Create a temporary file
    const tempDir = path.join(__dirname, "../temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.join(
      tempDir,
      `temp_${Date.now()}_${originalFilename}`
    );
    fs.writeFileSync(tempFilePath, audioBuffer);

    // Transcribe using Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1",
      language: "en", // You can make this dynamic or auto-detect
    });

    // Clean up temp file
    fs.unlinkSync(tempFilePath);

    return transcription.text;
  } catch (error) {
    console.error("Transcription error:", error);
    throw new Error("Failed to transcribe audio: " + error.message);
  }
}

/**
 * Extract expense/income data from text using OpenAI Chat API
 */
export async function extractExpenseData(text, userId) {
  try {
    // Get current date
    const today = new Date().toISOString().split("T")[0];
    
    const systemPrompt = `You are an AI assistant for an expense tracking application. 
Your job is to extract structured financial transaction data from user input.

IMPORTANT: Today's date is ${today}. Use this as the default date unless the user specifies a different date.

Extract the following information:
- amount: numeric value (required)
- currency: currency code (default: BDT)
- category: expense/income category (shopping, housing, food, transportation, entertainment, healthcare, education, other)
- notes: brief description
- type: either "expense" or "income" (required)
- date: YYYY-MM-DD format (default: ${today})

Response format (JSON only, no markdown):
{
  "amount": number,
  "currency": "BDT",
  "category": "string",
  "notes": "string",
  "type": "expense" or "income",
  "date": "YYYY-MM-DD"
}

Examples:
Input: "Spent 200 on shopping today"
Output: {"amount": 200, "currency": "BDT", "category": "shopping", "notes": "shopping", "type": "expense", "date": "${today}"}

Input: "Paid 15000 for home rent"
Output: {"amount": 15000, "currency": "BDT", "category": "housing", "notes": "home rent", "type": "expense", "date": "${today}"}

Input: "Received 5000 from Mehdi"
Output: {"amount": 5000, "currency": "BDT", "category": "other", "notes": "from Mehdi", "type": "income", "date": "${today}"}

Input: "Spent 300 yesterday"
Output: {"amount": 300, "currency": "BDT", "category": "other", "notes": "Spent 300 yesterday", "type": "expense", "date": "calculate yesterday's date based on ${today}"}

If the input is unclear or missing critical info, make reasonable assumptions based on context.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Fast and cost-effective
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0].message.content;
    const parsedData = JSON.parse(responseText);

    // Validate and set defaults
    return {
      amount: parsedData.amount || 0,
      currency: parsedData.currency || "BDT",
      category: parsedData.category || "other",
      notes: parsedData.notes || text,
      type: parsedData.type === "income" ? "income" : "expense",
      date: parsedData.date || new Date().toISOString().split("T")[0],
    };
  } catch (error) {
    console.error("OpenAI extraction error:", error);
    throw new Error("Failed to extract expense data: " + error.message);
  }
}
