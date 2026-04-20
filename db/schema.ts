import { relations } from 'drizzle-orm';
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
  jsonb,
} from 'drizzle-orm/pg-core';

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'trialing',
  'past_due',
  'canceled',
  'incomplete',
  'unpaid',
]);

export const roleEnum = pgEnum('role', ['owner', 'admin', 'member']);
export const priorityEnum = pgEnum('priority', ['low', 'medium', 'high']);
export const notificationTypeEnum = pgEnum('notification_type', [
  'task_assigned',
  'workspace_invite',
  'comment_mention',
  'due_soon',
]);
export const inviteStatusEnum = pgEnum('invite_status', [
  'pending',
  'accepted',
  'revoked',
  'expired',
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
  (table) => [index('member_workspaceId_idx').on(table.workspaceId)],
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
    token: text('token').notNull(),
    invitedByUserId: text('invited_by_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('workspace_invite_workspaceId_idx').on(table.workspaceId)],
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
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('project_workspaceId_idx').on(table.workspaceId)],
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
    order: integer('order').notNull(),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    statusId: text('status_id')
      .notNull()
      .references(() => taskStatus.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').$onUpdate(() => new Date()),
  },
  (table) => [
    index('task_projectId_idx').on(table.projectId),
    index('task_statusId_idx').on(table.statusId),
  ],
);

export const taskAssignee = pgTable(
  'task_assignee',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
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
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').$onUpdate(() => new Date()),
  },
  (table) => [index('comment_taskId_idx').on(table.taskId)],
);

export const commentRelations = relations(comment, ({ one }) => ({
  task: one(task, { fields: [comment.taskId], references: [task.id] }),
  author: one(user, { fields: [comment.authorId], references: [user.id] }),
}));

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
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('notification_userId_idx').on(table.userId)],
);

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
