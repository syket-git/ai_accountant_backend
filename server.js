import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { extractExpenseData, transcribeAudio } from "./services/openai.js";
import { saveTransaction } from "./services/supabase.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

// Main webhook endpoint (replacing n8n)
app.post("/api/process", upload.single("file"), async (req, res) => {
  try {
    const { mode, text, userId, sessionId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    let inputText = "";

    // Handle voice mode
    if (mode === "voice" && req.file) {
      console.log("Transcribing audio...");
      inputText = await transcribeAudio(req.file.buffer, req.file.originalname);
      console.log("Transcription:", inputText);
    }
    // Handle text mode
    else if (mode === "text" && text) {
      inputText = text;
    } else {
      return res.status(400).json({ error: "Invalid mode or missing data" });
    }

    // Extract expense/income data using OpenAI
    console.log("Extracting expense data...");
    const expenseData = await extractExpenseData(inputText, userId);
    console.log("Extracted data:", expenseData);

    // Save to Supabase
    if (expenseData.amount && expenseData.type) {
      await saveTransaction({
        userId,
        amount: expenseData.amount,
        currency: expenseData.currency || "BDT",
        category: expenseData.category || "other",
        notes: expenseData.notes || inputText,
        type: expenseData.type,
        date: expenseData.date || new Date().toISOString().split("T")[0],
      });
    }

    // Generate response message
    const response = generateResponseMessage(expenseData);

    res.json({
      output: response,
      reply: response,
      data: expenseData,
    });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({
      error: "Failed to process request",
      message: error.message,
    });
  }
});

// Get user transactions
app.get("/api/transactions/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { getTransactions } = await import("./services/supabase.js");
    const transactions = await getTransactions(userId);
    res.json({ transactions });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// Delete transaction
app.delete("/api/transactions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { deleteTransaction } = await import("./services/supabase.js");
    await deleteTransaction(id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting transaction:", error);
    res.status(500).json({ error: "Failed to delete transaction" });
  }
});

function generateResponseMessage(data) {
  if (!data.amount || !data.type) {
    return "I couldn't extract the transaction details. Please provide the amount and specify if it's an expense or income.";
  }

  const emoji = data.type === "expense" ? "💸" : "💰";
  const action =
    data.type === "expense" ? "recorded expense" : "recorded income";

  return `${emoji} Successfully ${action}: ${data.currency || "BDT"} ${
    data.amount
  } for ${data.category || "other"}${data.notes ? ` (${data.notes})` : ""} on ${
    data.date || "today"
  }`;
}

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📊 Ready to process expense tracking requests`);
});
