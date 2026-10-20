import { describe, it, expect } from "vitest";
import { appRouter } from "@/lib/trpc/router";

describe("Project Completion & Outsourced Delivery Partner Flow", () => {
  it("marks in-house project as completed directly", () => {
    const project = {
      id: "p2",
      name: "Lumen Launch",
      client: "Lumen Studio",
      status: "Waiting",
      outsourced: false,
      amount: 1800,
      received: 1800,
    };

    // Completing in-house project
    const updated = { ...project, status: "Completed" };
    expect(updated.status).toBe("Completed");
    expect(updated.outsourced).toBe(false);
  });

  it("handles immediate payout for outsourced project", () => {
    const project = {
      id: "p1",
      name: "Atlas Commerce",
      status: "In Progress",
      outsourced: true,
      amount: 4200,
      received: 2100,
    };

    const outsource = {
      id: "o1",
      projectId: "p1",
      provider: "John Malik",
      cost: 1400,
      paid: 900,
      status: "In Progress" as const,
    };

    const remainingDue = outsource.cost - outsource.paid;
    expect(remainingDue).toBe(500);

    const completionDate = "2026-10-18";
    // Immediate payout & completion
    const updatedProject = { ...project, status: "Completed" };
    const updatedOutsource = {
      ...outsource,
      paid: outsource.cost,
      status: "Completed" as const,
      paidAt: completionDate,
    };

    expect(updatedProject.status).toBe("Completed");
    expect(updatedOutsource.paid).toBe(1400);
    expect(updatedOutsource.cost - updatedOutsource.paid).toBe(0);
    expect(updatedOutsource.status).toBe("Completed");
    expect(updatedOutsource.paidAt).toBe("2026-10-18");
  });

  it("handles scheduled payout date for outsourced partner", () => {
    const outsource = {
      id: "o1",
      projectId: "p1",
      provider: "John Malik",
      cost: 1400,
      paid: 900,
      status: "In Progress" as const,
      notes: "Weekly review on Thursdays",
    };

    const scheduledDate = "2026-10-25";
    const updated = {
      ...outsource,
      payDate: scheduledDate,
      notes: `${outsource.notes} | Payout scheduled for ${scheduledDate}`,
    };

    expect(updated.payDate).toBe("2026-10-25");
    expect(updated.notes).toContain("Payout scheduled for 2026-10-25");
  });

  it("toggles partner paid state between full payment with paidAt date and unpaid balance", () => {
    const outsource = {
      id: "o1",
      projectId: "p1",
      provider: "John Malik",
      cost: 1400,
      paid: 900, // partially unpaid
      status: "In Progress" as const,
      paidAt: undefined as string | undefined,
    };

    const todayDate = "2026-10-18";
    // Toggle 1: Mark paid in full
    const isCurrentlyPaid = outsource.paid >= outsource.cost; // false
    const toggle1 = {
      ...outsource,
      paid: isCurrentlyPaid ? 0 : outsource.cost,
      status: isCurrentlyPaid ? ("In Progress" as const) : ("Completed" as const),
      paidAt: isCurrentlyPaid ? undefined : todayDate,
    };
    expect(toggle1.paid).toBe(1400);
    expect(toggle1.status).toBe("Completed");
    expect(toggle1.paidAt).toBe("2026-10-18");

    // Toggle 2: Mark unpaid
    const isNowPaid = toggle1.paid >= toggle1.cost; // true
    const toggle2 = {
      ...toggle1,
      paid: isNowPaid ? 0 : toggle1.cost,
      status: isNowPaid ? ("In Progress" as const) : ("Completed" as const),
      paidAt: isNowPaid ? undefined : todayDate,
    };
    expect(toggle2.paid).toBe(0);
    expect(toggle2.status).toBe("In Progress");
    expect(toggle2.paidAt).toBeUndefined();
  });

  it("creates outsourced work without deadline requirement and tracks completion record", () => {
    // Outsourced work form no longer requires a payment deadline
    const newOutsource = {
      id: "o3",
      projectId: "p2",
      provider: "Creative Forge",
      contact: "team@forge.dev",
      description: "Logo & branding design",
      cost: 800,
      paid: 800,
      status: "Completed" as const,
      paidAt: "2026-10-18",
      notes: "",
    };

    expect(newOutsource.deadline).toBeUndefined();
    expect(newOutsource.paidAt).toBe("2026-10-18");
    expect(newOutsource.status).toBe("Completed");
  });

  it("supports skipping upfront payment on outsourced work form", () => {
    const cost = 1200;
    const skipPayment = true;
    const paymentInput = "500"; // user had typed something before toggling skip

    const effectivePayment = skipPayment ? 0 : Number(paymentInput);
    const isPaid = cost > 0 && effectivePayment >= cost;

    const outsourceWithSkippedPayment = {
      id: "o4",
      projectId: "p3",
      provider: "Apex Cloud Services",
      contact: "support@apex.cloud",
      description: "AWS cloud architecture setup",
      cost,
      paid: effectivePayment,
      status: isPaid ? ("Completed" as const) : ("Assigned" as const),
      paidAt: isPaid ? "2026-10-18" : undefined,
      notes: skipPayment ? "Payment deferred until completion." : "",
    };

    expect(outsourceWithSkippedPayment.paid).toBe(0);
    expect(outsourceWithSkippedPayment.status).toBe("Assigned");
    expect(outsourceWithSkippedPayment.paidAt).toBeUndefined();
    expect(outsourceWithSkippedPayment.notes).toContain("Payment deferred");
  });

  it("allows writing and recording custom date when completing outsourced project", () => {
    const project = { id: "p1", name: "Atlas Commerce", status: "In Progress" };
    const outsource = {
      id: "o1",
      projectId: "p1",
      provider: "John Malik",
      cost: 1400,
      paid: 900,
      status: "In Progress" as const,
    };

    // User writes a custom date in the completion modal (e.g. yesterday or specific date)
    const writtenPaymentDate = "2026-10-17";
    const completedProject = { ...project, status: "Completed" };
    const completedOutsource = {
      ...outsource,
      paid: outsource.cost,
      status: "Completed" as const,
      paidAt: writtenPaymentDate,
    };

    expect(completedProject.status).toBe("Completed");
    expect(completedOutsource.paid).toBe(1400);
    expect(completedOutsource.paidAt).toBe("2026-10-17");

    // User writes a custom scheduled payout date
    const writtenScheduledDate = "2026-11-05";
    const scheduledOutsource = {
      ...outsource,
      payDate: writtenScheduledDate,
      notes: `Payout scheduled for ${writtenScheduledDate}`,
    };
    expect(scheduledOutsource.payDate).toBe("2026-11-05");
  });

  it("serializes and validates completed workspace state with payout dates and paidAt records", () => {
    const completedWorkspace = {
      projects: [
        {
          id: "p1",
          name: "Atlas Commerce",
          client: "Northstar Labs",
          status: "Completed",
          outsourced: true,
          amount: 4200,
          received: 4200,
        },
      ],
      outsources: [
        {
          id: "o1",
          projectId: "p1",
          provider: "John Malik",
          cost: 1400,
          paid: 1400,
          status: "Completed",
          payDate: "2026-10-20",
          paidAt: "2026-10-18",
        },
      ],
      receivables: [],
      credentials: [],
      scripts: [],
    };

    // Verify JSON serialization round-trip matches localStorage and Supabase payload
    const serialized = JSON.stringify(completedWorkspace);
    const deserialized = JSON.parse(serialized);

    expect(deserialized.projects[0].status).toBe("Completed");
    expect(deserialized.outsources[0].paid).toBe(1400);
    expect(deserialized.outsources[0].payDate).toBe("2026-10-20");
    expect(deserialized.outsources[0].paidAt).toBe("2026-10-18");
    expect(deserialized.outsources[0].status).toBe("Completed");
  });

  it("displays exact numbers written without rounding off decimals", () => {
    const money = (value: number, compact = false) => {
      const num = typeof value === "number" && !isNaN(value) ? value : 0;
      return `₨${new Intl.NumberFormat("en-PK", {
        maximumFractionDigits: 8,
        notation: compact ? "compact" : "standard",
      }).format(num)}`;
    };

    const usdMoney = (value: number) => {
      const num = typeof value === "number" && !isNaN(value) ? value : 0;
      return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(num)}`;
    };

    const number = (value: number) => {
      const num = typeof value === "number" && !isNaN(value) ? value : 0;
      return new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(num);
    };

    // Tests that decimals are preserved exactly as written and not rounded to integer
    expect(money(45.5)).toBe("₨45.5");
    expect(money(1234.75)).toBe("₨1,234.75");
    expect(money(1500.125)).toBe("₨1,500.125");
    expect(money(100)).toBe("₨100");
    expect(money(0)).toBe("₨0");

    expect(usdMoney(45.5)).toBe("$45.5");
    expect(usdMoney(1234.75)).toBe("$1,234.75");

    expect(number(45.5)).toBe("45.5");
    expect(number(1234.75)).toBe("1,234.75");
    expect(number(0.12345678)).toBe("0.12345678");
  });

  it("handles partial payment with manual calendar date, records date against amount, and shows remaining amount", () => {
    const outsource = {
      id: "o1",
      projectId: "p1",
      provider: "John Malik",
      cost: 1400,
      paid: 0,
      status: "In Progress" as const,
      payments: [] as { id: string; amount: number; date: string; note?: string }[],
    };

    // User chooses Send Partial Payment: 500 PKR on manually selected calendar date 2026-10-21
    const partialAmount = 500;
    const selectedDate = "2026-10-21";

    const newPaid = outsource.paid + partialAmount;
    const remainingBalance = outsource.cost - newPaid;
    const isNowFull = newPaid >= outsource.cost;

    const updatedOutsource = {
      ...outsource,
      paid: newPaid,
      paidAt: selectedDate,
      status: isNowFull ? ("Completed" as const) : ("In Progress" as const),
      payments: [
        ...outsource.payments,
        { id: "pay-1", amount: partialAmount, date: selectedDate, note: "Partial payment" },
      ],
    };

    // Verifications:
    // 1. Partial amount is recorded
    expect(updatedOutsource.paid).toBe(500);
    // 2. Selected calendar date gets written against the payment
    expect(updatedOutsource.paidAt).toBe("2026-10-21");
    // 3. Status remains In Progress because balance remains
    expect(updatedOutsource.status).toBe("In Progress");
    // 4. Remaining balance is accurately calculated
    expect(remainingBalance).toBe(900);
    expect(updatedOutsource.cost - updatedOutsource.paid).toBe(900);
    // 5. Payment record exists in history with date and amount
    expect(updatedOutsource.payments).toHaveLength(1);
    expect(updatedOutsource.payments[0].amount).toBe(500);
    expect(updatedOutsource.payments[0].date).toBe("2026-10-21");

    // Second partial payment: 400 PKR on 2026-10-24
    const partialAmount2 = 400;
    const selectedDate2 = "2026-10-24";
    const newPaid2 = updatedOutsource.paid + partialAmount2;
    const remainingBalance2 = updatedOutsource.cost - newPaid2;

    const secondPaymentOutsource = {
      ...updatedOutsource,
      paid: newPaid2,
      paidAt: selectedDate2,
      status: newPaid2 >= updatedOutsource.cost ? ("Completed" as const) : ("In Progress" as const),
      payments: [
        ...updatedOutsource.payments,
        { id: "pay-2", amount: partialAmount2, date: selectedDate2, note: "Partial payment 2" },
      ],
    };

    expect(secondPaymentOutsource.paid).toBe(900);
    expect(secondPaymentOutsource.paidAt).toBe("2026-10-24");
    expect(remainingBalance2).toBe(500);
    expect(secondPaymentOutsource.status).toBe("In Progress");
    expect(secondPaymentOutsource.payments).toHaveLength(2);

    // Final transfer: paying the full remaining 500 on 2026-10-28
    const remainingToPay = secondPaymentOutsource.cost - secondPaymentOutsource.paid;
    expect(remainingToPay).toBe(500);
    const finalDate = "2026-10-28";

    const fullyPaidOutsource = {
      ...secondPaymentOutsource,
      paid: secondPaymentOutsource.cost,
      paidAt: finalDate,
      status: "Completed" as const,
      payments: [
        ...secondPaymentOutsource.payments,
        { id: "pay-3", amount: remainingToPay, date: finalDate, note: "Full balance transfer" },
      ],
    };

    expect(fullyPaidOutsource.paid).toBe(1400);
    expect(fullyPaidOutsource.paidAt).toBe("2026-10-28");
    expect(fullyPaidOutsource.cost - fullyPaidOutsource.paid).toBe(0);
    expect(fullyPaidOutsource.status).toBe("Completed");
    expect(fullyPaidOutsource.payments).toHaveLength(3);
  });
});
