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

    const systemPrompt = `You are an AI assistant for an expense and loan tracking application.
Your job is to extract structured financial data from user input.

IMPORTANT: Today's date is ${today}. Use this as the default date unless the user specifies a different date.

First, determine the user's INTENT from these three options:
1. "transaction" — a regular expense or income (e.g. "spent 200 on food", "received salary 50000")
2. "new_loan" — the user is taking a loan from a bank or borrowing from someone (e.g. "took 50000 loan from BRAC Bank", "borrowed 5000 from Rahim")
3. "loan_repayment" — the user is paying back an installment or amount for an existing loan (e.g. "paid 2000 installment for BRAC Bank loan", "repaid 5000 to Rahim")

Then return the appropriate JSON based on the intent:

FOR "transaction" intent:
{
  "intent": "transaction",
  "amount": number,
  "currency": "BDT",
  "category": "shopping" | "housing" | "food" | "transportation" | "entertainment" | "healthcare" | "education" | "loan" | "loan_repayment" | "other",
  "notes": "string",
  "type": "expense" or "income",
  "date": "YYYY-MM-DD"
}

FOR "new_loan" intent:
{
  "intent": "new_loan",
  "lender_name": "string (bank name or person name)",
  "loan_type": "bank" or "personal",
  "principal_amount": number,
  "interest_rate": number (annual %, default 0),
  "tenure_months": number or null,
  "monthly_installment": number or null,
  "currency": "BDT",
  "date": "YYYY-MM-DD",
  "notes": "string"
}

FOR "loan_repayment" intent:
{
  "intent": "loan_repayment",
  "lender_name": "string (who the loan is from)",
  "amount": number,
  "currency": "BDT",
  "date": "YYYY-MM-DD",
  "notes": "string"
}

Examples:
Input: "Spent 200 on shopping today"
Output: {"intent": "transaction", "amount": 200, "currency": "BDT", "category": "shopping", "notes": "shopping", "type": "expense", "date": "${today}"}

Input: "Received 5000 from Mehdi"
Output: {"intent": "transaction", "amount": 5000, "currency": "BDT", "category": "other", "notes": "from Mehdi", "type": "income", "date": "${today}"}

Input: "I took a 50000 BDT loan from BRAC Bank at 12% interest for 2 years"
Output: {"intent": "new_loan", "lender_name": "BRAC Bank", "loan_type": "bank", "principal_amount": 50000, "interest_rate": 12, "tenure_months": 24, "monthly_installment": null, "currency": "BDT", "date": "${today}", "notes": "Loan from BRAC Bank"}

Input: "Borrowed 5000 from Rahim, will pay back next month"
Output: {"intent": "new_loan", "lender_name": "Rahim", "loan_type": "personal", "principal_amount": 5000, "interest_rate": 0, "tenure_months": 1, "monthly_installment": null, "currency": "BDT", "date": "${today}", "notes": "Borrowed from Rahim"}

Input: "Paid 2000 installment for BRAC Bank loan"
Output: {"intent": "loan_repayment", "lender_name": "BRAC Bank", "amount": 2000, "currency": "BDT", "date": "${today}", "notes": "Loan installment to BRAC Bank"}

Input: "Repaid 5000 to Rahim"
Output: {"intent": "loan_repayment", "lender_name": "Rahim", "amount": 5000, "currency": "BDT", "date": "${today}", "notes": "Repayment to Rahim"}

Input: "Spent 300 yesterday"
Output: {"intent": "transaction", "amount": 300, "currency": "BDT", "category": "other", "notes": "Spent 300 yesterday", "type": "expense", "date": "calculate yesterday's date based on ${today}"}

If the input is unclear or missing critical info, make reasonable assumptions based on context.
When in doubt between transaction and loan, default to "transaction".`;

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

    const intent = parsedData.intent || "transaction";
    const defaultDate = new Date().toISOString().split("T")[0];

    if (intent === "new_loan") {
      return {
        intent: "new_loan",
        lender_name: parsedData.lender_name || "Unknown",
        loan_type: parsedData.loan_type === "personal" ? "personal" : "bank",
        principal_amount: parsedData.principal_amount || 0,
        interest_rate: parsedData.interest_rate || 0,
        tenure_months: parsedData.tenure_months || null,
        monthly_installment: parsedData.monthly_installment || null,
        currency: parsedData.currency || "BDT",
        date: parsedData.date || defaultDate,
        notes: parsedData.notes || text,
      };
    }

    if (intent === "loan_repayment") {
      return {
        intent: "loan_repayment",
        lender_name: parsedData.lender_name || "Unknown",
        amount: parsedData.amount || 0,
        currency: parsedData.currency || "BDT",
        date: parsedData.date || defaultDate,
        notes: parsedData.notes || text,
      };
    }

    // Default: transaction (backward compatible)
    return {
      intent: "transaction",
      amount: parsedData.amount || 0,
      currency: parsedData.currency || "BDT",
      category: parsedData.category || "other",
      notes: parsedData.notes || text,
      type: parsedData.type === "income" ? "income" : "expense",
      date: parsedData.date || defaultDate,
    };
  } catch (error) {
    console.error("OpenAI extraction error:", error);
    throw new Error("Failed to extract expense data: " + error.message);
  }
}
