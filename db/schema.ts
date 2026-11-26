import { relations, sql } from 'drizzle-orm';
import { REACTIONS } from '../features/tasks/reaction-kinds';
import { PROJECT_STATUSES } from '../features/projects/details';
import { APPROVAL_STATUSES } from '../features/approvals/states';
import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  varchar,
  integer,
  pgEnum,
  primaryKey,
  date,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'trialing',
  'past_due',
  'canceled',
  'incomplete',
  'unpaid',
]);

// 'guest' (C1): a client who sees only the projects shared with them
// (project_guest) and can comment and react there, nothing else.
export const roleEnum = pgEnum('role', ['owner', 'admin', 'member', 'guest']);
// Values come from features/tasks/priority.tsx (none … urgent).
export const priorityEnum = pgEnum('priority', ['none', 'low', 'medium', 'high', 'urgent']);
export const projectStatusEnum = pgEnum('project_status', PROJECT_STATUSES);
export const notificationTypeEnum = pgEnum('notification_type', [
  'task_assigned',
  'workspace_invite',
  'comment_mention',
  'due_soon',
  // C3 approvals: asked of a client; answered by them.
  'approval_requested',
  'task_approved',
  'changes_requested',
]);
export const approvalStatusEnum = pgEnum('approval_status', APPROVAL_STATUSES);
export const inviteStatusEnum = pgEnum('invite_status', [
  'pending',
  'accepted',
  'revoked',
  'expired',
  'declined',
]);

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  subscription: one(subscription, {
    fields: [user.id],
    references: [subscription.userId],
  }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
export const workspace = pgTable(
  'workspace',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('workspace_userId_idx').on(table.userId)],
);

export const member = pgTable(
  'member',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: roleEnum('role').default('member').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('member_workspaceId_idx').on(table.workspaceId),
    uniqueIndex('member_workspace_user_unique').on(table.workspaceId, table.userId),
  ],
);

export const workspaceInvite = pgTable(
  'workspace_invite',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: roleEnum('role').default('member').notNull(),
    status: inviteStatusEnum('status').default('pending').notNull(),
    // SHA-256 (hex) of the raw invite token. The raw token only ever appears
    // in the invite link, never in the database. See lib/invite-token.ts.
    token: text('token').notNull(),
    invitedByUserId: text('invited_by_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Guest invites only: the projects shared on accepting. */
    projectIds: text('project_ids').array(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('workspace_invite_workspaceId_idx').on(table.workspaceId),
    uniqueIndex('workspace_invite_token_unique').on(table.token),
    // At most one pending invite per email per workspace. Emails are stored
    // lowercased; re-inviting refreshes the existing row.
    uniqueIndex('workspace_invite_pending_email_unique')
      .on(table.workspaceId, table.email)
      .where(sql`status = 'pending'`),
  ],
);

export const project = pgTable(
  'project',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    description: text('description'),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    // Project details (B7), all optional.
    clientName: varchar('client_name', { length: 100 }),
    /** A calendar day: deadlines are "due on the 1st", not a moment. */
    deadline: date('deadline', { mode: 'string' }),
    status: projectStatusEnum('status'),
    /** Archived projects leave the sidebar and My tasks but stay searchable (B6). */
    archivedAt: timestamp('archived_at'),
    /**
     * C4: the token in the project's read-only share link (/share/<token>);
     * null when sharing is off. Stored as-is so admins can copy the link
     * again: it only grants what the project's own rows already hold.
     */
    shareToken: text('share_token'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('project_workspaceId_idx').on(table.workspaceId),
    uniqueIndex('project_share_token_unique').on(table.shareToken),
  ],
);

/**
 * Which projects a guest (member.role = 'guest') can see. Team members see
 * every project in the workspace and never have rows here.
 */
export const projectGuest = pgTable(
  'project_guest',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    index('project_guest_userId_idx').on(table.userId),
  ],
);

export const taskStatus = pgTable('task_status', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 64 }).notNull(),
  order: integer('order').notNull(),
  isDefault: boolean('is_default').default(false),
  // One of STATUS_COLORS (features/projects/status-colors.ts); null = neutral.
  color: varchar('color', { length: 16 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const task = pgTable(
  'task',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    priority: priorityEnum('priority').default('medium').notNull(),
    dueDate: timestamp('due_date', { withTimezone: true }),
    // False: due on that day (shown without a time). True: due at that time.
    dueHasTime: boolean('due_has_time').default(false).notNull(),
    order: integer('order').notNull(),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    // NO ACTION (not cascade): deleting a column that still holds tasks fails,
    // so tasks can never vanish with a column; deleteStatus moves them first.
    // Unlike RESTRICT, NO ACTION is checked at the end of the statement, so
    // deleting a whole project (which cascades to both tasks and columns)
    // still works.
    statusId: text('status_id')
      .notNull()
      .references(() => taskStatus.id, { onDelete: 'no action' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').$onUpdate(() => new Date()),
  },
  (table) => [
    index('task_projectId_idx').on(table.projectId),
    index('task_statusId_idx').on(table.statusId),
    // The daily due-soon job scans by due date.
    index('task_dueDate_idx').on(table.dueDate),
  ],
);

/**
 * A file uploaded to a task: an image pasted into a description or comment,
 * or (B3, `listed`) a file attached in the task's Files section. The bytes
 * live in private storage (lib/storage.ts) and are only served through
 * /api/files/[id], which checks project access, so a file is exactly as
 * private as its task.
 */
export const attachment = pgTable(
  'attachment',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    taskId: text('task_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    uploadedById: text('uploaded_by_id').references(() => user.id, { onDelete: 'set null' }),
    /** Where the bytes are in storage; never sent to browsers. */
    storageKey: text('storage_key').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    contentType: varchar('content_type', { length: 100 }).notNull(),
    size: integer('size').notNull(),
    /** Shown in the task's Files list (B3). Pasted images live in the text instead. */
    listed: boolean('listed').default(false).notNull(),
    /**
     * A listed file the project's client (guests) can see, like a
     * client-visible comment (C2). The team's files start internal; a
     * client's own uploads are always visible.
     */
    clientVisible: boolean('client_visible').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('attachment_taskId_idx').on(table.taskId),
    index('attachment_projectId_idx').on(table.projectId),
  ],
);

/**
 * Labels belong to a workspace, so "Design" or "Client feedback" mean the
 * same across every project. Colours are column colour keys
 * (features/projects/status-colors.ts).
 */
export const label = pgTable(
  'label',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 40 }).notNull(),
    color: varchar('color', { length: 20 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    // One "Design" per workspace, whatever the capitalisation.
    uniqueIndex('label_workspace_name_unique').on(table.workspaceId, sql`lower(${table.name})`),
  ],
);

export const taskLabel = pgTable(
  'task_label',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    labelId: text('label_id')
      .notNull()
      .references(() => label.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.labelId] }),
    index('task_label_labelId_idx').on(table.labelId),
  ],
);

/**
 * A task's checklist: the steps of a deliverable, ticked off one by one.
 * `position` orders them (0, 1, 2… rewritten on reorder).
 */
export const checklistItem = pgTable(
  'checklist_item',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    taskId: text('task_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    done: boolean('done').default(false).notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('checklist_item_taskId_idx').on(table.taskId)],
);

/**
 * C3: the team asks a project's client (guests) to approve a task; a client
 * approves or requests changes. One row per round, so the history stays. At
 * most one round per task waits at a time (the partial unique index).
 */
export const taskApproval = pgTable(
  'task_approval',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    taskId: text('task_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    status: approvalStatusEnum('status').default('pending').notNull(),
    requestedById: text('requested_by_id').references(() => user.id, { onDelete: 'set null' }),
    /** What the team wants the client to look at (optional). */
    message: text('message'),
    respondedById: text('responded_by_id').references(() => user.id, { onDelete: 'set null' }),
    /** The client's note; required when they request changes. */
    responseNote: text('response_note'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    respondedAt: timestamp('responded_at'),
  },
  (table) => [
    index('task_approval_taskId_idx').on(table.taskId, table.createdAt),
    uniqueIndex('task_approval_one_pending').on(table.taskId).where(sql`${table.status} = 'pending'`),
  ],
);

export const checklistItemRelations = relations(checklistItem, ({ one }) => ({
  task: one(task, { fields: [checklistItem.taskId], references: [task.id] }),
}));

export const labelRelations = relations(label, ({ one, many }) => ({
  workspace: one(workspace, { fields: [label.workspaceId], references: [workspace.id] }),
  tasks: many(taskLabel),
}));

export const taskLabelRelations = relations(taskLabel, ({ one }) => ({
  task: one(task, { fields: [taskLabel.taskId], references: [task.id] }),
  label: one(label, { fields: [taskLabel.labelId], references: [label.id] }),
}));

export const taskAssignee = pgTable(
  'task_assignee',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // The due date this assignee was last reminded about (P3.3). The daily
    // job reminds again only if the task's due date has changed since.
    dueSoonNotifiedFor: timestamp('due_soon_notified_for', { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.taskId, table.userId] }),
  }),
);

export const workspaceRelations = relations(workspace, ({ one, many }) => ({
  members: many(member),
  invites: many(workspaceInvite),
  projects: many(project),
  owner: one(user, { fields: [workspace.userId], references: [user.id] }),
}));

export const memberRelations = relations(member, ({ one }) => ({
  workspace: one(workspace, {
    fields: [member.workspaceId],
    references: [workspace.id],
  }),
  user: one(user, { fields: [member.userId], references: [user.id] }),
}));

export const workspaceInviteRelations = relations(workspaceInvite, ({ one }) => ({
  workspace: one(workspace, {
    fields: [workspaceInvite.workspaceId],
    references: [workspace.id],
  }),
  invitedBy: one(user, {
    fields: [workspaceInvite.invitedByUserId],
    references: [user.id],
  }),
}));

export const projectRelations = relations(project, ({ one, many }) => ({
  workspace: one(workspace, {
    fields: [project.workspaceId],
    references: [workspace.id],
  }),
  statuses: many(taskStatus),
  tasks: many(task),
}));

export const taskStatusRelations = relations(taskStatus, ({ one, many }) => ({
  project: one(project, {
    fields: [taskStatus.projectId],
    references: [project.id],
  }),
  tasks: many(task),
}));

export const taskRelations = relations(task, ({ one, many }) => ({
  project: one(project, { fields: [task.projectId], references: [project.id] }),
  status: one(taskStatus, {
    fields: [task.statusId],
    references: [taskStatus.id],
  }),
  assignees: many(taskAssignee),
  comments: many(comment),
  labels: many(taskLabel),
  checklist: many(checklistItem),
}));

export const taskAssigneeRelations = relations(taskAssignee, ({ one }) => ({
  task: one(task, { fields: [taskAssignee.taskId], references: [task.id] }),
  user: one(user, { fields: [taskAssignee.userId], references: [user.id] }),
}));

export const comment = pgTable(
  'comment',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    taskId: text('task_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    /**
     * Whether the project's guests (clients) can see it. Team comments are
     * internal unless posted to the client deliberately; a guest's own
     * comments are always visible to the client side.
     */
    clientVisible: boolean('client_visible').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').$onUpdate(() => new Date()),
  },
  (table) => [index('comment_taskId_idx').on(table.taskId)],
);

export const commentRelations = relations(comment, ({ one }) => ({
  task: one(task, { fields: [comment.taskId], references: [task.id] }),
  author: one(user, { fields: [comment.authorId], references: [user.id] }),
}));

// The reactions people can leave on a comment: features/tasks/reaction-kinds.ts.
export const reactionEnum = pgEnum('reaction', REACTIONS);

/** One row per person, comment and reaction: reacting again removes it. */
export const commentReaction = pgTable(
  'comment_reaction',
  {
    commentId: text('comment_id')
      .notNull()
      .references(() => comment.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    reaction: reactionEnum('reaction').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.commentId, table.userId, table.reaction] }),
    index('comment_reaction_commentId_idx').on(table.commentId),
  ],
);

/** Projects a person pinned to the top of their sidebar. */
export const projectFavorite = pgTable(
  'project_favorite',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.projectId] })],
);

/**
 * B5: a project saved as a template, for starting new client jobs. `data`
 * is a snapshot (features/templates/shape.ts), validated on write and on
 * read, so later edits to the source project don't change the template.
 */
export const projectTemplate = pgTable(
  'project_template',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    description: varchar('description', { length: 500 }),
    taskCount: integer('task_count').notNull(),
    data: jsonb('data').notNull(),
    createdById: text('created_by_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('project_template_workspaceId_idx').on(table.workspaceId)],
);

export const activityLog = pgTable(
  'activity_log',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => project.id, {
      onDelete: 'set null',
    }),
    taskId: text('task_id').references(() => task.id, { onDelete: 'set null' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    metadata: jsonb('metadata').$type<Record<string, string>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('activity_log_workspaceId_idx').on(table.workspaceId),
    index('activity_log_taskId_idx').on(table.taskId),
  ],
);

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  workspace: one(workspace, {
    fields: [activityLog.workspaceId],
    references: [workspace.id],
  }),
  actor: one(user, { fields: [activityLog.actorId], references: [user.id] }),
  project: one(project, {
    fields: [activityLog.projectId],
    references: [project.id],
  }),
  task: one(task, { fields: [activityLog.taskId], references: [task.id] }),
}));

export const notification = pgTable(
  'notification',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    read: boolean('read').default(false).notNull(),
    actorName: text('actor_name'),
    taskTitle: text('task_title'),
    workspaceName: text('workspace_name'),
    dueLabel: text('due_label'),
    // What the notification is about, so it can link there. Cascades: a
    // notification about a deleted task, project or workspace goes with it,
    // so no notification ever links to something that's gone.
    workspaceId: text('workspace_id').references(() => workspace.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => project.id, { onDelete: 'cascade' }),
    taskId: text('task_id').references(() => task.id, { onDelete: 'cascade' }),
    // App-relative path built on the server from the IDs above (never user
    // input, never a raw invite token). Null for older rows.
    href: text('href'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    // Covers "my notifications, newest first" and cursor pagination.
    index('notification_userId_createdAt_idx').on(table.userId, table.createdAt.desc()),
  ],
);

/**
 * Per-user email choices (P3.4). No row means the defaults: emails for
 * assignments and mentions on, daily digest off. In-app notifications are
 * always on; these only control email, which also requires a verified address.
 */
export const userPreferences = pgTable('user_preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  emailOnAssign: boolean('email_on_assign').default(true).notNull(),
  emailOnMention: boolean('email_on_mention').default(true).notNull(),
  emailDigest: boolean('email_digest').default(false).notNull(),
  // When the last digest went out; notifications after this go in the next one.
  digestLastSentAt: timestamp('digest_last_sent_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const notificationRelations = relations(notification, ({ one }) => ({
  user: one(user, { fields: [notification.userId], references: [user.id] }),
}));

export const subscription = pgTable(
  'subscription',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    stripeCustomerId: text('stripe_customer_id').notNull().unique(),
    stripeSubscriptionId: text('stripe_subscription_id').unique(),
    stripePriceId: text('stripe_price_id'),
    stripeCurrentPeriodEnd: timestamp('stripe_current_period_end'),
    status: subscriptionStatusEnum('status'),
    plan: text('plan').notNull().default('free'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('subscription_userId_idx').on(table.userId)],
);

export const subscriptionRelations = relations(subscription, ({ one }) => ({
  user: one(user, { fields: [subscription.userId], references: [user.id] }),
}));

export const signalTypeEnum = pgEnum('signal_type', ['offer', 'answer', 'ice-candidate']);

export const callParticipant = pgTable(
  'call_participant',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
    lastSeen: timestamp('last_seen').defaultNow().notNull(),
  },
  (table) => [
    index('call_participant_projectId_idx').on(table.projectId),
  ],
);

export const callParticipantRelations = relations(callParticipant, ({ one }) => ({
  project: one(project, { fields: [callParticipant.projectId], references: [project.id] }),
  user: one(user, { fields: [callParticipant.userId], references: [user.id] }),
}));

export const webrtcSignal = pgTable(
  'webrtc_signal',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text('project_id').notNull(),
    fromUserId: text('from_user_id').notNull(),
    toUserId: text('to_user_id').notNull(),
    type: signalTypeEnum('type').notNull(),
    payload: text('payload').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('webrtc_signal_toUserId_idx').on(table.toUserId),
    index('webrtc_signal_projectId_idx').on(table.projectId),
  ],
);
