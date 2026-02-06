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
 * Save a new loan to the database
 */
export async function saveLoan(data) {
  try {
    const { data: loan, error } = await supabase
      .from("loans")
      .insert({
        user_id: data.userId,
        lender_name: data.lender_name,
        loan_type: data.loan_type,
        principal_amount: data.principal_amount,
        interest_rate: data.interest_rate || 0,
        tenure_months: data.tenure_months || null,
        monthly_installment: data.monthly_installment || null,
        total_paid: 0,
        remaining_balance: data.principal_amount,
        currency: data.currency || "BDT",
        status: "active",
        start_date: data.date,
        notes: data.notes || null,
      })
      .select()
      .single();

    if (error) throw error;
    return loan;
  } catch (error) {
    console.error("Error saving loan:", error);
    throw error;
  }
}

/**
 * Get all loans for a user
 */
export async function getLoans(userId) {
  try {
    const { data, error } = await supabase
      .from("loans")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching loans:", error);
    throw error;
  }
}

/**
 * Delete a loan
 */
export async function deleteLoan(loanId) {
  try {
    const { error } = await supabase
      .from("loans")
      .delete()
      .eq("id", loanId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error("Error deleting loan:", error);
    throw error;
  }
}

/**
 * Record a loan repayment: find matching loan, update balance, save transaction
 */
export async function recordLoanRepayment(userId, lenderName, amount, date, currency) {
  try {
    // Find active loan matching lender name (case-insensitive)
    const { data: loans, error: findError } = await supabase
      .from("loans")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .ilike("lender_name", `%${lenderName}%`);

    if (findError) throw findError;

    if (!loans || loans.length === 0) {
      // No matching loan found — still save as expense transaction
      await saveTransaction({
        userId,
        amount,
        currency: currency || "BDT",
        category: "loan_repayment",
        notes: `Loan repayment to ${lenderName} (no matching loan found)`,
        type: "expense",
        date,
      });
      return { loan: null, message: `No active loan found for "${lenderName}". Recorded as expense.` };
    }

    const loan = loans[0];
    const newTotalPaid = Number(loan.total_paid) + Number(amount);
    const newRemaining = Number(loan.remaining_balance) - Number(amount);
    const newStatus = newRemaining <= 0 ? "paid_off" : "active";

    // Update loan
    const { error: updateError } = await supabase
      .from("loans")
      .update({
        total_paid: newTotalPaid,
        remaining_balance: Math.max(0, newRemaining),
        status: newStatus,
      })
      .eq("id", loan.id);

    if (updateError) throw updateError;

    // Save as expense transaction
    await saveTransaction({
      userId,
      amount,
      currency: currency || "BDT",
      category: "loan_repayment",
      notes: `Loan repayment to ${loan.lender_name}`,
      type: "expense",
      date,
    });

    return {
      loan: { ...loan, total_paid: newTotalPaid, remaining_balance: Math.max(0, newRemaining), status: newStatus },
      message: newStatus === "paid_off"
        ? `Loan from ${loan.lender_name} fully paid off!`
        : `Repayment recorded. Remaining: ${Math.max(0, newRemaining).toFixed(2)} ${loan.currency}`,
    };
  } catch (error) {
    console.error("Error recording loan repayment:", error);
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

/**
 * Save user feedback to the database
 */
export async function saveFeedback(data) {
  try {
    const { error } = await supabase.from("feedback").insert({
      user_id: data.userId,
      user_name: data.userName || null,
      user_email: data.userEmail || null,
      rating: data.rating,
      comment: data.comment || null,
    });

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error("Error saving feedback:", error);
    throw error;
  }
}
