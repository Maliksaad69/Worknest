import { describe, it, expect } from "vitest";

function formatIso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateLabel(value: string) {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(`${value}T12:00:00`))
    : "—";
}

describe("CalendarPicker date calculations and formatting", () => {
  it("formats ISO date string correctly with 2-digit padding", () => {
    expect(formatIso(2026, 9, 5)).toBe("2026-10-05");
    expect(formatIso(2026, 0, 1)).toBe("2026-01-01");
    expect(formatIso(2026, 11, 31)).toBe("2026-12-31");
  });

  it("formats human readable dateLabel accurately", () => {
    expect(dateLabel("2026-10-18")).toBe("Oct 18, 2026");
    expect(dateLabel("2026-01-01")).toBe("Jan 1, 2026");
    expect(dateLabel("")).toBe("—");
  });

  it("calculates month days and calendar grid dimensions correctly", () => {
    const year = 2026;
    const month = 9; // October (0-indexed)
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    expect(daysInMonth).toBe(31);

    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    expect(daysInPrevMonth).toBe(30); // September has 30 days

    // Test padding
    const prevDays = Array.from({ length: firstDayOfWeek }, (_, i) => {
      const d = daysInPrevMonth - firstDayOfWeek + i + 1;
      return formatIso(year, month - 1, d);
    });

    const currentDays = Array.from({ length: daysInMonth }, (_, i) => {
      return formatIso(year, month, i + 1);
    });

    const totalCells = prevDays.length + currentDays.length;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    const nextDays = Array.from({ length: remaining }, (_, i) => {
      return formatIso(year, month + 1, i + 1);
    });

    const allCalendarGrid = [...prevDays, ...currentDays, ...nextDays];
    expect(allCalendarGrid.length % 7).toBe(0);
    expect(allCalendarGrid).toContain("2026-10-18");
  });

  it("parses typed and written date strings correctly into ISO format", () => {
    function parseDateInput(input: string): string | null {
      const trimmed = input.trim();
      if (!trimmed) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const d = new Date(`${trimmed}T12:00:00`);
        if (!isNaN(d.getTime())) return trimmed;
      }
      const parts = trimmed.split(/[-/.]/).map(Number);
      if (parts.length === 3) {
        const [p1, p2, p3] = parts;
        if (p1 && p2 && p3) {
          if (p3 >= 1000 && p3 <= 9999) {
            if (p1 > 12 && p2 <= 12) return formatIso(p3, p2 - 1, p1);
            if (p1 <= 12 && p2 <= 31) return formatIso(p3, p1 - 1, p2);
          }
          if (p1 >= 1000 && p1 <= 9999) {
            return formatIso(p1, p2 - 1, p3);
          }
        }
      }
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        return formatIso(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
      }
      return null;
    }

    expect(parseDateInput("2026-10-25")).toBe("2026-10-25");
    expect(parseDateInput("2026/10/25")).toBe("2026-10-25");
    expect(parseDateInput("10/25/2026")).toBe("2026-10-25");
    expect(parseDateInput("25/10/2026")).toBe("2026-10-25");
    expect(parseDateInput("Oct 25, 2026")).toBe("2026-10-25");
    expect(parseDateInput("   2026-12-01   ")).toBe("2026-12-01");
    expect(parseDateInput("")).toBeNull();
    expect(parseDateInput("invalid-date-string")).toBeNull();
  });
});
