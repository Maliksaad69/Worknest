/**
 * Unified type exports for Worknest.
 * Provides canonical domain models, Drizzle schema row types, and shared error definitions.
 */

export type * from "../drizzle/schema";
export * from "./_core/errors";

export type ProjectStatus = "New" | "In Progress" | "Waiting" | "Completed" | "Cancelled";
export type Priority = "Low" | "Medium" | "High" | "Urgent";
export type OutsourceStatus =
  | "Not Started"
  | "Assigned"
  | "In Progress"
  | "Submitted"
  | "Revision Required"
  | "Completed"
  | "Cancelled";
export type ReceivableStatus = "Unpaid" | "Partially Paid" | "Paid" | "Overdue";
export type ToolTab = "credentials" | "scripts" | "calculator" | "amounts";
export type DrawerKind = "project" | "outsource" | "receivable" | "credential" | "script" | "payment";

export type Task = {
  id: string;
  label: string;
  done: boolean;
  position?: number;
};

export type Project = {
  id: string;
  name: string;
  client: string;
  contact: string;
  description: string;
  start: string;
  deadline: string;
  status: ProjectStatus;
  priority: Priority;
  amount: number;
  received: number;
  outsourced: boolean;
  outsourcedTo?: string;
  notes: string;
  tasks: Task[];
};

export type OutsourcePayment = {
  id: string;
  amount: number;
  date: string;
  note?: string;
};

export type Outsource = {
  id: string;
  projectId: string;
  provider: string;
  contact: string;
  description: string;
  cost: number;
  paid: number;
  deadline?: string;
  status: OutsourceStatus;
  notes: string;
  payDate?: string;
  paidAt?: string;
  payments?: OutsourcePayment[];
};

export type Receivable = {
  id: string;
  projectId: string;
  received: number;
  dueDate: string;
  status: ReceivableStatus;
  notes: string;
};

export type Credential = {
  id: string;
  service: string;
  projectId: string;
  username: string;
  password: string;
  url: string;
  notes: string;
};

export type Script = {
  id: string;
  name: string;
  category: string;
  description: string;
  code: string;
  tags: string[];
  projectId: string;
  notes: string;
};

export type Store = {
  projects: Project[];
  outsources: Outsource[];
  receivables: Receivable[];
  credentials: Credential[];
  scripts: Script[];
};
