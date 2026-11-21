// Indian bank statements (ADR-022): day-first dates, ₹/Rs amounts, Dr/Cr, and the common header names.
import { describe, expect, it } from "vitest";
import {
  checkMapping,
  inferDateOrder,
  normalizeMerchant,
  normalizeRows,
  parseAmountCents,
  parseBankDate,
  suggestMapping,
} from "./index";

describe("Indian dates", () => {
  it("reads day-first dates when asked, and named months either way round", () => {
    expect(parseBankDate("04/11/2026", "dmy")).toBe("2026-11-04");
    expect(parseBankDate("04-11-26", "dmy")).toBe("2026-11-04");
    expect(parseBankDate("04/11/2026")).toBe("2026-04-11");
    expect(parseBankDate("13/01/2026", "mdy")).toBe("2026-01-13");
    expect(parseBankDate("01/13/2026", "dmy")).toBe("2026-01-13");
    expect(parseBankDate("04-Nov-2026")).toBe("2026-11-04");
    expect(parseBankDate("4 Nov 2026")).toBe("2026-11-04");
    expect(parseBankDate("04 Nov 26")).toBe("2026-11-04");
    expect(parseBankDate("04/Nov/2026")).toBe("2026-11-04");
  });

  it("infers the order from the whole file and falls back to the household's", () => {
    expect(inferDateOrder(["01/02/2026", "13/02/2026"], "mdy")).toBe("dmy");
    expect(inferDateOrder(["01/02/2026", "02/13/2026"], "dmy")).toBe("mdy");
    expect(inferDateOrder(["01/02/2026", "03/02/2026"], "dmy")).toBe("dmy");
    expect(inferDateOrder(["01/02/2026"], "mdy")).toBe("mdy");
  });
});

describe("Indian amounts", () => {
  it("reads rupee signs, Indian grouping and Dr/Cr suffixes", () => {
    expect(parseAmountCents("₹1,23,456.50")).toBe(12345650);
    expect(parseAmountCents("Rs. 2,150.00")).toBe(215000);
    expect(parseAmountCents("INR 999")).toBe(99900);
    expect(parseAmountCents("1,250.00 Dr")).toBe(-125000);
    expect(parseAmountCents("1,250.00 CR")).toBe(125000);
    expect(parseAmountCents("Rs")).toBeNull();
  });
});

describe("Indian payment rails in descriptions", () => {
  it("drops the NEFT, UPI, ACH, IMPS and NACH prefixes and their Dr/Cr marks", () => {
    expect(normalizeMerchant("NEFT CR-ACME TECHNOLOGIES SALARY")).toBe("acme technologies salary");
    expect(normalizeMerchant("ACH D- HDFC LIFE INSURANCE")).toBe("hdfc life insurance");
    expect(normalizeMerchant("UPI/RENT/RAJESH KUMAR")).toBe("rent rajesh kumar");
    expect(normalizeMerchant("IMPS-512345678901-AIRTEL")).toBe("airtel");
    expect(normalizeMerchant("NACH DR TATA AIG GENERAL")).toBe("tata aig general");
  });
});

describe("Indian bank headers", () => {
  it("suggests HDFC's columns", () => {
    const h = [
      "Date",
      "Narration",
      "Chq./Ref.No.",
      "Value Dt",
      "Withdrawal Amt.",
      "Deposit Amt.",
      "Closing Balance",
    ];
    expect(suggestMapping(h)).toEqual({
      date: "Date",
      description: "Narration",
      debit: "Withdrawal Amt.",
      credit: "Deposit Amt.",
      balance: "Closing Balance",
      amountSign: "outflow_negative",
    });
  });

  it("suggests ICICI's and Axis's columns", () => {
    expect(
      suggestMapping([
        "S No.",
        "Value Date",
        "Transaction Date",
        "Transaction Remarks",
        "Withdrawal Amount (INR )",
        "Deposit Amount (INR )",
        "Balance (INR )",
      ]),
    ).toMatchObject({
      date: "Transaction Date",
      description: "Transaction Remarks",
      debit: "Withdrawal Amount (INR )",
      credit: "Deposit Amount (INR )",
      balance: "Balance (INR )",
    });
    expect(suggestMapping(["Tran Date", "CHQNO", "PARTICULARS", "DR", "CR", "BAL"])).toMatchObject({
      date: "Tran Date",
      description: "PARTICULARS",
      debit: "DR",
      credit: "CR",
      balance: "BAL",
    });
  });

  it("suggests Kotak's amount plus Dr/Cr column", () => {
    expect(
      suggestMapping([
        "Sl. No.",
        "Transaction Date",
        "Description",
        "Amount",
        "Dr / Cr",
        "Balance",
        "Dr / Cr",
      ]),
    ).toMatchObject({ date: "Transaction Date", amount: "Amount", direction: "Dr / Cr", balance: "Balance" });
  });

  it("falls back to the value date", () => {
    expect(suggestMapping(["Txn Date", "Description", "Debit", "Credit"]).date).toBe("Txn Date");
    expect(suggestMapping(["Value Date", "Description", "Debit", "Credit"]).date).toBe("Value Date");
  });
});

describe("a Dr/Cr column", () => {
  const headers = ["Transaction Date", "Description", "Amount", "Dr / Cr"];
  const mapping = {
    date: "Transaction Date",
    description: "Description",
    amount: "Amount",
    direction: "Dr / Cr",
    amountSign: "outflow_negative" as const,
  };

  it("needs a single amount column", () => {
    expect(checkMapping(mapping, headers)).toBeNull();
    const { amount: _amount, ...noAmount } = mapping;
    expect(checkMapping({ ...noAmount, debit: "Amount" }, headers)).toBe(
      "A Dr/Cr column goes with one amount column.",
    );
  });

  it("signs each row by it, and reads the file's dates day first for an Indian household", () => {
    const rows = [
      { "Transaction Date": "04/11/2026", Description: "SALARY ACME", Amount: "85,000.00", "Dr / Cr": "CR" },
      { "Transaction Date": "05/11/2026", Description: "AIRTEL POSTPAID", Amount: "799.00", "Dr / Cr": "DR" },
      { "Transaction Date": "05/11/2026", Description: "?", Amount: "1.00", "Dr / Cr": "maybe" },
    ];
    const out = normalizeRows(rows, mapping, { dateOrder: "dmy" });
    expect(out.transactions.map((t) => [t.postedOn, t.amountCents])).toEqual([
      ["2026-11-04", 8500000],
      ["2026-11-05", -79900],
    ]);
    expect(out.rejectedBy.amount).toBe(1);
  });
});
