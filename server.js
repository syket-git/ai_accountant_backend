import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { extractExpenseData, transcribeAudio } from "./services/openai.js";
import {
  saveTransaction,
  saveLoan,
  recordLoanRepayment,
  saveFeedback,
} from "./services/supabase.js";

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

    // Extract data using OpenAI (now with intent detection)
    console.log("Extracting data...");
    const extractedData = await extractExpenseData(inputText, userId);
    console.log("Extracted data:", extractedData);

    let response;

    if (extractedData.intent === "new_loan") {
      // Handle new loan
      if (extractedData.principal_amount) {
        const loan = await saveLoan({ userId, ...extractedData });
        // Also record as income transaction (money received)
        await saveTransaction({
          userId,
          amount: extractedData.principal_amount,
          currency: extractedData.currency || "BDT",
          category: "loan",
          notes: `Loan from ${extractedData.lender_name}`,
          type: "income",
          date: extractedData.date || new Date().toISOString().split("T")[0],
        });
        response = generateLoanResponseMessage(extractedData, loan);
      } else {
        response = "I couldn't extract the loan details. Please provide the loan amount and lender name.";
      }
    } else if (extractedData.intent === "loan_repayment") {
      // Handle loan repayment
      if (extractedData.amount && extractedData.lender_name) {
        const result = await recordLoanRepayment(
          userId,
          extractedData.lender_name,
          extractedData.amount,
          extractedData.date || new Date().toISOString().split("T")[0],
          extractedData.currency || "BDT"
        );
        response = generateRepaymentResponseMessage(extractedData, result);
      } else {
        response = "I couldn't extract the repayment details. Please provide the amount and which loan it's for.";
      }
    } else {
      // Default: regular transaction (existing flow, unchanged)
      if (extractedData.amount && extractedData.type) {
        await saveTransaction({
          userId,
          amount: extractedData.amount,
          currency: extractedData.currency || "BDT",
          category: extractedData.category || "other",
          notes: extractedData.notes || inputText,
          type: extractedData.type,
          date: extractedData.date || new Date().toISOString().split("T")[0],
        });
      }
      response = generateResponseMessage(extractedData);
    }

    res.json({
      output: response,
      reply: response,
      data: extractedData,
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

// Get user loans
app.get("/api/loans/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { getLoans } = await import("./services/supabase.js");
    const loans = await getLoans(userId);
    res.json({ loans });
  } catch (error) {
    console.error("Error fetching loans:", error);
    res.status(500).json({ error: "Failed to fetch loans" });
  }
});

// Delete loan
app.delete("/api/loans/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { deleteLoan } = await import("./services/supabase.js");
    await deleteLoan(id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting loan:", error);
    res.status(500).json({ error: "Failed to delete loan" });
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

function generateLoanResponseMessage(data) {
  const type = data.loan_type === "personal" ? "personal loan" : "bank loan";
  let msg = `🏦 Loan recorded: ${data.currency || "BDT"} ${data.principal_amount} ${type} from ${data.lender_name}`;
  if (data.interest_rate) msg += ` at ${data.interest_rate}% interest`;
  if (data.tenure_months) msg += ` for ${data.tenure_months} months`;
  msg += ` on ${data.date || "today"}`;
  return msg;
}

function generateRepaymentResponseMessage(data, result) {
  if (result.loan) {
    const statusMsg = result.loan.status === "paid_off"
      ? "🎉 This loan is now fully paid off!"
      : `Remaining balance: ${result.loan.currency} ${Number(result.loan.remaining_balance).toFixed(2)}`;
    return `💰 Repayment recorded: ${data.currency || "BDT"} ${data.amount} to ${data.lender_name}. ${statusMsg}`;
  }
  return `💰 Repayment of ${data.currency || "BDT"} ${data.amount} to ${data.lender_name} recorded as expense (no matching active loan found).`;
}

// Submit feedback
app.post("/api/feedback", async (req, res) => {
  try {
    const { userId, userName, userEmail, rating, comment } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "rating must be between 1 and 5" });
    }

    await saveFeedback({ userId, userName, userEmail, rating, comment });
    res.json({ success: true, message: "Feedback submitted successfully" });
  } catch (error) {
    console.error("Error saving feedback:", error);
    res.status(500).json({ error: "Failed to save feedback" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📊 Ready to process expense tracking requests`);
});
