# Tide product plan: a tool small studios will pay for

[PRODUCTION_PLAN.md](PRODUCTION_PLAN.md) made Tide safe and reliable. This plan makes it worth buying.

## Who it's for

**Small agencies and studios: about 2–15 people running several client projects at once.** Design, development, content and marketing studios.

What they need from a tool like this:

1. **Run many client projects side by side** without losing track of what's due where.
2. **Keep clients in the loop** without inviting them into everything or living in email.
3. **Hand work over:** files, feedback and approvals attached to the task they belong to.
4. **See who's overloaded and what's late** across the studio, not one project at a time.
5. **Start new jobs fast:** most projects look like the last one.
6. **Feel fast.** A studio lives in this tool all day; every pause is noticed.

What Tide has today: workspaces with roles, kanban/list/table boards with custom columns, tasks (assignees, one priority, one due date, description, comments with mentions), live updates, calls, notifications and email digests, search, activity log, billing. Its only paid difference is the number of workspaces you own.

What's missing for this audience: client access, files, labels, subtasks, start dates and a calendar, templates, a cross-project overview, and a reason to upgrade.

## Principles

- **Speed is a feature.** Every change keeps the app instant: no server round trip where the data is already on the page, optimistic updates for edits, and the database next to the servers.
- **Client-safe by default.** Anything a client can see is opt-in per project; internal comments never leak.
- **Build first, price later.** Which plan includes a feature is decided in one place (`lib/plans.ts`), so features can ship before pricing is settled.
- **Each item ships with tests** (unit + E2E), like the production plan.

Sizes: **S** ≈ a day, **M** ≈ 2–4 days, **L** ≈ a week or more.

---

## Phase A: Feel fast and finished

| # | Item | Why | Size | Status |
|---|---|---|---|---|
| A1 | Functions in Singapore, next to the database | Every query crossed the Pacific (~220 ms each, ~1.2 s per page). Now ~13 ms. | S | Done (#68) |
| A2 | Instant Board / List / Table switch | Switching re-ran the whole page on the server. | S | Done (#67) |
| A3 | Navigation feedback | A thin progress bar and pressed states on sidebar links, so a click always shows something within 100 ms. | S | Done (#71) |
| A4 | Optimistic edits everywhere | Audit every action (title, priority, due date, assignees, status, comments): the screen updates first, and rolls back with a message if the save fails. | M | Done (#72) |
| A5 | Keyboard shortcuts | `C` new task, `/` filter, `⌘K` actions (not just search: "New project", "Assign to me", "Go to My tasks"), `?` shortcut list. Studios that live in the tool expect this. | M | Done (#73) |
| A6 | Rich-text descriptions and comments | Headings, lists, links, checkboxes and pasted screenshots, instead of plain text. Briefs and feedback are long. | M | Done (#75) |
| A7 | Upstash region | Make sure rate-limit Redis is also in Singapore (sign-in requests). | S | Done: already in Singapore |

## Phase A+: Improve what's already there

Gaps inside existing features, checked against the code (none of these exist today). Most are small, and they're what someone trying the app notices first.

| # | Feature | Improvement | Why | Size | Status |
|---|---|---|---|---|---|
| I1 | Tasks | **Copy link** to a task | Deep links exist (`?task=`), but there's no button to share one; studios paste task links into chat all day. | S | Done (#78) |
| I2 | Tasks | **Duplicate task**, and **move to another project** | Repeating deliverables, and tasks created in the wrong project, currently mean retyping. | M |  |
| I3 | Tasks | **Priority "Urgent" and "None"**, and an optional **due time** | Three levels (low/medium/high, default medium) can't mark "drop everything"; client deadlines are often "by 3 pm". | S | Done (#84) |
| I4 | Tasks | **Follow a task** | Today only assignees and @mentions are notified. An account manager wants updates on tasks they don't do. | M |  |
| I5 | Board | **Collapse a column** | Long "Done" columns push the work off screen. | S | Done (#79) |
| I6 | List / Table | **Group by** assignee, priority or due date | The list is grouped by column only; standups and planning want "by person". | M |  |
| I7 | Comments | **Reactions** (👍 ✅ 👀) | A quick "seen / approved" without another comment or notification. | S | Done (#84) |
| I8 | Sidebar | **Favourite projects**, and drag to reorder | With many client projects, the active few need to be at the top. | S | Done (#84) |
| I9 | My tasks | **Group by date**: overdue, today, this week, later | It's the screen people open first each morning. | S | Done (#80) |
| I10 | Activity | **Filter by project and person** | The feed is one stream for the whole workspace. | S | Done (#81) |
| I11 | Account | **Profile photo upload** | Only Google accounts have photos; email sign-ups are initials. Faces matter once clients are in. | M |  |
| I12 | Calls | **Screen sharing** | Design and site reviews are the main reason a studio would call from a project. | M |  |
| I13 | Search | **Recent items and filters** in ⌘K | Search shows nothing until you type, and can't narrow to tasks or a project. | S | Done (#82) |

## Phase B: Work the way studios work

| # | Item | Why | Size | Plan |
|---|---|---|---|---|
| B1 | **Labels** | Tag by type ("Design", "Copy", "Bug", "Client feedback"), colour-coded, filterable. A basic every comparable tool has. | M | Free. Done (#87) |
| B2 | **Subtasks / checklists** | Break a deliverable into steps; progress on the card ("3/5"). | M | Free |
| B3 | **File attachments** | Upload or paste files and images onto tasks and comments (Vercel Blob). Handover lives with the work. Storage limit per plan. | L | Free: small quota; paid: more |
| B4 | **Start dates + Calendar view** | A date range per task, and a month/week calendar across a project, with drag to reschedule. Studios plan by dates, not columns. | L | Pro |
| B5 | **Project templates** | Save a project (columns, tasks, checklists, relative due dates) as a template; start new client jobs from it. Includes a few built-in studio templates (website build, brand identity, content calendar). | M | Pro |
| B6 | **Archive projects** | Finished client jobs leave the sidebar but stay searchable. | S | Free |
| B7 | **Project details** | Client name, project deadline and status ("On track", "At risk", "Done") on each project. | S | Free |

## Phase C: Clients in the loop (the agency feature)

| # | Item | Why | Size | Plan |
|---|---|---|---|---|
| C1 | **Client guests** | A guest role scoped to chosen projects: they see those boards, comment and approve, and nothing else in the workspace. **Guests are free and unlimited:** studios won't want to pay per client login, and several tools limit or charge for guests. | L | Pro |
| C2 | **Internal vs client-visible** | Comments, and optionally tasks, are internal by default in projects with guests; posting to the client is deliberate. | M | Pro |
| C3 | **Approvals** | "Request approval" on a task: the client approves or requests changes, which is recorded in activity and notifies the team. | M | Pro |
| C4 | **Read-only share link** | A link to a project's board or timeline for clients who won't sign in. | S | Pro |
| C5 | **Client-friendly emails** | Invites and notifications that read well to someone outside the studio, with the studio's name. | S | Pro |

Security note: guest access goes through `lib/authz.ts` like everything else, with E2E proof that a guest can't reach other projects (as in `tenant-isolation.spec.ts`).

## Phase D: Running the studio

| # | Item | Why | Size | Plan |
|---|---|---|---|---|
| D1 | **Studio overview** | The workspace home becomes a dashboard: due this week and overdue across all projects, projects at risk, recent client feedback. | M | Free (basic), Pro (full) |
| D2 | **Workload** | Tasks per person across projects, by week; see who's overloaded before assigning. | M | Pro |
| D3 | **Saved filters and "My work"** | Saved views ("My overdue", "Waiting on client"), and My tasks grouped by project and date. | S | Free |
| D4 | **Import and export** | Import from Trello / CSV to switch tools in minutes; export a project to CSV. | M | Free |
| D5 | **Time tracking** (optional) | A timer on tasks and a simple report per project or client, for studios that bill hourly. Decide after talking to studios. | L | Business |

## Phase E: Ready to sell

| # | Item | Why | Size |
|---|---|---|---|
| E1 | **Choose the pricing model** | See below. Then move gates into `lib/plans.ts` and Stripe. | S |
| E2 | **Trial** | 14-day Pro trial on sign-up, no card; clear downgrade behaviour. | M |
| E3 | **Upgrade moments** | When a Free studio hits a gated feature, explain what Pro adds right there, with one click to upgrade. | S |
| E4 | **Agency positioning** | Landing and pricing pages written for studios: client guests free, templates, overview. Screenshots of the new features. | M |
| E5 | **Help and feedback** | A short help centre (getting started, inviting clients, templates) and an in-app feedback button. | M |

### Pricing options (decide before E1)

| Model | How it works | For studios |
|---|---|---|
| Per workspace (today) | Free: 1 workspace; Pro $9: 5; Business $29: unlimited | Doesn't match value: a 12-person studio pays the same as a freelancer. |
| **Per team member, guests free** *(suggested)* | Free: up to 3 members; Pro ~$8 / member / month; client guests always free | Matches how studios grow, makes free client guests a selling point, and is the model most buyers already know. |
| Flat tiers by team size | e.g. up to 5 people $25, up to 15 $59 | Simple and predictable; less fair at the tier edges. |

Whatever is chosen, the features above are built so their plan can change in one file.

---

## Suggested order

1. **Phase A** (A3–A7): the app should feel finished before adding more.
2. **Phase A+ small items** (I1, I3, I5, I7, I8, I9, I10, I13): a day or less each, and they make existing features feel complete.
3. **B1 labels, B2 subtasks, B6 archive, B7 project details**: quick, high-value basics.
4. **C1–C3 client guests and approvals**: the reason a studio picks Tide over a generic tool.
5. **B3 attachments, B5 templates, B4 calendar.**
6. **D1 overview, D2 workload, D4 import.**
7. **Phase E** once there's enough to charge for; pricing decided by then.

## Out of scope for now

Native mobile apps (the web app works on phones), invoicing, chat, Gantt dependencies, SSO, public API, white-labelling.
