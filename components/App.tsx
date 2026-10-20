"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Route, Switch, useLocation } from "wouter";
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, Bell, BriefcaseBusiness, Calculator, Calendar, Check,
  CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Code2, Copy, CreditCard, Eye, EyeOff, ExternalLink,
  FileCode2, Filter, KeyRound, Link2, Menu, MoreHorizontal, Pencil, Plus, Receipt, RotateCcw, Search,
  Settings2, ShieldCheck, Sparkles, Trash2, TrendingUp, WalletCards, X, Zap, Clock3,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { trpc } from "./lib/trpc";
import { evaluateExpression } from "@/lib/math";
import "./index.css";

type ProjectStatus = "New" | "In Progress" | "Waiting" | "Completed" | "Cancelled";
type Priority = "Low" | "Medium" | "High" | "Urgent";
type OutsourceStatus = "Not Started" | "Assigned" | "In Progress" | "Submitted" | "Revision Required" | "Completed" | "Cancelled";
type ReceivableStatus = "Unpaid" | "Partially Paid" | "Paid" | "Overdue";
type ToolTab = "credentials" | "scripts" | "calculator" | "amounts";
type Task = { id: string; label: string; done: boolean };
type Project = { id: string; name: string; client: string; contact: string; description: string; start: string; deadline: string; status: ProjectStatus; priority: Priority; amount: number; received: number; outsourced: boolean; outsourcedTo?: string; notes: string; tasks: Task[] };
type OutsourcePayment = { id: string; amount: number; date: string; note?: string };
type Outsource = { id: string; projectId: string; provider: string; contact: string; description: string; cost: number; paid: number; deadline?: string; status: OutsourceStatus; notes: string; payDate?: string; paidAt?: string; payments?: OutsourcePayment[] };
type Receivable = { id: string; projectId: string; received: number; dueDate: string; status: ReceivableStatus; notes: string };
type Credential = { id: string; service: string; projectId: string; username: string; password: string; url: string; notes: string };
type Script = { id: string; name: string; category: string; description: string; code: string; tags: string[]; projectId: string; notes: string };
type Store = { projects: Project[]; outsources: Outsource[]; receivables: Receivable[]; credentials: Credential[]; scripts: Script[] };
type DrawerKind = "project" | "outsource" | "receivable" | "credential" | "script" | "payment";

const uid = () => Math.random().toString(36).slice(2, 10);
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
const dateLabel = (value: string) => value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`)) : "—";
const today = () => new Date().toISOString().slice(0, 10);
const daysFromToday = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };
const formatIso = (year: number, month: number, day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const parseDateInput = (input: string): string | null => {
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
};

const seed: Store = {
  projects: [],
  outsources: [],
  receivables: [],
  credentials: [],
  scripts: [],
};

const SEED_PROJECT_IDS = new Set(["p1", "p2", "p3", "p4"]);
const SEED_PROJECT_NAMES = new Set([
  "atlas commerce",
  "lumen launch",
  "harbor ops",
  "orchard retainer",
]);
const SEED_OUTSOURCE_IDS = new Set(["o1", "o2"]);
const SEED_RECEIVABLE_IDS = new Set(["r1", "r2", "r3"]);
const SEED_CREDENTIAL_IDS = new Set(["c1", "c2", "c3"]);
const SEED_SCRIPT_IDS = new Set(["s1", "s2"]);

function isSeedProject(p: Partial<Project>): boolean {
  if (p.id && SEED_PROJECT_IDS.has(p.id)) return true;
  if (p.name && SEED_PROJECT_NAMES.has(p.name.trim().toLowerCase())) return true;
  return false;
}

function normalizeProject(p: Partial<Project>): Project {
  return {
    id: p.id || uid(),
    name: p.name || "Untitled Project",
    client: p.client || "Direct client",
    contact: p.contact || "",
    description: p.description || "",
    start: p.start || today(),
    deadline: p.deadline || today(),
    status: (p.status as ProjectStatus) || "New",
    priority: (p.priority as Priority) || "Medium",
    amount: Number(p.amount) || 0,
    received: Number(p.received) || 0,
    outsourced: Boolean(p.outsourced),
    outsourcedTo: p.outsourcedTo,
    notes: p.notes || "",
    tasks: Array.isArray(p.tasks) ? p.tasks : [],
  };
}

function normalizeStore(s: unknown): Store {
  if (!s || typeof s !== "object") return seed;
  const raw = s as Partial<Store>;

  const projects = Array.isArray(raw.projects)
    ? raw.projects.filter(p => !isSeedProject(p)).map(normalizeProject)
    : [];

  const validProjectIds = new Set(projects.map(p => p.id));

  const outsources = Array.isArray(raw.outsources)
    ? raw.outsources.filter(
        item => !SEED_OUTSOURCE_IDS.has(item.id) && !SEED_PROJECT_IDS.has(item.projectId)
      )
    : [];

  const receivables = Array.isArray(raw.receivables)
    ? raw.receivables.filter(
        item => !SEED_RECEIVABLE_IDS.has(item.id) && !SEED_PROJECT_IDS.has(item.projectId)
      )
    : [];

  const credentials = Array.isArray(raw.credentials)
    ? raw.credentials.filter(
        item =>
          !SEED_CREDENTIAL_IDS.has(item.id) &&
          (!item.projectId || (!SEED_PROJECT_IDS.has(item.projectId) && validProjectIds.has(item.projectId)))
      )
    : [];

  const scripts = Array.isArray(raw.scripts)
    ? raw.scripts.filter(
        item => !SEED_SCRIPT_IDS.has(item.id) && !SEED_PROJECT_IDS.has(item.projectId)
      )
    : [];

  return {
    projects,
    outsources,
    receivables,
    credentials,
    scripts,
  };
}

function useStore() {
  const workspaceQuery = trpc.workspace.load.useQuery();
  const workspaceSave = trpc.workspace.save.useMutation();
  const [store, setStore] = useState<Store>(() => {
    try {
      const saved = localStorage.getItem("worknest-store");
      return saved ? normalizeStore(JSON.parse(saved)) : seed;
    } catch {
      return seed;
    }
  });
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (hydrated || (!workspaceQuery.isSuccess && !workspaceQuery.isError)) return;
    if (workspaceQuery.isSuccess && workspaceQuery.data) {
      setStore(normalizeStore(workspaceQuery.data));
    }
    setHydrated(true);
  }, [hydrated, workspaceQuery.data, workspaceQuery.isError, workspaceQuery.isSuccess]);
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("worknest-store", JSON.stringify(store));
    workspaceSave.mutate({ data: store });
  }, [hydrated, store]);
  return [store, setStore] as const;
}
function StatusPill({ children, tone }: { children: ReactNode; tone?: string }) { return <span className={`status-pill ${tone || String(children).toLowerCase().replace(/\s+/g, "-")}`}>{children}</span>; }
function Avatar({ name }: { name?: string }) { const safe = (name || "W").trim(); const parts = safe.split(/\s+/).filter(Boolean); const initials = parts.map(part => part[0]).slice(0, 2).join("").toUpperCase() || safe.slice(0, 2).toUpperCase() || "W"; return <span className="avatar">{initials}</span>; }
function EmptyState({ icon: Icon, title, description, action }: { icon: typeof BriefcaseBusiness; title: string; description: string; action?: ReactNode }) { return <div className="empty-state"><div className="empty-icon"><Icon size={22} /></div><h3>{title}</h3><p>{description}</p>{action}</div>; }

function AppShell({
  children,
  active,
  navigate,
  onQuickAdd,
  projectCount = 0,
}: {
  children: ReactNode;
  active: string;
  navigate: (path: string) => void;
  onQuickAdd: () => void;
  projectCount?: number;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = [
    { label: "Projects", path: "/", icon: BriefcaseBusiness },
    { label: "Outsourced", path: "/outsourced", icon: Link2 },
    { label: "Receivables", path: "/receivables", icon: CircleDollarSign },
    { label: "Tools", path: "/tools", icon: Settings2 },
  ];
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark">
            <span />
            <span />
          </div>
          <div className="brand-word">worknest</div>
          <button className="icon-button mobile-close" onClick={() => setMobileOpen(false)}>
            <X size={17} />
          </button>
        </div>
        <div className="workspace-switch">
          <div className="workspace-avatar">W</div>
          <div>
            <strong>My workspace</strong>
            <span>Personal operations</span>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">Workspace</div>
        <nav className="primary-nav">
          {nav.map(item => {
            const Icon = item.icon;
            const isActive = active === item.label.toLowerCase();
            return (
              <button
                key={item.label}
                className={`nav-item ${isActive ? "active" : ""}`}
                onClick={() => {
                  navigate(item.path);
                  setMobileOpen(false);
                }}
              >
                <Icon size={17} />
                <span>{item.label}</span>
                {item.label === "Projects" && (
                  <span className="nav-count">{projectCount}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-note">
          <div className="note-icon">
            <Zap size={14} />
          </div>
          <div>
            <strong>Keep the work moving.</strong>
            <p>One home for every handoff, invoice, and next step.</p>
          </div>
        </div>
        <div className="sidebar-footer">
          <div className="user-row">
            <Avatar name="Alex Morgan" />
            <div>
              <strong>Alex Morgan</strong>
              <span>Owner</span>
            </div>
            <MoreHorizontal size={16} />
          </div>
          <div className="version">Worknest v1.0 <span>•</span> synced just now</div>
        </div>
      </aside>
      {mobileOpen && (
        <button
          className="mobile-scrim"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        />
      )}
      <main className="main-shell">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span className="crumb-slash">/</span>
            <strong>{active === "projects" ? "Projects" : active[0].toUpperCase() + active.slice(1)}</strong>
          </div>
          <div className="topbar-actions">
            <button className="topbar-icon">
              <Bell size={17} />
              <span className="notification-dot" />
            </button>
            <button className="avatar-button">
              <Avatar name="Alex Morgan" />
              <ChevronDown size={14} />
            </button>
          </div>
        </header>
        <div className="content-wrap">{children}</div>
      </main>
      <button className="quick-add-fab" onClick={onQuickAdd}>
        <Plus size={18} /> Quick add
      </button>
    </div>
  );
}
function PageHeader({ eyebrow, title, description, action, secondary }: { eyebrow?: string; title: string; description: string; action?: ReactNode; secondary?: ReactNode }) { return <div className="page-header"><div><div className="eyebrow">{eyebrow || "Workspace"}</div><h1>{title}</h1><p>{description}</p></div><div className="page-actions">{secondary}{action}</div></div>; }
function SummaryCard({ label, value, note, icon: Icon, accent }: { label: string; value: string; note: string; icon: typeof BriefcaseBusiness; accent?: string }) { return <div className={`summary-card ${accent || ""}`}><div className="summary-top"><span>{label}</span><div className="summary-icon"><Icon size={16} /></div></div><strong>{value}</strong><p>{note}</p></div>; }

function CalendarPicker({
  value,
  onChange,
  label,
  required,
}: {
  value: string;
  onChange: (dateStr: string) => void;
  label?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedDate = useMemo(() => {
    if (!value) return new Date();
    const parts = value.split("-").map(Number);
    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    return new Date();
  }, [value]);

  const [viewYear, setViewYear] = useState(() => selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => selectedDate.getMonth());

  useEffect(() => {
    if (value) {
      const parts = value.split("-").map(Number);
      if (parts.length === 3 && parts[0] && parts[1]) {
        setViewYear(parts[0]);
        setViewMonth(parts[1] - 1);
      }
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const prevMonthDays = Array.from({ length: firstDayOfWeek }, (_, i) => {
    const d = daysInPrevMonth - firstDayOfWeek + i + 1;
    const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
    const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
    return {
      day: d,
      isCurrentMonth: false,
      iso: formatIso(prevY, prevM, d),
    };
  });

  const currentMonthDays = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    isCurrentMonth: true,
    iso: formatIso(viewYear, viewMonth, i + 1),
  }));

  const totalCells = prevMonthDays.length + currentMonthDays.length;
  const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  const nextMonthDays = Array.from({ length: remainingCells }, (_, i) => {
    const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
    const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
    return {
      day: i + 1,
      isCurrentMonth: false,
      iso: formatIso(nextY, nextM, i + 1),
    };
  });

  const allCalendarDays = [...prevMonthDays, ...currentMonthDays, ...nextMonthDays];

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  const [typedText, setTypedText] = useState(value || "");

  useEffect(() => {
    setTypedText(value || "");
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setTypedText(text);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const d = new Date(`${text}T12:00:00`);
      if (!isNaN(d.getTime())) {
        onChange(text);
        const [y, m] = text.split("-").map(Number);
        if (y && m) {
          setViewYear(y);
          setViewMonth(m - 1);
        }
      }
    }
  };

  const handleTextBlur = () => {
    if (!typedText.trim()) return;
    const parsed = parseDateInput(typedText);
    if (parsed) {
      setTypedText(parsed);
      onChange(parsed);
      const [y, m] = parsed.split("-").map(Number);
      if (y && m) {
        setViewYear(y);
        setViewMonth(m - 1);
      }
    } else {
      setTypedText(value || "");
    }
  };

  const handleTextKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleTextBlur();
      setOpen(false);
    }
  };

  const handleSelectDate = (iso: string) => {
    setTypedText(iso);
    onChange(iso);
    setOpen(false);
  };

  const todayIso = today();

  return (
    <div className="field calendar-field-wrap" ref={containerRef} style={label ? undefined : { marginBottom: 0 }}>
      {label && (
        <span>
          {label}
          {required && <span className="required"> *</span>}
        </span>
      )}

      <div
        className={`calendar-trigger-btn ${open ? "active" : ""}`}
        style={label ? undefined : { marginTop: 0 }}
      >
        <button
          type="button"
          className="calendar-icon-btn"
          onClick={() => setOpen(!open)}
          title="Toggle calendar popup"
          aria-label="Toggle calendar popup"
        >
          <Calendar size={15} />
        </button>
        <input
          type="text"
          className="calendar-text-input"
          value={typedText}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          onKeyDown={handleTextKeyDown}
          placeholder="YYYY-MM-DD (e.g. 2026-10-25)"
          aria-label={label || "Date input"}
        />
        {value && (
          <span
            className="calendar-trigger-badge"
            onClick={() => setOpen(!open)}
            title="Click to toggle calendar"
            style={{ cursor: "pointer" }}
          >
            {value === todayIso ? "Today" : dateLabel(value)}
          </span>
        )}
      </div>

      {open && (
        <div className="calendar-popover" role="dialog" aria-label="Calendar date picker">
          <div className="calendar-popover-header">
            <button
              type="button"
              className="calendar-nav-btn"
              onClick={handlePrevMonth}
              title="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <strong className="calendar-header-title">
              {monthNames[viewMonth]} {viewYear}
            </strong>
            <button
              type="button"
              className="calendar-nav-btn"
              onClick={handleNextMonth}
              title="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="calendar-presets-bar">
            <button
              type="button"
              className={`calendar-preset-chip ${value === todayIso ? "active" : ""}`}
              onClick={() => handleSelectDate(todayIso)}
            >
              Today
            </button>
            <button
              type="button"
              className={`calendar-preset-chip ${value === daysFromToday(1) ? "active" : ""}`}
              onClick={() => handleSelectDate(daysFromToday(1))}
            >
              Tomorrow
            </button>
            <button
              type="button"
              className={`calendar-preset-chip ${value === daysFromToday(7) ? "active" : ""}`}
              onClick={() => handleSelectDate(daysFromToday(7))}
            >
              +1 Week
            </button>
            <button
              type="button"
              className={`calendar-preset-chip ${value === daysFromToday(14) ? "active" : ""}`}
              onClick={() => handleSelectDate(daysFromToday(14))}
            >
              +2 Weeks
            </button>
          </div>

          <div className="calendar-weekdays-grid">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(w => (
              <span key={w} className="calendar-weekday-label">{w}</span>
            ))}
          </div>

          <div className="calendar-days-grid">
            {allCalendarDays.map((item, idx) => {
              const isSelected = item.iso === value;
              const isToday = item.iso === todayIso;
              return (
                <button
                  key={`${item.iso}-${idx}`}
                  type="button"
                  className={`calendar-day-btn ${!item.isCurrentMonth ? "outside-month" : ""} ${isSelected ? "selected" : ""} ${isToday ? "today" : ""}`}
                  onClick={() => handleSelectDate(item.iso)}
                >
                  <span>{item.day}</span>
                  {isToday && !isSelected && <span className="today-dot" />}
                </button>
              );
            })}
          </div>

          <div className="calendar-popover-footer">
            <span className="calendar-footer-label">
              Selected: <strong>{dateLabel(value)}</strong>
            </span>
            <button
              type="button"
              className="calendar-footer-action"
              onClick={() => handleSelectDate(todayIso)}
            >
              Jump to today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CompleteProjectModal({
  project,
  outsource,
  onClose,
  onPayImmediately,
  onPayPartial,
  onSchedulePay,
  onTogglePaid,
  onCompleteOnly,
  initialMode = "full",
}: {
  project: Project;
  outsource?: Outsource;
  onClose: () => void;
  onPayImmediately: (project: Project, outsource: Outsource, paidDate?: string, completeProject?: boolean) => void;
  onPayPartial?: (project: Project, outsource: Outsource, partialAmount: number, paidDate?: string, completeProject?: boolean) => void;
  onSchedulePay: (project: Project, outsource: Outsource, payDate: string, completeProject?: boolean) => void;
  onTogglePaid: (outsourceId: string) => void;
  onCompleteOnly: (project: Project) => void;
  initialMode?: "full" | "partial" | "schedule";
}) {
  const [mode, setMode] = useState<"full" | "partial" | "schedule">(initialMode || "full");
  const [fullDate, setFullDate] = useState(today());
  const [partialDate, setPartialDate] = useState(today());
  const [partialAmountText, setPartialAmountText] = useState("");
  const [scheduledDate, setScheduledDate] = useState(daysFromToday(7));
  const [alsoCompleteProject, setAlsoCompleteProject] = useState(project.status !== "Completed");

  const isPaid = outsource ? outsource.paid >= outsource.cost : false;
  const remaining = outsource ? Math.max(0, outsource.cost - outsource.paid) : 0;

  const parsedPartialAmount = useMemo(() => {
    const val = evaluateExpression(partialAmountText);
    return Math.max(0, val || 0);
  }, [partialAmountText]);

  const remainingAfterPartial = Math.max(0, remaining - parsedPartialAmount);

  return (
    <div className="completion-modal-backdrop" onClick={onClose}>
      <div className="completion-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="completion-modal-header">
          <div>
            <div className="eyebrow">{outsource ? "Outsourced Partner Payment" : "Project Completion"}</div>
            <h3>{outsource ? `Payout for “${outsource.provider}”` : `Complete “${project.name}”`}</h3>
            <p className="table-subtle" style={{ margin: "3px 0 0" }}>Project: {project.name} · Client: {project.client} · Project Value: {money(project.amount)}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close modal"><X size={18} /></button>
        </div>

        <div className="completion-modal-body">
          {outsource ? (
            <>
              {/* Partner summary card */}
              <div className="partner-summary-card">
                <div className="partner-summary-header">
                  <div className="assignment-cell">
                    <Avatar name={outsource.provider} />
                    <div>
                      <strong>{outsource.provider}</strong>
                      <span className="table-subtle">{outsource.contact || "Outsourced delivery partner"}</span>
                    </div>
                  </div>
                  <span className={`status-pill ${isPaid ? "completed" : outsource.paid > 0 ? "revision-required" : "in-progress"}`}>
                    {isPaid ? "Paid in full" : outsource.paid > 0 ? "Partially paid" : "Payment pending"}
                  </span>
                </div>
                <div className="partner-summary-stats">
                  <div className="partner-stat-item">
                    <span>Agreed cost</span>
                    <strong>{money(outsource.cost)}</strong>
                  </div>
                  <div className="partner-stat-item">
                    <span>Already paid</span>
                    <strong>{money(outsource.paid)}</strong>
                    {outsource.paid > 0 && outsource.paidAt && (
                      <small style={{ fontSize: "10px", color: "#4ade80", display: "block", marginTop: 2 }}>
                        on {dateLabel(outsource.paidAt)}
                      </small>
                    )}
                  </div>
                  <div className="partner-stat-item">
                    <span>Balance due</span>
                    <strong style={{ color: remaining > 0 ? "var(--amber)" : "var(--green)" }}>{money(remaining)}</strong>
                  </div>
                </div>

                {outsource.payments && outsource.payments.length > 0 && (
                  <div style={{ borderTop: "1px dashed rgba(255,255,255,0.1)", paddingTop: 8, marginTop: 4 }}>
                    <span style={{ fontSize: "10px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 }}>
                      Payment History ({outsource.payments.length})
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: "80px", overflowY: "auto" }}>
                      {outsource.payments.map((p, idx) => (
                        <div key={p.id || idx} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#cbd5e1" }}>
                          <span><Check size={10} style={{ color: "#4ade80", display: "inline", marginRight: 4 }} />{p.note || "Payment"}</span>
                          <strong>{money(p.amount)} on {dateLabel(p.date)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 1-Click Toggle: "Amount has been paid" */}
              <div className="toggle-switch-row">
                <div className="toggle-switch-info">
                  <strong>Mark amount as paid to {outsource.provider}</strong>
                  <span>{isPaid ? `✓ Marked as paid in full (${money(outsource.cost)})${outsource.paidAt ? ` on ${dateLabel(outsource.paidAt)}` : ""}` : `Currently ${money(remaining)} remaining balance`}</span>
                </div>
                <button
                  type="button"
                  className={`toggle-switch-btn ${isPaid ? "on" : "off"}`}
                  onClick={() => onTogglePaid(outsource.id)}
                  title={isPaid ? "Click to toggle unpaid" : "Click to mark as paid in full"}
                >
                  <span className="toggle-switch-knob" />
                </button>
              </div>

              {/* Payment Mode Selector Tabs */}
              <div className="payment-mode-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "full"}
                  className={`payment-mode-tab ${mode === "full" ? "active" : ""}`}
                  onClick={() => setMode("full")}
                >
                  <CheckCircle2 size={13} /> Full Amount ({money(remaining)})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "partial"}
                  className={`payment-mode-tab ${mode === "partial" ? "active" : ""}`}
                  onClick={() => setMode("partial")}
                >
                  <CircleDollarSign size={13} /> Partial Payment
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "schedule"}
                  className={`payment-mode-tab ${mode === "schedule" ? "active" : ""}`}
                  onClick={() => setMode("schedule")}
                >
                  <Calendar size={13} /> Schedule Later
                </button>
              </div>

              {/* Mode 1: Transfer Full Amount */}
              {mode === "full" && (
                <div className="full-pay-box">
                  <div className="schedule-pay-title">
                    <CheckCircle2 size={16} style={{ color: "#4ade80" }} />
                    <strong style={{ color: "#ffffff" }}>Option 1: Transfer full amount using calendar</strong>
                  </div>
                  <CalendarPicker
                    label="Transfer date (select on calendar or write)"
                    value={fullDate}
                    onChange={setFullDate}
                  />
                  <div className="payment-breakdown-card">
                    <div className="payment-breakdown-row">
                      <span>Full amount to transfer:</span>
                      <strong style={{ color: "#4ade80", fontSize: "14px" }}>{money(remaining)}</strong>
                    </div>
                    <div className="payment-breakdown-row">
                      <span>Transfer date:</span>
                      <strong>{dateLabel(fullDate)}</strong>
                    </div>
                    <div className="payment-breakdown-row" style={{ borderTop: "1px dashed rgba(255,255,255,0.1)", paddingTop: 5 }}>
                      <span>Remaining balance after transfer:</span>
                      <strong style={{ color: "#4ade80" }}>{money(0)} (Paid in full)</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="primary-button complete-btn-success complete-action-button"
                    onClick={() => onPayImmediately(project, outsource, fullDate, alsoCompleteProject)}
                  >
                    <CheckCircle2 size={16} /> Transfer {money(remaining)} on {dateLabel(fullDate)} & Complete
                  </button>
                </div>
              )}

              {/* Mode 2: Send Partial Payment */}
              {mode === "partial" && (
                <div className="partial-pay-box">
                  <div className="schedule-pay-title">
                    <CircleDollarSign size={16} style={{ color: "#60a5fa" }} />
                    <strong style={{ color: "#ffffff" }}>Option 2: Send partial payment & record date</strong>
                  </div>
                  <div>
                    <Field
                      label="Partial payment amount (PKR)"
                      value={partialAmountText}
                      onChange={setPartialAmountText}
                      prefix="₨"
                      placeholder={`Enter amount (balance: ${remaining})`}
                      type="number"
                      required
                    />
                    <div className="partial-presets">
                      {[
                        { label: "25%", val: Number((remaining * 0.25).toFixed(2)) },
                        { label: "50%", val: Number((remaining * 0.5).toFixed(2)) },
                        { label: "75%", val: Number((remaining * 0.75).toFixed(2)) },
                        { label: "All remaining", val: remaining },
                      ].map(preset => (
                        <button
                          key={preset.label}
                          type="button"
                          className={`partial-preset-chip ${parsedPartialAmount === preset.val ? "active" : ""}`}
                          onClick={() => setPartialAmountText(String(preset.val))}
                        >
                          {preset.label} ({money(preset.val)})
                        </button>
                      ))}
                    </div>
                  </div>
                  <CalendarPicker
                    label="Payment date (select on calendar or write)"
                    value={partialDate}
                    onChange={setPartialDate}
                  />
                  <div className="payment-breakdown-card">
                    <div className="payment-breakdown-row">
                      <span>Paying now:</span>
                      <strong style={{ color: "#60a5fa", fontSize: "14px" }}>{money(parsedPartialAmount)}</strong>
                    </div>
                    <div className="payment-breakdown-row">
                      <span>Payment date:</span>
                      <strong>{dateLabel(partialDate)}</strong>
                    </div>
                    <div className="payment-breakdown-row" style={{ borderTop: "1px dashed rgba(255,255,255,0.1)", paddingTop: 5 }}>
                      <span>Remaining amount after payment:</span>
                      <strong style={{ color: remainingAfterPartial > 0 ? "var(--amber)" : "#4ade80" }}>
                        {money(remainingAfterPartial)} {remainingAfterPartial === 0 ? "(Paid in full)" : "remaining"}
                      </strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="primary-button complete-btn-blue complete-action-button"
                    disabled={parsedPartialAmount <= 0}
                    onClick={() => {
                      if (onPayPartial) {
                        onPayPartial(project, outsource, parsedPartialAmount, partialDate, alsoCompleteProject);
                      } else {
                        onPayImmediately(project, outsource, partialDate, alsoCompleteProject);
                      }
                    }}
                  >
                    <CircleDollarSign size={16} /> Send partial payment of {money(parsedPartialAmount)} on {dateLabel(partialDate)}
                  </button>
                </div>
              )}

              {/* Mode 3: Schedule Payout Date */}
              {mode === "schedule" && (
                <div className="schedule-pay-section">
                  <div className="schedule-pay-title">
                    <Calendar size={15} />
                    <span>Option 3: Set scheduled payout date</span>
                  </div>
                  <div className="quick-date-chips">
                    {[
                      { label: "Tomorrow", val: daysFromToday(1) },
                      { label: "In 3 days", val: daysFromToday(3) },
                      { label: "Next week", val: daysFromToday(7) },
                      { label: "In 2 weeks", val: daysFromToday(14) },
                    ].map(chip => (
                      <button
                        key={chip.label}
                        type="button"
                        className={`quick-date-chip ${scheduledDate === chip.val ? "active" : ""}`}
                        onClick={() => setScheduledDate(chip.val)}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                  <CalendarPicker
                    label="Scheduled payout date (select on calendar or write)"
                    value={scheduledDate}
                    onChange={setScheduledDate}
                  />
                  <div className="payment-breakdown-card">
                    <div className="payment-breakdown-row">
                      <span>Payout balance:</span>
                      <strong>{money(remaining)}</strong>
                    </div>
                    <div className="payment-breakdown-row">
                      <span>Scheduled payout date:</span>
                      <strong>{dateLabel(scheduledDate)}</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="secondary-button complete-action-button"
                    onClick={() => onSchedulePay(project, outsource, scheduledDate, alsoCompleteProject)}
                  >
                    <Calendar size={15} /> Schedule for {dateLabel(scheduledDate)} & complete
                  </button>
                </div>
              )}

              {project.status !== "Completed" && (
                <label className="complete-project-checkbox">
                  <input
                    type="checkbox"
                    checked={alsoCompleteProject}
                    onChange={e => setAlsoCompleteProject(e.target.checked)}
                  />
                  <span>Also mark project &ldquo;{project.name}&rdquo; as Completed</span>
                </label>
              )}

              {/* Complete without paying now */}
              <button
                type="button"
                className="text-button"
                style={{ alignSelf: "center", fontSize: "12px", color: "var(--muted)", marginTop: 2 }}
                onClick={() => onCompleteOnly(project)}
              >
                Complete project now (pay partner later)
              </button>
            </>
          ) : (
            <div className="completion-actions">
              <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>
                This is an in-house project. Marking it complete will update its status and archive it in your completed records.
              </p>
              <button
                type="button"
                className="primary-button complete-btn-success"
                onClick={() => onCompleteOnly(project)}
              >
                <CheckCircle2 size={16} /> Complete project
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectTable({
  projects,
  store,
  navigate,
  onOutsource,
  onPayment,
  onRemove,
  onComplete,
  onReopen,
  onTogglePartnerPaid,
  onOpenPayment,
  onAddProject,
}: {
  projects: Project[];
  store: Store;
  navigate: (path: string) => void;
  onOutsource: (project: Project) => void;
  onPayment: (project: Project) => void;
  onRemove: (project: Project) => void;
  onComplete: (project: Project) => void;
  onReopen: (project: Project) => void;
  onTogglePartnerPaid: (outsourceId: string) => void;
  onOpenPayment?: (project: Project, outsource?: Outsource, initialMode?: "full" | "partial" | "schedule") => void;
  onAddProject?: () => void;
}) {
  if (!projects.length) {
    if (store.projects.length === 0) {
      return (
        <EmptyState
          icon={BriefcaseBusiness}
          title="No projects yet"
          description="Create your first project to get started with tracking work, outsourced handoffs, and client receivables."
          action={
            onAddProject ? (
              <button className="primary-button" onClick={onAddProject}>
                <Plus size={16} /> Add project
              </button>
            ) : undefined
          }
        />
      );
    }
    return <EmptyState icon={BriefcaseBusiness} title="No projects match" description="Try clearing a filter or add a new project to get started." />;
  }
  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th>Project</th>
            <th>Client</th>
            <th>Status</th>
            <th>Deadline</th>
            <th>Amount</th>
            <th>Payment</th>
            <th>Assignment</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {projects.map(project => {
            const remaining = project.amount - project.received;
            const outsource = store.outsources.find(item => item.projectId === project.id);
            const isCompleted = project.status === "Completed";
            return (
              <tr key={project.id} onClick={() => navigate(`/projects/${project.id}`)}>
                <td>
                  <div className="project-cell">
                    <div className="project-logo">{(project.name || "P").slice(0, 1)}</div>
                    <div>
                      <strong>{project.name || "Untitled Project"}</strong>
                      <span>{project.priority || "Medium"} priority</span>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="client-name">{project.client || "Direct client"}</span>
                  <span className="table-subtle">{(project.contact || "").split(" · ")[0] || project.contact || "Direct"}</span>
                </td>
                <td>
                  <div style={{ display: "inline-flex", alignItems: "center" }}>
                    <StatusPill tone={project.status === "In Progress" ? "in-progress" : project.status.toLowerCase().replace(/\s+/g, "-")}>
                      {project.status}
                    </StatusPill>
                    {isCompleted ? (
                      <button
                        className="quick-complete-pill completed"
                        onClick={e => { e.stopPropagation(); onReopen(project); }}
                        title="Project completed. Click to reopen"
                      >
                        <Check size={11} /> Done
                      </button>
                    ) : (
                      <button
                        className="quick-complete-pill"
                        onClick={e => { e.stopPropagation(); onComplete(project); }}
                        title="Click to complete project"
                      >
                        <CheckCircle2 size={11} /> Complete
                      </button>
                    )}
                  </div>
                </td>
                <td>
                  <span className={project.deadline < today() && !isCompleted ? "overdue-date" : "date-main"}>
                    {dateLabel(project.deadline)}
                  </span>
                  <span className="table-subtle">{project.deadline < today() ? "Past due" : "Due soon"}</span>
                </td>
                <td>
                  <strong className="amount-cell">{money(project.amount)}</strong>
                  <span className="table-subtle">project value</span>
                </td>
                <td>
                  <div className="payment-cell">
                    <div className="progress-track">
                      <span style={{ width: `${Math.min(100, (project.received / project.amount) * 100)}%` }} />
                    </div>
                    <span>{remaining > 0 ? `${money(remaining)} left` : "Paid in full"}</span>
                  </div>
                </td>
                <td>
                  {outsource ? (
                    <div className="assignment-cell" style={{ flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Avatar name={outsource.provider} />
                        <span>{outsource.provider}</span>
                      </div>
                      {outsource.paid >= outsource.cost ? (
                        <>
                          <button
                            className="partner-paid-toggle paid"
                            onClick={e => {
                              e.stopPropagation();
                              if (onOpenPayment) onOpenPayment(project, outsource, "full");
                              else onTogglePartnerPaid(outsource.id);
                            }}
                            title="Paid in full. Click to view or adjust payment"
                          >
                            <Check size={10} /> Paid in full
                          </button>
                          {outsource.paidAt && (
                            <span style={{ fontSize: "10px", color: "#4ade80", display: "inline-flex", alignItems: "center", gap: 3 }}>
                              Paid on {dateLabel(outsource.paidAt)}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <button
                            className="partner-paid-toggle unpaid"
                            onClick={e => {
                              e.stopPropagation();
                              if (onOpenPayment) onOpenPayment(project, outsource, outsource.paid > 0 ? "partial" : "full");
                              else onTogglePartnerPaid(outsource.id);
                            }}
                            title={`Click to transfer full or partial payment (${money(outsource.cost - outsource.paid)} remaining)`}
                          >
                            <CircleDollarSign size={10} /> {money(outsource.cost - outsource.paid)} due (Pay)
                          </button>
                          {outsource.paid > 0 && (
                            <span style={{ fontSize: "10px", color: "#60a5fa", display: "inline-flex", alignItems: "center", gap: 3 }}>
                              <Check size={10} /> Paid {money(outsource.paid)}{outsource.paidAt ? ` on ${dateLabel(outsource.paidAt)}` : ""}
                            </span>
                          )}
                        </>
                      )}
                      {outsource.payDate && outsource.paid < outsource.cost && (
                        <span style={{ fontSize: "10px", color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                          <Calendar size={10} /> Pay by {dateLabel(outsource.payDate)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="unassigned">Not outsourced</span>
                  )}
                </td>
                <td>
                  <div className="row-actions" onClick={e => e.stopPropagation()}>
                    <button
                      className="icon-button"
                      title={isCompleted ? "Reopen project" : "Complete project"}
                      onClick={() => isCompleted ? onReopen(project) : onComplete(project)}
                    >
                      {isCompleted ? <RotateCcw size={15} /> : <CheckCircle2 size={15} />}
                    </button>
                    <button className="icon-button" title="Record payment" onClick={() => onPayment(project)}>
                      <CreditCard size={15} />
                    </button>
                    <button className="icon-button" title="Outsource" onClick={() => onOutsource(project)}>
                      <Link2 size={15} />
                    </button>
                    <button className="icon-button danger-icon" title="Remove project" onClick={() => onRemove(project)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProjectsPage({
  store,
  navigate,
  openDrawer,
  onRemove,
  onComplete,
  onReopen,
  onTogglePartnerPaid,
  onOpenPayment,
}: {
  store: Store;
  navigate: (path: string) => void;
  openDrawer: (kind: DrawerKind, context?: Project) => void;
  onRemove: (project: Project) => void;
  onComplete: (project: Project) => void;
  onReopen: (project: Project) => void;
  onTogglePartnerPaid: (outsourceId: string) => void;
  onOpenPayment?: (project: Project, outsource?: Outsource, initialMode?: "full" | "partial" | "schedule") => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [sortBy, setSortBy] = useState("Deadline");
  const active = store.projects.filter(p => !["Completed", "Cancelled"].includes(p.status)).length;
  const outsourced = store.projects.filter(p => p.outsourced).length;
  const outstanding = store.projects.reduce((sum, p) => sum + Math.max(0, (p.amount || 0) - (p.received || 0)), 0);
  const dueSoon = store.projects.filter(p => (p.deadline || "") <= daysFromToday(7) && p.status !== "Completed" && p.status !== "Cancelled").length;
  const filtered = useMemo(() => store.projects.filter(p => `${p.name || ""} ${p.client || ""} ${p.contact || ""}`.toLowerCase().includes(query.toLowerCase()) && (statusFilter === "All statuses" || p.status === statusFilter)).sort((a, b) => sortBy === "Amount" ? (b.amount || 0) - (a.amount || 0) : sortBy === "Name" ? (a.name || "").localeCompare(b.name || "") : (a.deadline || "").localeCompare(b.deadline || "")), [store.projects, query, statusFilter, sortBy]);

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Your command center."
        description="Projects, partners, and payments — connected in one vivid workspace."
        action={<button className="primary-button" onClick={() => openDrawer("project")}><Plus size={16} /> Add project</button>}
        secondary={<button className="secondary-button" onClick={() => openDrawer("receivable")}><Receipt size={15} /> Add receivable</button>}
      />
      <div className="summary-grid">
        <SummaryCard label="Active projects" value={String(active).padStart(2, "0")} note="Across your current pipeline" icon={BriefcaseBusiness} accent="summary-blue" />
        <SummaryCard label="Outsourced" value={String(outsourced).padStart(2, "0")} note="Assignments in motion" icon={Link2} accent="summary-indigo" />
        <SummaryCard label="Outstanding" value={money(outstanding)} note="Client payments remaining" icon={WalletCards} accent="summary-green" />
        <SummaryCard label="Due soon" value={String(dueSoon).padStart(2, "0")} note="Within the next 7 days" icon={Clock3} accent="summary-amber" />
      </div>
      <div className="relationship-strip">
        <div className="relationship-intro">
          <div className="relationship-pulse"><Link2 size={15} /></div>
          <div>
            <strong>Live relationship map</strong>
            <span>Every delivery and dollar stays anchored to a project.</span>
          </div>
        </div>
        <div className="relationship-flow">
          <button onClick={() => navigate("/")}><span className="relation-dot blue" /> Projects <b>{store.projects.length}</b></button>
          <ArrowRight size={14} />
          <button onClick={() => navigate("/outsourced")}><span className="relation-dot purple" /> Outsourced <b>{store.outsources.length}</b></button>
          <ArrowRight size={14} />
          <button onClick={() => navigate("/receivables")}><span className="relation-dot pink" /> Receivables <b>{store.receivables.length}</b></button>
        </div>
      </div>
      <section className="section-block">
        <div className="section-heading">
          <div>
            <div className="section-kicker">Project list</div>
            <h2>All projects <span>{store.projects.length}</span></h2>
          </div>
          <button className="text-button" onClick={() => { setQuery(""); setStatusFilter("All statuses"); }}>Clear filters</button>
        </div>
        <div className="filter-bar">
          <div className="search-field">
            <Search size={16} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search projects or clients" />
            <kbd>⌘ K</kbd>
          </div>
          <div className="select-wrap">
            <Filter size={15} />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option>All statuses</option>
              <option>New</option>
              <option>In Progress</option>
              <option>Waiting</option>
              <option>Completed</option>
              <option>Cancelled</option>
            </select>
            <ChevronDown size={14} />
          </div>
          <div className="select-wrap">
            <span className="sort-label">Sort</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option>Deadline</option>
              <option>Amount</option>
              <option>Name</option>
            </select>
            <ChevronDown size={14} />
          </div>
        </div>
        <ProjectTable
          projects={filtered}
          store={store}
          navigate={navigate}
          onOutsource={project => openDrawer("outsource", project)}
          onPayment={project => openDrawer("payment", project)}
          onRemove={onRemove}
          onComplete={onComplete}
          onReopen={onReopen}
          onTogglePartnerPaid={onTogglePartnerPaid}
          onOpenPayment={onOpenPayment}
          onAddProject={() => openDrawer("project")}
        />
      </section>
      <section className="workflow-callout">
        <div className="callout-mark"><Sparkles size={17} /></div>
        <div>
          <strong>One record, many connected views.</strong>
          <p>Add a project once and Worknest keeps its outsourced work, receivable, credentials, and scripts in sync.</p>
        </div>
        <button className="text-button" onClick={() => navigate("/tools")}>Explore tools <ArrowRight size={14} /></button>
      </section>
    </>
  );
}

function ProjectDetailPage({
  project,
  store,
  setStore,
  navigate,
  openDrawer,
  onRemove,
  onComplete,
  onReopen,
  onTogglePartnerPaid,
  onOpenPayment,
}: {
  project: Project;
  store: Store;
  setStore: Dispatch<SetStateAction<Store>>;
  navigate: (path: string) => void;
  openDrawer: (kind: DrawerKind, context?: Project) => void;
  onRemove: (project: Project) => void;
  onComplete: (project: Project) => void;
  onReopen: (project: Project) => void;
  onTogglePartnerPaid: (outsourceId: string) => void;
  onOpenPayment?: (project: Project, outsource?: Outsource, initialMode?: "full" | "partial" | "schedule") => void;
}) {
  const outsources = (store.outsources || []).filter(item => item.projectId === project.id);
  const receivable = (store.receivables || []).find(item => item.projectId === project.id);
  const credentials = (store.credentials || []).filter(item => item.projectId === project.id);
  const scripts = (store.scripts || []).filter(item => item.projectId === project.id);
  const tasks = Array.isArray(project.tasks) ? project.tasks : [];
  const progress = tasks.length > 0 ? Math.round((tasks.filter(task => task.done).length / tasks.length) * 100) : 0;
  const toggleTask = (id: string) => setStore(current => ({ ...current, projects: (current.projects || []).map(item => item.id === project.id ? { ...item, tasks: (item.tasks || []).map(task => task.id === id ? { ...task, done: !task.done } : task) } : item) }));
  const addTask = () => {
    const label = window.prompt("Enter task name:");
    if (!label?.trim()) return;
    setStore(current => ({
      ...current,
      projects: (current.projects || []).map(item => item.id === project.id ? {
        ...item,
        tasks: [...(item.tasks || []), { id: uid(), label: label.trim(), done: false }]
      } : item)
    }));
    toast.success("Task added");
  };
  const isCompleted = project.status === "Completed";
  const mainOutsource = outsources[0];

  return (
    <>
      <button className="back-link" onClick={() => navigate("/")}><ArrowLeft size={15} /> Back to projects</button>
      <div className="detail-header">
        <div>
          <div className="eyebrow">Project / {project.id.toUpperCase()}</div>
          <h1>{project.name}</h1>
          <p>{project.description}</p>
        </div>
        <div className="detail-header-actions">
          {isCompleted ? (
            <button className="secondary-button" onClick={() => onReopen(project)}>
              <RotateCcw size={15} /> Reopen project
            </button>
          ) : (
            <button className="primary-button complete-btn-success" onClick={() => onComplete(project)}>
              <CheckCircle2 size={15} /> Complete project
            </button>
          )}
          <button className="secondary-button" onClick={() => openDrawer("outsource", project)}><Link2 size={15} /> Outsource project</button>
          <button className="primary-button" onClick={() => openDrawer("payment", project)}><CreditCard size={15} /> Record payment</button>
          <button className="danger-button" onClick={() => onRemove(project)}><Trash2 size={15} /> Remove</button>
        </div>
      </div>
      <div className="detail-layout">
        <div className="detail-main">
          <section className="panel overview-panel">
            <div className="panel-heading">
              <div><div className="section-kicker">Overview</div><h2>Project details</h2></div>
              <div className="heading-pills">
                <StatusPill tone={project.status.toLowerCase().replace(/\s+/g, "-")}>{project.status}</StatusPill>
                <StatusPill tone={`priority-${project.priority.toLowerCase()}`}>{project.priority} priority</StatusPill>
              </div>
            </div>
            <div className="meta-grid">
              <div>
                <span className="meta-label">Client</span>
                <strong>{project.client}</strong>
                <span>{project.contact}</span>
              </div>
              <div>
                <span className="meta-label">Timeline</span>
                <strong>{dateLabel(project.start)} → {dateLabel(project.deadline)}</strong>
                <span>{project.deadline < today() ? "Deadline has passed" : "Current deadline"}</span>
              </div>
              <div>
                <span className="meta-label">Assignment</span>
                <strong>{project.outsourced ? `Outsourced to ${project.outsourcedTo || mainOutsource?.provider || "partner"}` : "Handled in-house"}</strong>
                {mainOutsource ? (
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                    <button
                      className={`partner-paid-toggle ${mainOutsource.paid >= mainOutsource.cost ? "paid" : "unpaid"}`}
                      onClick={() => {
                        if (onOpenPayment) onOpenPayment(project, mainOutsource, mainOutsource.paid > 0 ? "partial" : "full");
                        else onTogglePartnerPaid(mainOutsource.id);
                      }}
                      title="Click to transfer payment or adjust"
                    >
                      {mainOutsource.paid >= mainOutsource.cost ? (
                        <><Check size={11} /> Paid in full</>
                      ) : (
                        <><CircleDollarSign size={11} /> {money(mainOutsource.cost - mainOutsource.paid)} due (Pay)</>
                      )}
                    </button>
                    {mainOutsource.paid > 0 && mainOutsource.paidAt && (
                      <span style={{ fontSize: "11px", color: mainOutsource.paid >= mainOutsource.cost ? "#4ade80" : "#60a5fa", display: "inline-flex", alignItems: "center", gap: 3 }}>
                        <Check size={10} /> Paid {money(mainOutsource.paid)} on {dateLabel(mainOutsource.paidAt)}
                      </span>
                    )}
                    {mainOutsource.paid < mainOutsource.cost && (
                      <span style={{ fontSize: "11px", color: "var(--amber)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                        Remaining: {money(mainOutsource.cost - mainOutsource.paid)}
                      </span>
                    )}
                    {mainOutsource.payDate && mainOutsource.paid < mainOutsource.cost && (
                      <span style={{ fontSize: "10px", color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                        <Calendar size={10} /> Pay by: {dateLabel(mainOutsource.payDate)}
                      </span>
                    )}
                  </div>
                ) : (
                  <span>{project.outsourced ? "Linked delivery partner" : "No outsourcing yet"}</span>
                )}
              </div>
            </div>
            <div className="description-block"><span className="meta-label">Description</span><p>{project.description}</p></div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div><div className="section-kicker">Work</div><h2>Tasks <span className="heading-count">{tasks.filter(t => t.done).length}/{tasks.length}</span></h2></div>
              <div className="mini-progress"><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><span>{progress}% complete</span></div>
            </div>
            <div className="task-list">
              {tasks.length > 0 ? (
                tasks.map(task => (
                  <button className={`task-row ${task.done ? "done" : ""}`} key={task.id} onClick={() => toggleTask(task.id)}>
                    <span className="task-check">{task.done && <Check size={13} />}</span>
                    <span>{task.label}</span>
                    <ArrowRight size={14} />
                  </button>
                ))
              ) : (
                <div style={{ color: "var(--muted)", fontSize: "12px", padding: "8px 0" }}>No tasks created yet.</div>
              )}
            </div>
            <button className="add-task-button" onClick={addTask}><Plus size={14} /> Add task</button>
          </section>
          <section className="panel notes-panel">
            <div className="panel-heading"><div><div className="section-kicker">Notes</div><h2>Working notes</h2></div><button className="icon-button"><Pencil size={15} /></button></div>
            <p>{project.notes}</p>
          </section>
        </div>
        <aside className="detail-rail">
          <section className="panel financial-panel">
            <div className="section-kicker">Financial</div>
            <h2>Project value</h2>
            <div className="big-amount">{money(project.amount)}</div>
            <div className="financial-row"><span>Received</span><strong>{money(project.received)}</strong></div>
            <div className="financial-row"><span>Remaining</span><strong className="accent-text">{money(project.amount - project.received)}</strong></div>
            <div className="progress-track large"><span style={{ width: `${Math.min(100, (project.received / project.amount) * 100)}%` }} /></div>
            <div className="financial-foot"><span>{Math.round((project.received / project.amount) * 100)}% paid</span><span>{receivable?.status || "No receivable"}</span></div>
          </section>
          <section className="panel linked-panel">
            <div className="panel-heading"><div><div className="section-kicker">Connected</div><h2>Linked records</h2></div><Link2 size={16} className="muted-icon" /></div>
            <LinkedRecord icon={Link2} label="Outsourced work" value={outsources.length ? `${outsources.length} assignment${outsources.length > 1 ? "s" : ""}` : "Not outsourced"} onClick={() => openDrawer("outsource", project)} />
            <LinkedRecord icon={Receipt} label="Receivable" value={receivable ? `${money(project.amount - receivable.received)} outstanding` : "Not created"} onClick={() => openDrawer("receivable", project)} />
            <LinkedRecord icon={KeyRound} label="Credentials" value={`${credentials.length} saved`} onClick={() => navigate("/tools?tab=credentials")} />
            <LinkedRecord icon={Code2} label="Scripts" value={`${scripts.length} related`} onClick={() => navigate("/tools?tab=scripts")} />
          </section>
          <section className="panel detail-tip"><div className="tip-icon"><ShieldCheck size={17} /></div><div><strong>Context stays connected.</strong><p>Update the project once; linked financial and delivery views follow.</p></div></section>
        </aside>
      </div>
    </>
  );
}
function LinkedRecord({ icon: Icon, label, value, onClick }: { icon: typeof Link2; label: string; value: string; onClick: () => void }) { return <button className="linked-row" onClick={onClick}><span className="linked-icon"><Icon size={15} /></span><span><strong>{label}</strong><small>{value}</small></span><ArrowUpRight size={14} /></button>; }

function OutsourcedPage({ store, openDrawer, navigate, onTogglePartnerPaid, onOpenPayment }: { store: Store; openDrawer: (kind: DrawerKind, context?: Project) => void; navigate: (path: string) => void; onTogglePartnerPaid: (outsourceId: string) => void; onOpenPayment?: (project: Project, outsource?: Outsource, initialMode?: "full" | "partial" | "schedule") => void }) {
  return (
    <>
      <PageHeader
        eyebrow="Delivery partners"
        title="Outsourced work"
        description="Keep every handoff tied to the project it belongs to."
        action={<button className="primary-button" onClick={() => openDrawer("outsource")}><Plus size={16} /> Add assignment</button>}
      />
      <div className="info-strip">
        <div className="info-strip-icon"><Link2 size={17} /></div>
        <div><strong>Project context is automatic.</strong><p>Select a project once and its client, deadline, and value stay connected here.</p></div>
        <div className="info-strip-stat"><span>Active assignments</span><strong>{store.outsources.filter(item => !["Completed", "Cancelled"].includes(item.status)).length}</strong></div>
      </div>
      <section className="section-block">
        <div className="section-heading">
          <div><div className="section-kicker">Assignment list</div><h2>All outsourced work <span>{store.outsources.length}</span></h2></div>
          <div className="list-legend"><span className="legend-dot blue" /> Active <span className="legend-dot green" /> Completed</div>
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Outsourced to</th>
                <th>Status</th>
                <th>Payment Record</th>
                <th>Cost</th>
                <th>Payment</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {store.outsources.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "48px 16px", color: "var(--muted)" }}>
                    No outsourced assignments yet. Click &ldquo;Add assignment&rdquo; above to link a delivery partner to a project.
                  </td>
                </tr>
              ) : (
                store.outsources.map(item => {
                  const project = store.projects.find(p => p.id === item.projectId);
                if (!project) return null;
                const isPaid = item.paid >= item.cost;
                return (
                  <tr key={item.id}>
                    <td>
                      <button className="link-button" onClick={() => navigate(`/projects/${project.id}`)}>{project.name} <ArrowUpRight size={13} /></button>
                      <span className="table-subtle">{project.description.slice(0, 36)}…</span>
                    </td>
                    <td><span className="client-name">{project.client}</span></td>
                    <td>
                      <div className="assignment-cell">
                        <Avatar name={item.provider} />
                        <div><strong>{item.provider}</strong><span>{item.contact}</span></div>
                      </div>
                    </td>
                    <td><StatusPill tone={item.status.toLowerCase().replace(/\s+/g, "-")}>{item.status}</StatusPill></td>
                    <td>
                      {isPaid ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span className="paid-record-badge">
                            <Check size={11} /> Paid on {dateLabel(item.paidAt || today())}
                          </span>
                          <span className="table-subtle" style={{ fontSize: "10px" }}>Payment recorded</span>
                        </div>
                      ) : item.paid > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span className="paid-record-badge" style={{ background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa", borderColor: "rgba(59, 130, 246, 0.3)" }}>
                            <CircleDollarSign size={11} /> Partial: {money(item.paid)} on {dateLabel(item.paidAt || today())}
                          </span>
                          <span className="table-subtle" style={{ fontSize: "10px", color: "var(--amber)" }}>
                            {money(item.cost - item.paid)} remaining
                          </span>
                        </div>
                      ) : item.payDate ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span className="scheduled-record-badge">
                            <Calendar size={11} /> Payout {dateLabel(item.payDate)}
                          </span>
                          <span className="table-subtle" style={{ fontSize: "10px" }}>Scheduled payout</span>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span className="pending-record-badge">
                            <Clock3 size={11} /> Payment pending
                          </span>
                          <span className="table-subtle" style={{ fontSize: "10px" }}>Awaiting payout</span>
                        </div>
                      )}
                    </td>
                    <td><strong className="amount-cell">{money(item.cost)}</strong></td>
                    <td>
                      <div className="payment-cell">
                        <div className="progress-track"><span style={{ width: `${Math.min(100, (item.paid / item.cost) * 100)}%` }} /></div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
                          <span>
                            {item.paid >= item.cost
                              ? "Paid in full"
                              : item.paid > 0
                              ? `${money(item.cost - item.paid)} left`
                              : `${money(item.cost)} remaining`}
                          </span>
                          <button
                            className={`partner-paid-toggle ${isPaid ? "paid" : "unpaid"}`}
                            onClick={e => {
                              e.stopPropagation();
                              if (onOpenPayment) onOpenPayment(project, item, item.paid > 0 ? "partial" : "full");
                              else onTogglePartnerPaid(item.id);
                            }}
                            title={isPaid ? "Paid in full. Click to view or adjust" : `Click to transfer full or partial payment (${money(item.cost - item.paid)} remaining)`}
                          >
                            {isPaid ? <><Check size={10} /> Paid</> : "Pay"}
                          </button>
                        </div>
                        {item.paid > 0 && item.paidAt && (
                          <div style={{ fontSize: "10px", color: isPaid ? "#4ade80" : "#60a5fa", marginTop: 3, display: "flex", alignItems: "center", gap: 3 }}>
                            <Check size={10} /> Paid {money(item.paid)} on {dateLabel(item.paidAt)}
                          </div>
                        )}
                        {item.payDate && !isPaid && (
                          <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
                            <Calendar size={10} /> Payout date: {dateLabel(item.payDate)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td><button className="icon-button" onClick={() => toast.info(`Assignment for ${item.provider}: ${isPaid ? "Paid in full" : `${money(item.cost - item.paid)} balance remaining`}`)}><MoreHorizontal size={15} /></button></td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function ReceivablesPage({ store, openDrawer, navigate }: { store: Store; openDrawer: (kind: DrawerKind, context?: Project) => void; navigate: (path: string) => void }) {
  const total = store.receivables.reduce((sum, item) => sum + (store.projects.find(p => p.id === item.projectId)?.amount || 0), 0);
  const received = store.receivables.reduce((sum, item) => sum + (item.received || 0), 0);
  const outstanding = store.receivables.reduce((sum, item) => sum + Math.max(0, (store.projects.find(p => p.id === item.projectId)?.amount || 0) - (item.received || 0)), 0);
  const overdue = store.receivables.filter(item => (item.dueDate || "") < today() && (item.received || 0) < (store.projects.find(p => p.id === item.projectId)?.amount || 0)).length;

  return (
    <>
      <PageHeader
        eyebrow="Cash flow"
        title="Outstanding, in one view."
        description="Track what clients owe and make the next payment action obvious."
        action={<button className="primary-button" onClick={() => openDrawer("receivable")}><Plus size={16} /> Add receivable</button>}
      />
      <div className="summary-grid receivable-summary">
        <SummaryCard label="Total receivable" value={money(total)} note="Across linked projects" icon={Receipt} accent="summary-blue" />
        <SummaryCard label="Received" value={money(received)} note="Payments recorded" icon={CheckCircle2} accent="summary-green" />
        <SummaryCard label="Outstanding" value={money(outstanding)} note="Still to collect" icon={WalletCards} accent="summary-amber" />
        <SummaryCard label="Overdue" value={String(overdue).padStart(2, "0")} note="Needs a follow-up" icon={Clock3} accent="summary-red" />
      </div>
      <section className="section-block">
        <div className="section-heading">
          <div><div className="section-kicker">Receivable list</div><h2>Client payments <span>{store.receivables.length}</span></h2></div>
          <button className="secondary-button" onClick={() => toast.success("Receivables are already in sync.")}><Check size={15} /> Reconciled</button>
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Amount</th>
                <th>Received</th>
                <th>Remaining</th>
                <th>Due date</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {store.receivables.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "48px 16px", color: "var(--muted)" }}>
                    No receivables yet. Click &ldquo;Add receivable&rdquo; above to track expected payments.
                  </td>
                </tr>
              ) : (
                store.receivables.map(item => {
                  const project = store.projects.find(p => p.id === item.projectId);
                if (!project) return null;
                const remaining = Math.max(0, project.amount - item.received);
                const isOverdue = item.dueDate < today() && remaining > 0;
                return (
                  <tr key={item.id}>
                    <td>
                      <button className="link-button" onClick={() => navigate(`/projects/${project.id}`)}>
                        {project.name} <ArrowUpRight size={13} />
                      </button>
                    </td>
                    <td>
                      <span className="client-name">{project.client || "Direct client"}</span>
                      <span className="table-subtle">{(project.contact || "").split(" · ")[0] || project.contact || "Direct"}</span>
                    </td>
                    <td><strong className="amount-cell">{money(project.amount)}</strong></td>
                    <td><strong className="received-cell">{money(item.received)}</strong></td>
                    <td><strong className={remaining ? "outstanding-cell" : "received-cell"}>{money(remaining)}</strong></td>
                    <td><span className={isOverdue ? "overdue-date" : "date-main"}>{dateLabel(item.dueDate)}</span><span className="table-subtle">{isOverdue ? "Past due" : "Due date"}</span></td>
                    <td><StatusPill tone={isOverdue ? "overdue" : item.status.toLowerCase().replace(/\s+/g, "-")}>{isOverdue ? "Overdue" : item.status}</StatusPill></td>
                    <td><button className="small-action" onClick={() => openDrawer("payment", project)}>{remaining ? "Record payment" : "Paid"}</button></td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="payment-note">
        <CircleDollarSign size={17} />
        <div>
          <strong>Quick payment recording</strong>
          <p>Payments are applied to the linked project and receivable together, so your outstanding amount is always current.</p>
        </div>
      </div>
    </>
  );
}

function ToolsPage({ store, setStore, openDrawer, navigate }: { store: Store; setStore: Dispatch<SetStateAction<Store>>; openDrawer: (kind: DrawerKind, context?: Project) => void; navigate: (path: string) => void }) {
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const tabParam = params.get("tab");
  const defaultTab: ToolTab = (tabParam === "amounts" || tabParam === "calculator") ? "calculator" : (tabParam as ToolTab) || "credentials";
  const [tab, setTab] = useState<ToolTab>(defaultTab);
  const tabs = [
    { id: "credentials" as const, label: "Credentials", icon: KeyRound },
    { id: "scripts" as const, label: "Scripts", icon: Code2 },
    { id: "calculator" as const, label: "Amounts & Cost Calculator", icon: Calculator },
  ];
  return <><PageHeader eyebrow="Utilities" title="Tools that stay close." description="Small, focused utilities for the work between projects." /><div className="tool-tabs">{tabs.map(item => { const Icon = item.icon; const isActive = tab === item.id || (item.id === "calculator" && tab === "amounts"); return <button key={item.id} className={isActive ? "active" : ""} onClick={() => setTab(item.id)}><Icon size={16} /> {item.label}</button>; })}</div>{tab === "credentials" && <CredentialsTab store={store} setStore={setStore} openDrawer={openDrawer} navigate={navigate} />}{tab === "scripts" && <ScriptsTab store={store} openDrawer={openDrawer} navigate={navigate} />}{(tab === "calculator" || tab === "amounts") && <CalculatorTab />}</>;
}
function CredentialsTab({ store, setStore, openDrawer, navigate }: { store: Store; setStore: Dispatch<SetStateAction<Store>>; openDrawer: (kind: DrawerKind, context?: Project) => void; navigate: (path: string) => void }) {
  const [revealed, setRevealed] = useState<string[]>([]); const [query, setQuery] = useState(""); const filtered = store.credentials.filter(item => `${item.service} ${item.username}`.toLowerCase().includes(query.toLowerCase())); const remove = (id: string) => { if (!window.confirm("Delete this credential? This cannot be undone.")) return; setStore(current => ({ ...current, credentials: current.credentials.filter(item => item.id !== id) })); toast.success("Credential removed"); };
  return <section className="section-block tools-section"><div className="section-heading"><div><div className="section-kicker">Private access</div><h2>Credentials <span>{store.credentials.length}</span></h2><p className="section-description">Keep service access close to the project it belongs to.</p></div><button className="primary-button" onClick={() => openDrawer("credential")}><Plus size={16} /> Add credential</button></div><div className="tool-toolbar"><div className="search-field"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search services" /></div><div className="privacy-note"><ShieldCheck size={15} /> Passwords hidden by default</div></div><div className="credential-list">{filtered.map(item => { const project = store.projects.find(p => p.id === item.projectId); const visible = revealed.includes(item.id); return <div className="credential-card" key={item.id}><div className="credential-service-icon"><KeyRound size={18} /></div><div className="credential-main"><div className="credential-title"><div><strong>{item.service}</strong><span>{project ? <button className="subtle-link" onClick={() => navigate(`/projects/${project.id}`)}>{project.name}</button> : "No linked project"}</span></div><div className="credential-actions"><button className="icon-button" onClick={() => setRevealed(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])}>{visible ? <EyeOff size={15} /> : <Eye size={15} />}</button><button className="icon-button" onClick={() => { navigator.clipboard?.writeText(item.password); toast.success("Password copied"); }}><Copy size={15} /></button><button className="icon-button" onClick={() => remove(item.id)}><Trash2 size={15} /></button></div></div><div className="credential-fields"><div><span>Username / email</span><strong>{item.username}</strong></div><div><span>Password</span><strong className="password-field">{visible ? item.password : "••••••••••••"}</strong></div><div className="url-field"><span>URL</span><a href={item.url} target="_blank" rel="noreferrer">{item.url.replace("https://", "")} <ExternalLink size={12} /></a></div></div></div></div>; })}{!filtered.length && <EmptyState icon={KeyRound} title="No credentials found" description="Add a service credential or adjust your search." action={<button className="secondary-button" onClick={() => openDrawer("credential")}><Plus size={15} /> Add credential</button>} />}</div></section>;
}
function ScriptsTab({ store, openDrawer, navigate }: { store: Store; openDrawer: (kind: DrawerKind, context?: Project) => void; navigate: (path: string) => void }) {
  const [query, setQuery] = useState(""); const [category, setCategory] = useState("All categories"); const filtered = store.scripts.filter(item => `${item.name} ${item.description} ${item.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()) && (category === "All categories" || item.category === category)); const categories = ["All categories", "Linux", "Docker", "AWS", "Python", "DevOps", "Database", "Deployment", "AI", "Automation", "n8n", "Other"];
  return <section className="section-block tools-section"><div className="section-heading"><div><div className="section-kicker">Reusable knowledge</div><h2>Scripts & snippets <span>{store.scripts.length}</span></h2><p className="section-description">A small library for commands, prompts, and technical handoffs.</p></div><button className="primary-button" onClick={() => openDrawer("script")}><Plus size={16} /> Add script</button></div><div className="tool-toolbar"><div className="search-field"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search scripts, tags, or descriptions" /></div><div className="select-wrap"><Filter size={15} /><select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></div></div><div className="script-grid">{filtered.map(item => { const project = store.projects.find(p => p.id === item.projectId); return <article className="script-card" key={item.id}><div className="script-card-top"><div className="script-icon"><FileCode2 size={17} /></div><StatusPill tone="category-pill">{item.category}</StatusPill><button className="icon-button more-left"><MoreHorizontal size={15} /></button></div><h3>{item.name}</h3><p>{item.description}</p><pre><code>{item.code}</code></pre><div className="script-card-footer"><div className="tag-list">{item.tags.map(tag => <span key={tag}>#{tag}</span>)}</div><button className="copy-script" onClick={() => { navigator.clipboard?.writeText(item.code); toast.success("Script copied"); }}><Copy size={14} /> Copy script</button></div>{project && <button className="related-project" onClick={() => navigate(`/projects/${project.id}`)}><Link2 size={13} /> {project.name}</button>}</article>; })}{!filtered.length && <EmptyState icon={Code2} title="No scripts found" description="Try another category or add a reusable snippet." action={<button className="secondary-button" onClick={() => openDrawer("script")}><Plus size={15} /> Add script</button>} />}</div></section>;
}
function RateField({ rate, setRate }: { rate: number; setRate: (val: number) => void }) {
  const [text, setText] = useState<string>(() => String(rate));
  const isFormula = text.startsWith("=") || /[+\-*/()]/.test(text);

  useEffect(() => {
    if (!isFormula && Number(text) !== rate) {
      setText(String(rate));
    }
  }, [rate, isFormula, text]);

  const commit = () => {
    const res = evaluateExpression(text);
    setText(String(res));
    setRate(res);
    if (isFormula) toast.success(`Exchange rate: calculated ${res}`);
  };

  return (
    <label className="rate-input">
      Exchange rate
      <div className="rate-control">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
          placeholder="280"
        />
        <span>PKR / USD</span>
      </div>
    </label>
  );
}

function MoneyField({
  label,
  value,
  setValue,
  prefix = "$",
}: {
  label: string;
  value: number;
  setValue: (value: number) => void;
  prefix?: string;
}) {
  const [text, setText] = useState<string>(() => String(value || 0));
  const isFormula = text.startsWith("=") || /[+\-*/()]/.test(text);

  useEffect(() => {
    if (!isFormula && Number(text) !== value) {
      setText(String(value ?? 0));
    }
  }, [value, isFormula, text]);

  const commit = () => {
    const evaluated = evaluateExpression(text);
    setText(String(evaluated));
    setValue(evaluated);
    if (isFormula) {
      toast.success(`${label}: calculated ${evaluated}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  };

  let preview: number | null = null;
  if (isFormula) {
    const res = evaluateExpression(text);
    if (Number.isFinite(res)) preview = res;
  }

  return (
    <label>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{label}</span>
        {preview !== null && isFormula && (
          <span className="formula-live-pill">↵ = {prefix}{preview}</span>
        )}
      </div>
      <div className="money-input">
        <span>{prefix}</span>
        <input
          type="text"
          inputMode="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
          placeholder="e.g. =(40-(40*0.2))"
        />
      </div>
    </label>
  );
}

function CalculatorTab() {
  const [direction, setDirection] = useState<"usd" | "pkr">("usd");
  const [amount, setAmount] = useState(500);
  const [rate, setRate] = useState(280);
  const [clientAmount, setClientAmount] = useState(1500);
  const [outsourceCost, setOutsourceCost] = useState(600);
  const [otherCosts, setOtherCosts] = useState(100);

  // Dedicated Amounts Expression Solver
  const [formulaInput, setFormulaInput] = useState("=(40-(40*0.2))");
  const [formulaResult, setFormulaResult] = useState<number>(32);

  const converted = direction === "usd" ? amount * rate : amount / rate;
  const profit = clientAmount - outsourceCost - otherCosts;
  const margin = clientAmount ? (profit / clientAmount) * 100 : 0;

  const solveFormula = (inputToSolve?: string) => {
    const target = inputToSolve ?? formulaInput;
    const res = evaluateExpression(target);
    setFormulaResult(res);
    toast.success(`Calculated answer: ${res}`);
    return res;
  };

  const handleFormulaKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      solveFormula();
    }
  };

  const applyFormulaPreset = (preset: string) => {
    setFormulaInput(preset);
    solveFormula(preset);
  };

  return (
    <section className="calculator-layout">
      <div className="calculator-intro">
        <div className="eyebrow">Quick math & formulas</div>
        <h2>Make the next number obvious.</h2>
        <p>Type arithmetic expressions like <code>=(40-(40*0.2))</code> into any amount field and press Enter to solve instantly.</p>
        <div className="rate-chip">
          <TrendingUp size={15} />
          <span>1 USD =</span>
          <strong>{number(rate)} PKR</strong>
          <span className="live-dot" />
          <small>Manual rate</small>
        </div>
      </div>

      <div className="calculator-panel conversion-panel">
        <div className="calc-panel-heading">
          <div>
            <div className="section-kicker">Currency conversion</div>
            <h3>{direction === "usd" ? "USD to PKR" : "PKR to USD"}</h3>
          </div>
          <button className="swap-button" onClick={() => setDirection((current) => (current === "usd" ? "pkr" : "usd"))}>
            <ArrowLeft size={14} /> Swap <ArrowRight size={14} />
          </button>
        </div>
        <div className="calc-input-row">
          <MoneyField
            label={direction === "usd" ? "USD" : "PKR"}
            value={amount}
            setValue={setAmount}
            prefix={direction === "usd" ? "$" : "₨"}
          />
          <div className="conversion-arrow">
            <ArrowRight size={17} />
          </div>
          <label>
            {direction === "usd" ? "PKR" : "USD"}
            <div className="result-box">
              <span>{direction === "usd" ? "₨" : "$"}</span>
              <strong>{number(converted)}</strong>
            </div>
          </label>
        </div>
        <RateField rate={rate} setRate={setRate} />
        <div className="calculation-result">
          <span>Current result</span>
          <strong>{direction === "usd" ? `${number(converted)} PKR` : `${number(converted)} USD`}</strong>
        </div>
      </div>

      <div className="formula-panel">
        <div className="calc-panel-heading">
          <div>
            <div className="section-kicker">Amounts Tab Expression Solver</div>
            <h3>Amounts & Formula Solver</h3>
          </div>
          <div className="profit-badge">
            <Calculator size={14} /> Press Enter to Solve
          </div>
        </div>
        <p style={{ color: "var(--muted)", fontSize: "12px", margin: "6px 0 0" }}>
          Type any formula (e.g. <code>=(40-(40*0.2))</code>, <code>=1500*0.8-100</code>, <code>=43*280</code>) and press <kbd style={{ padding: "2px 5px", background: "#f0f2f5", borderRadius: "4px", fontSize: "10px" }}>Enter</kbd> to get the answer.
        </p>

        <div className="formula-input-row">
          <div className="formula-input-wrap">
            <input
              type="text"
              value={formulaInput}
              onChange={(e) => setFormulaInput(e.target.value)}
              onKeyDown={handleFormulaKeyDown}
              placeholder="e.g. =(40-(40*0.2))"
            />
          </div>
          <button className="formula-solve-btn" onClick={() => solveFormula()}>
            <Calculator size={15} /> Calculate <kbd style={{ opacity: 0.8, fontSize: "10px" }}>↵</kbd>
          </button>
        </div>

        <div className="formula-result-display">
          <div className="formula-result-main">
            <span>Result:</span>
            <strong>{formulaResult}</strong>
            <small style={{ color: "var(--muted)", fontSize: "11px" }}>({usdMoney(formulaResult)} or {money(formulaResult * rate)})</small>
          </div>
          <div className="formula-actions">
            <button
              className="formula-action-btn"
              onClick={() => {
                navigator.clipboard?.writeText(String(formulaResult));
                toast.success("Result copied to clipboard");
              }}
            >
              <Copy size={13} /> Copy
            </button>
            <button
              className="formula-action-btn"
              onClick={() => {
                setClientAmount(formulaResult);
                toast.success(`Set Client Amount to ${formulaResult}`);
              }}
            >
              Set as Client Amount
            </button>
            <button
              className="formula-action-btn"
              onClick={() => {
                setAmount(formulaResult);
                toast.success(`Set Conversion Amount to ${formulaResult}`);
              }}
            >
              Set in Converter
            </button>
          </div>
        </div>

        <div className="formula-presets">
          <span className="formula-preset-label">Quick presets:</span>
          {["=(40-(40*0.2))", "=(1500*0.75)-100", "=(43*278)", "=(2500/3)"].map((expr) => (
            <button key={expr} className="formula-chip" onClick={() => applyFormulaPreset(expr)}>
              {expr}
            </button>
          ))}
        </div>
      </div>

      <div className="calculator-panel profit-panel">
        <div className="calc-panel-heading">
          <div>
            <div className="section-kicker">Project profitability</div>
            <h3>Will this project work?</h3>
          </div>
          <div className="profit-badge">
            <BarChart3 size={15} /> Estimate
          </div>
        </div>
        <div className="profit-inputs">
          <MoneyField label="Client amount" value={clientAmount} setValue={setClientAmount} prefix="$" />
          <MoneyField label="Outsourcing" value={outsourceCost} setValue={setOutsourceCost} prefix="$" />
          <MoneyField label="Other costs" value={otherCosts} setValue={setOtherCosts} prefix="$" />
        </div>
        <div className="profit-result">
          <div className="profit-result-main">
            <span>Estimated profit</span>
            <strong>{usdMoney(profit)}</strong>
            <small>{number(profit * rate)} PKR equivalent</small>
          </div>
          <div className="profit-stats">
            <div>
              <span>Total revenue</span>
              <strong>{usdMoney(clientAmount)}</strong>
            </div>
            <div>
              <span>Total costs</span>
              <strong>{usdMoney(outsourceCost + otherCosts)}</strong>
            </div>
            <div>
              <span>Profit margin</span>
              <strong className={margin >= 40 ? "success-text" : margin >= 20 ? "warning-text" : "danger-text"}>
                {margin.toFixed(1)}%
              </strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Drawer({ kind, context, store, setStore, close }: { kind: DrawerKind; context?: Project; store: Store; setStore: Dispatch<SetStateAction<Store>>; close: () => void }) {
  const [projectName, setProjectName] = useState(""); const [client, setClient] = useState(""); const [contact, setContact] = useState(""); const [description, setDescription] = useState(""); const [amount, setAmount] = useState(""); const [deadline, setDeadline] = useState(daysFromToday(14)); const [priority, setPriority] = useState<Priority>("Medium"); const [provider, setProvider] = useState(""); const [providerContact, setProviderContact] = useState(""); const [cost, setCost] = useState(""); const [payment, setPayment] = useState(""); const [skipPayment, setSkipPayment] = useState(false); const [selectedProject, setSelectedProject] = useState(context?.id || store.projects[0]?.id || ""); const [service, setService] = useState(""); const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [url, setUrl] = useState(""); const [scriptName, setScriptName] = useState(""); const [category, setCategory] = useState("Linux"); const [scriptCode, setScriptCode] = useState(""); const selected = store.projects.find(item => item.id === selectedProject); const titles: Record<DrawerKind, string> = { project: "Add a project", outsource: "Add outsourced work", receivable: "Add receivable", credential: "Save a credential", script: "Add a script", payment: "Record a payment" };
  const save = () => { const amountValue = evaluateExpression(amount); const costValue = evaluateExpression(cost); const paymentValue = evaluateExpression(payment); if (kind === "project") { if (!projectName.trim() || !client.trim()) return toast.error("Add a project name and client first."); setStore(current => ({ ...current, projects: [{ id: uid(), name: projectName, client, contact, description: description || "A new project ready to move forward.", start: today(), deadline, status: "New", priority, amount: amountValue, received: 0, outsourced: false, notes: "", tasks: [{ id: uid(), label: "Define next step", done: false }] }, ...current.projects] })); toast.success("Project added"); }
    if (kind === "outsource") { if (!selectedProject || !provider.trim()) return toast.error("Select a project and add a delivery partner."); const effectivePayment = skipPayment ? 0 : paymentValue; const isPaid = costValue > 0 && effectivePayment >= costValue; setStore(current => ({ ...current, outsources: [{ id: uid(), projectId: selectedProject, provider, contact: providerContact, description: description || "Outsourced project work.", cost: costValue, paid: effectivePayment, status: isPaid ? "Completed" : "Assigned", paidAt: isPaid ? today() : undefined, notes: skipPayment ? "Payment deferred until completion." : "" }, ...current.outsources], projects: current.projects.map(item => item.id === selectedProject ? { ...item, outsourced: true, outsourcedTo: provider } : item) })); toast.success(skipPayment ? "Outsourced work added (payment skipped for now)" : "Outsourced work linked to project"); }
    if (kind === "receivable") { if (!selectedProject) return toast.error("Select a project first."); if (store.receivables.some(item => item.projectId === selectedProject)) return toast.error("This project already has a receivable."); setStore(current => ({ ...current, receivables: [{ id: uid(), projectId: selectedProject, received: 0, dueDate: deadline, status: "Unpaid", notes: "" }, ...current.receivables] })); toast.success("Receivable linked to project"); }
    if (kind === "payment") { const receivable = store.receivables.find(item => item.projectId === selectedProject); if (!selectedProject || paymentValue <= 0) return toast.error("Enter a payment amount first."); setStore(current => ({ ...current, projects: current.projects.map(item => item.id === selectedProject ? { ...item, received: Math.min(item.amount, item.received + paymentValue) } : item), receivables: receivable ? current.receivables.map(item => item.id === receivable.id ? { ...item, received: Math.min((selected?.amount || 0), item.received + paymentValue), status: item.received + paymentValue >= (selected?.amount || 0) ? "Paid" : "Partially Paid" } : item) : [...current.receivables, { id: uid(), projectId: selectedProject, received: paymentValue, dueDate: deadline, status: paymentValue >= (selected?.amount || 0) ? "Paid" : "Partially Paid", notes: "Created from payment recording." }] })); toast.success("Payment recorded"); }
    if (kind === "credential") { if (!service.trim() || !username.trim() || !password.trim()) return toast.error("Service, username, and password are required."); setStore(current => ({ ...current, credentials: [{ id: uid(), service, projectId: selectedProject, username, password, url, notes: "" }, ...current.credentials] })); toast.success("Credential saved securely"); }
    if (kind === "script") { if (!scriptName.trim() || !scriptCode.trim()) return toast.error("Add a name and the script content."); setStore(current => ({ ...current, scripts: [{ id: uid(), name: scriptName, category, description: description || "Reusable technical snippet.", code: scriptCode, tags: [category.toLowerCase()], projectId: selectedProject, notes: "" }, ...current.scripts] })); toast.success("Script added to library"); }
    close(); };
  return <div className="drawer-layer"><button className="drawer-scrim" onClick={close} aria-label="Close form" /><aside className="drawer"><div className="drawer-header"><div><div className="eyebrow">Quick add</div><h2>{titles[kind]}</h2><p>{kind === "outsource" || kind === "receivable" || kind === "payment" ? "Project context is carried forward automatically." : "Keep this record focused and easy to revisit."}</p></div><button className="icon-button" onClick={close}><X size={18} /></button></div><div className="drawer-body">
    {kind === "project" && <><Field label="Project name" value={projectName} onChange={setProjectName} placeholder="e.g. Atlas Commerce" required /><Field label="Client name" value={client} onChange={setClient} placeholder="e.g. Northstar Labs" required /><Field label="Client contact" value={contact} onChange={setContact} placeholder="Name · email" /><Field label="Description" value={description} onChange={setDescription} placeholder="What needs to move forward?" textarea /><div className="form-row"><Field label="Project amount (PKR)" value={amount} onChange={setAmount} prefix="₨" type="number" /><SelectField label="Priority" value={priority} onChange={value => setPriority(value as Priority)} options={["Low", "Medium", "High", "Urgent"]} /></div><Field label="Deadline" value={deadline} onChange={setDeadline} type="date" /></>}
    {(kind === "outsource" || kind === "receivable" || kind === "payment") && <><SelectField label="Project" value={selectedProject} onChange={setSelectedProject} options={store.projects.map(item => item.id)} labels={Object.fromEntries(store.projects.map(item => [item.id, `${item.name} · ${item.client}`]))} /><div className="context-preview"><div className="project-logo">{selected?.name.slice(0, 1)}</div><div><strong>{selected?.name || "Select a project"}</strong><span>{selected?.client || "Project context will appear here"}</span></div><Link2 size={14} /></div></>}
    {kind === "outsource" && <><Field label="Outsourced person / company" value={provider} onChange={setProvider} placeholder="e.g. John Malik" required /><Field label="Contact" value={providerContact} onChange={setProviderContact} placeholder="Email or phone" /><Field label="Work description" value={description} onChange={setDescription} placeholder="What are they taking on?" textarea /><Field label="Outsourcing cost (PKR)" value={cost} onChange={setCost} prefix="₨" type="number" required /><div className="skip-payment-control"><label className="skip-payment-label"><input type="checkbox" checked={skipPayment} onChange={e => { setSkipPayment(e.target.checked); if (e.target.checked) setPayment(""); }} /><div className="skip-payment-info"><strong>Skip payment for now</strong><span>Pay delivery partner later upon project completion</span></div></label></div>{!skipPayment && <Field label="Amount paid upfront (PKR)" value={payment} onChange={setPayment} prefix="₨" type="number" placeholder="0 or initial deposit" />}</>}
    {(kind === "receivable" || kind === "payment") && <><Field label={kind === "payment" ? "Payment amount (PKR)" : "Due date"} value={kind === "payment" ? payment : deadline} onChange={value => kind === "payment" ? setPayment(value) : setDeadline(value)} prefix={kind === "payment" ? "₨" : undefined} placeholder={kind === "payment" ? "e.g. =43*277" : undefined} type={kind === "payment" ? "number" : "date"} required />{kind === "receivable" && <div className="amount-preview"><span>Total linked amount</span><strong>{money(selected?.amount || 0)}</strong><small>Auto-populated from project value</small></div>}</>}
    {kind === "credential" && <><Field label="Service name" value={service} onChange={setService} placeholder="e.g. Northstar staging" required /><SelectField label="Related project" value={selectedProject} onChange={setSelectedProject} options={store.projects.map(item => item.id)} labels={Object.fromEntries(store.projects.map(item => [item.id, item.name]))} /><Field label="Username / email" value={username} onChange={setUsername} placeholder="you@example.com" required /><Field label="Password" value={password} onChange={setPassword} placeholder="Hidden after save" type="password" required /><Field label="URL" value={url} onChange={setUrl} placeholder="https://" /><Field label="Notes" value={description} onChange={setDescription} placeholder="Optional context" textarea /></>}
    {kind === "script" && <><Field label="Script name" value={scriptName} onChange={setScriptName} placeholder="e.g. Tail logs safely" required /><div className="form-row"><SelectField label="Category" value={category} onChange={setCategory} options={["Linux", "Docker", "AWS", "Python", "DevOps", "Database", "Deployment", "AI", "Automation", "n8n", "Other"]} /><SelectField label="Related project" value={selectedProject} onChange={setSelectedProject} options={["", ...store.projects.map(item => item.id)]} labels={{ "": "No project" }} /></div><Field label="Description" value={description} onChange={setDescription} placeholder="What is this useful for?" textarea /><Field label="Script / code" value={scriptCode} onChange={setScriptCode} placeholder="Paste a command or snippet" textarea code /></>}
  </div><div className="drawer-footer"><button className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" onClick={save}>{kind === "payment" ? "Record payment" : "Save record"} <ArrowRight size={15} /></button></div></aside></div>;
}
function Field({ label, value, onChange, placeholder, type = "text", prefix, textarea, required, code }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; prefix?: string; textarea?: boolean; required?: boolean; code?: boolean }) {
  if (type === "date") {
    return <CalendarPicker label={label} value={value} onChange={onChange} required={required} />;
  }

  const isNumeric = type === "number";
  const isFormula = isNumeric && (value.startsWith("=") || /[+\-*/()]/.test(value));
  let preview: number | null = null;
  if (isFormula) {
    const res = evaluateExpression(value);
    if (Number.isFinite(res)) preview = res;
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isNumeric && e.key === "Enter") {
      e.preventDefault();
      const evaluated = evaluateExpression(value);
      onChange(String(evaluated));
      if (isFormula) {
        toast.success(`${label}: calculated ${evaluated}`);
      }
    }
  };

  const handleBlur = () => {
    if (isNumeric && isFormula) {
      const evaluated = evaluateExpression(value);
      onChange(String(evaluated));
    }
  };

  return (
    <label className={`field ${code ? "code-field" : ""}`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{label}{required && <span className="required"> *</span>}</span>
        {preview !== null && isFormula && (
          <span className="formula-live-pill">↵ = {prefix || ""}{preview}</span>
        )}
      </div>
      {textarea ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={code ? 6 : 3} />
      ) : (
        <div className="input-with-prefix">
          {prefix && <span>{prefix}</span>}
          <input
            type={isNumeric ? "text" : type}
            inputMode={isNumeric ? "text" : undefined}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={placeholder}
          />
        </div>
      )}
    </label>
  );
}
function SelectField({ label, value, onChange, options, labels }: { label: string; value: string; onChange: (value: string) => void; options: string[]; labels?: Record<string, string> }) { return <label className="field">{label}<div className="select-field"><select value={value} onChange={e => onChange(e.target.value)}>{options.map(option => <option key={option} value={option}>{labels?.[option] || option}</option>)}</select><ChevronDown size={14} /></div></label>; }

function Worknest() {
  const [location, navigate] = useLocation();
  const [store, setStore] = useStore();
  const [drawer, setDrawer] = useState<{ kind: DrawerKind; context?: Project } | null>(null);
  const [completingProject, setCompletingProject] = useState<{ project: Project; outsource?: Outsource; initialMode?: "full" | "partial" | "schedule" } | null>(null);
  const activeProjectId = location.match(/^\/projects\/([^/]+)/)?.[1];
  const activeProject = store.projects.find(project => project.id === activeProjectId);
  const active = location.startsWith("/outsourced") ? "outsourced" : location.startsWith("/receivables") ? "receivables" : location.startsWith("/tools") ? "tools" : "projects";
  const openDrawer = (kind: DrawerKind, context?: Project) => kind && setDrawer({ kind, context });

  const handleOpenPayment = (
    project: Project,
    outsource?: Outsource,
    initialMode: "full" | "partial" | "schedule" = "full"
  ) => {
    const linkedOutsource = outsource || store.outsources.find(item => item.projectId === project.id);
    setCompletingProject({ project, outsource: linkedOutsource, initialMode });
  };

  const removeProject = (project: Project) => {
    if (!window.confirm(`Remove “${project.name}” and all linked outsourced work, receivables, credentials, and scripts? This cannot be undone.`)) return;
    setStore(current => ({
      ...current,
      projects: current.projects.filter(item => item.id !== project.id),
      outsources: current.outsources.filter(item => item.projectId !== project.id),
      receivables: current.receivables.filter(item => item.projectId !== project.id),
      credentials: current.credentials.filter(item => item.projectId !== project.id),
      scripts: current.scripts.filter(item => item.projectId !== project.id),
    }));
    setDrawer(null);
    toast.success(`${project.name} and linked records removed`);
    navigate("/");
  };

  const handleTogglePartnerPaid = (outsourceId: string) => {
    setStore(current => {
      const outsource = current.outsources.find(item => item.id === outsourceId);
      if (!outsource) return current;
      const isCurrentlyPaid = outsource.paid >= outsource.cost;
      const newPaid = isCurrentlyPaid ? 0 : outsource.cost;
      const newStatus = isCurrentlyPaid ? "In Progress" : "Completed";
      const newPaidAt = isCurrentlyPaid ? undefined : today();
      toast.success(
        isCurrentlyPaid
          ? `Payment for ${outsource.provider} marked as unpaid.`
          : `✓ Marked ${money(outsource.cost)} paid to ${outsource.provider} on ${dateLabel(today())}!`
      );
      return {
        ...current,
        outsources: current.outsources.map(item =>
          item.id === outsourceId ? { ...item, paid: newPaid, status: newStatus, paidAt: newPaidAt } : item
        ),
      };
    });
  };

  const handleCompleteProject = (project: Project) => {
    const outsource = store.outsources.find(item => item.projectId === project.id);
    const remainingCost = outsource ? outsource.cost - outsource.paid : 0;

    if (outsource && remainingCost > 0) {
      setCompletingProject({ project, outsource, initialMode: "full" });
    } else {
      setStore(current => ({
        ...current,
        projects: current.projects.map(item =>
          item.id === project.id ? { ...item, status: "Completed" } : item
        ),
        outsources: outsource
          ? current.outsources.map(item =>
              item.projectId === project.id ? { ...item, status: "Completed" } : item
            )
          : current.outsources,
      }));
      toast.success(`Project “${project.name}” marked as Completed!`);
    }
  };

  const handleReopenProject = (project: Project) => {
    setStore(current => ({
      ...current,
      projects: current.projects.map(item =>
        item.id === project.id ? { ...item, status: "In Progress" } : item
      ),
    }));
    toast.info(`Project “${project.name}” reopened.`);
  };

  const handlePayImmediately = (project: Project, outsource: Outsource, paidDate?: string, completeProject = true) => {
    const amountPaid = outsource.cost - outsource.paid;
    const completedDate = paidDate || today();
    setStore(current => ({
      ...current,
      projects: current.projects.map(p =>
        p.id === project.id ? { ...p, status: completeProject ? "Completed" : p.status } : p
      ),
      outsources: current.outsources.map(o =>
        o.id === outsource.id
          ? {
              ...o,
              paid: o.cost,
              status: "Completed",
              paidAt: completedDate,
              payments: [
                ...(o.payments || []),
                { id: uid(), amount: amountPaid, date: completedDate, note: "Full payout" },
              ],
            }
          : o
      ),
    }));
    toast.success(`Completed “${project.name}” and paid ${money(amountPaid)} to ${outsource.provider} on ${dateLabel(completedDate)}!`);
    setCompletingProject(null);
  };

  const handlePayPartial = (
    project: Project,
    outsource: Outsource,
    partialAmount: number,
    paidDate?: string,
    completeProject = false
  ) => {
    if (partialAmount <= 0) {
      toast.error("Please enter a valid payment amount.");
      return;
    }
    const completedDate = paidDate || today();
    const newPaid = Math.min(outsource.cost, outsource.paid + partialAmount);
    const remainingBalance = Math.max(0, outsource.cost - newPaid);
    const isNowFull = newPaid >= outsource.cost;

    setStore(current => ({
      ...current,
      projects: current.projects.map(p =>
        p.id === project.id ? { ...p, status: completeProject ? "Completed" : p.status } : p
      ),
      outsources: current.outsources.map(o =>
        o.id === outsource.id
          ? {
              ...o,
              paid: newPaid,
              status: isNowFull ? "Completed" : o.status,
              paidAt: completedDate,
              payments: [
                ...(o.payments || []),
                { id: uid(), amount: partialAmount, date: completedDate, note: "Partial payment" },
              ],
            }
          : o
      ),
    }));
    toast.success(
      `Recorded partial payment of ${money(partialAmount)} to ${outsource.provider} on ${dateLabel(completedDate)}! Remaining balance: ${money(remainingBalance)}.`
    );
    setCompletingProject(null);
  };

  const handleSchedulePay = (project: Project, outsource: Outsource, payDate: string, completeProject = true) => {
    setStore(current => ({
      ...current,
      projects: current.projects.map(p =>
        p.id === project.id ? { ...p, status: completeProject ? "Completed" : p.status } : p
      ),
      outsources: current.outsources.map(o =>
        o.id === outsource.id
          ? {
              ...o,
              payDate,
              notes: (o.notes ? `${o.notes} | ` : "") + `Payout scheduled for ${payDate}`,
            }
          : o
      ),
    }));
    toast.success(`Project “${project.name}” completed! Payout to ${outsource.provider} scheduled for ${dateLabel(payDate)}.`);
    setCompletingProject(null);
  };

  const handleCompleteOnly = (project: Project) => {
    setStore(current => ({
      ...current,
      projects: current.projects.map(p =>
        p.id === project.id ? { ...p, status: "Completed" } : p
      ),
    }));
    toast.success(`Project “${project.name}” marked as Completed.`);
    setCompletingProject(null);
  };

  return (
    <AppShell
      active={active}
      navigate={navigate}
      onQuickAdd={() => openDrawer("project")}
      projectCount={store.projects.length}
    >
      <Switch>
        <Route path="/projects/:id">
          {activeProject ? (
            <ProjectDetailPage
              project={activeProject}
              store={store}
              setStore={setStore}
              navigate={navigate}
              openDrawer={openDrawer}
              onRemove={removeProject}
              onComplete={handleCompleteProject}
              onReopen={handleReopenProject}
              onTogglePartnerPaid={handleTogglePartnerPaid}
              onOpenPayment={handleOpenPayment}
            />
          ) : (
            <EmptyState
              icon={BriefcaseBusiness}
              title="Project not found"
              description="This project may have moved or been removed."
              action={<button className="secondary-button" onClick={() => navigate("/")}>Back to projects</button>}
            />
          )}
        </Route>
        <Route path="/outsourced">
          <OutsourcedPage
            store={store}
            openDrawer={openDrawer}
            navigate={navigate}
            onTogglePartnerPaid={handleTogglePartnerPaid}
            onOpenPayment={handleOpenPayment}
          />
        </Route>
        <Route path="/receivables">
          <ReceivablesPage
            store={store}
            openDrawer={openDrawer}
            navigate={navigate}
          />
        </Route>
        <Route path="/tools">
          <ToolsPage
            store={store}
            setStore={setStore}
            openDrawer={openDrawer}
            navigate={navigate}
          />
        </Route>
        <Route path="/">
          <ProjectsPage
            store={store}
            navigate={navigate}
            openDrawer={openDrawer}
            onRemove={removeProject}
            onComplete={handleCompleteProject}
            onReopen={handleReopenProject}
            onTogglePartnerPaid={handleTogglePartnerPaid}
            onOpenPayment={handleOpenPayment}
          />
        </Route>
      </Switch>
      {drawer && (
        <Drawer
          kind={drawer.kind}
          context={drawer.context}
          store={store}
          setStore={setStore}
          close={() => setDrawer(null)}
        />
      )}
      {completingProject && (
        <CompleteProjectModal
          project={completingProject.project}
          outsource={completingProject.outsource}
          initialMode={completingProject.initialMode}
          onClose={() => setCompletingProject(null)}
          onPayImmediately={handlePayImmediately}
          onPayPartial={handlePayPartial}
          onSchedulePay={handleSchedulePay}
          onTogglePaid={handleTogglePartnerPaid}
          onCompleteOnly={handleCompleteOnly}
        />
      )}
    </AppShell>
  );
}
export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><Toaster position="bottom-right" /><Worknest /></ThemeProvider></ErrorBoundary>; }
