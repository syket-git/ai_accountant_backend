import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Save a transaction to the database
 */
export async function saveTransaction(data) {
  try {
    const { error } = await supabase.from("transactions").insert({
      user_id: data.userId,
      amount: data.amount,
      currency: data.currency,
      category: data.category,
      notes: data.notes,
      type: data.type,
      date: data.date,
    });

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error("Error saving transaction:", error);
    throw error;
  }
}

/**
 * Get all transactions for a user
 */
export async function getTransactions(userId, limit = 100) {
  try {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching transactions:", error);
    throw error;
  }
}

/**
 * Delete a transaction
 */
export async function deleteTransaction(transactionId) {
  try {
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", transactionId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error("Error deleting transaction:", error);
    throw error;
  }
}

/**
 * Get transaction summary for a user (total expenses, income, by category, etc.)
 */
export async function getTransactionSummary(userId, startDate, endDate) {
  try {
    let query = supabase
      .from("transactions")
      .select("amount, type, category, currency")
      .eq("user_id", userId);

    if (startDate) {
      query = query.gte("date", startDate);
    }
    if (endDate) {
      query = query.lte("date", endDate);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Calculate summary
    const summary = {
      totalExpense: 0,
      totalIncome: 0,
      byCategory: {},
      transactions: data || [],
    };

    (data || []).forEach((transaction) => {
      if (transaction.type === "expense") {
        summary.totalExpense += transaction.amount;
      } else if (transaction.type === "income") {
        summary.totalIncome += transaction.amount;
      }

      // Category breakdown
      if (!summary.byCategory[transaction.category]) {
        summary.byCategory[transaction.category] = {
          expense: 0,
          income: 0,
        };
      }

      if (transaction.type === "expense") {
        summary.byCategory[transaction.category].expense += transaction.amount;
      } else {
        summary.byCategory[transaction.category].income += transaction.amount;
      }
    });

    summary.balance = summary.totalIncome - summary.totalExpense;

    return summary;
  } catch (error) {
    console.error("Error fetching transaction summary:", error);
    throw error;
  }
}
