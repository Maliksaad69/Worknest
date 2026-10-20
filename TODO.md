# Worknest implementation checklist

## Projects — list, detail, and linked records

- Projects is the default landing page and the application has exactly four primary sections: Projects, Outsourced, Receivables, and Tools; there is no separate Dashboard section.
- The Projects page includes a small overview at the top showing Active Projects, Outsourced, Outstanding, and Due Soon.
- Each project supports project name, client name, client contact, description, start date, deadline, status, priority, total project amount, amount received, remaining amount, outsourced/not outsourced, notes, and attachments.
- Project status options are New, In Progress, Waiting, Completed, and Cancelled.
- The Project List shows Project, Client, Status, Deadline, Amount, Payment, and Assignment, and includes search, filters, sorting, and quick actions.
- Clicking a project opens its detail page, which shows overview, client, description, status, priority, dates, financial information, tasks, notes, attachments, and outsourcing.
- From project detail, Outsource Project creates an outsourced record automatically linked to that project without requiring project/client information to be entered again.

## Outsourced — linked assignments

- Outsourced work is directly linked to a Project.
- When creating an outsourced assignment, selecting a Project automatically populates client and project information.
- Outsourced records support outsourced person/company, contact, work description, outsourcing cost, amount paid, remaining payable, deadline, status, notes, and attachments.
- Outsourced status options are Not Started, Assigned, In Progress, Submitted, Revision Required, Completed, and Cancelled.
- The Outsourced list shows Project, Client, Outsourced To, Status, Deadline, Cost, and Payment.
- Clicking the project name in Outsourced opens the original project, and the project shows that it has been outsourced.

## Receivables — linked client payments

- Receivables are linked to Projects and support Project, Client, Total amount, Amount received, Remaining amount, Due date, Status, and Notes.
- Receivable status options are Unpaid, Partially Paid, Paid, and Overdue.
- The Receivables page shows Total Receivable, Received, Outstanding, and Overdue at the top.
- Creating a receivable from a project automatically populates project, client, and project amount.
- A user can quickly record a payment and the remaining amount/status update.

## Tools — credentials, scripts, calculator

- Tools contains exactly three tabs: Credentials, Scripts, and Cost Calculator.
- Credentials support service name, related project, username/email, password, URL, and notes; passwords are hidden by default and actions include show/hide, copy, edit, and delete.
- Scripts support script name, category, description, script/code, tags, related project, and notes; scripts can be searched and filtered by category, shown in a clean monospace code block, and copied.
- Script categories include Linux, Docker, AWS, Python, DevOps, Database, Deployment, AI, Automation, n8n, and Other.
- Cost Calculator supports USD → PKR and PKR → USD, amount input, editable exchange rate, instant updates, and a swap button.
- Cost Calculator includes a project profit calculator for client/project amount, outsourcing cost, and other costs, automatically showing Total Revenue, Total Costs, Estimated Profit, Profit Margin, and PKR equivalent using the current exchange rate.

## Shared UX and visual system

- Use a minimal white SaaS design with white background, light gray borders, dark text, muted secondary text, one professional accent color, subtle shadows, small rounded corners, clean typography, whitespace, and simple icons.
- Do not use gradients, glassmorphism, unnecessary animations, or excessive charts.
- Optimize for speed with Quick Add buttons, search, filters, slide-over forms, inline editing where appropriate, toast notifications, confirmation before deletion, clear empty states, loading states, form validation, and keyboard-friendly inputs.
- Preserve relationships without duplicating information: Project → optional Outsourced Work, Project → Receivable, Project → Credentials, and Project → Scripts.
- Keep the workflow simple: Receive Project → Add Project → Manage Project → Optionally Outsource → Track Client Payment → Calculate Costs/Profit.

## Validation and delivery

- Serve `/manus-routes.json` with the implemented page routes and keep it synchronized with source.
- Keep `/api/health` available and honor the configured runtime port.
- Register host-managed TypeScript diagnostics before code editing and resolve actionable diagnostics.
- Run the project checks and build, then save the intended project version to the canonical remote and report the current Preview unless publication is explicitly confirmed.
