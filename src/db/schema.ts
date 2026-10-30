import { pgTable, serial, text, integer, timestamp, real, boolean, jsonb, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const siteSettings = pgTable(
  "site_settings",
  {
    key: text("key").primaryKey(),
    value: jsonb("value").notNull().default(sql`'{}'::jsonb`),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("site_settings_key_idx").on(t.key)],
);

export const users = pgTable("users", {
  id: serial("id").primaryKey(), name: text("name").notNull(), email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(), role: text("role").notNull().default("student"),
  avatar: text("avatar"), avatarStorageRef: text("avatar_storage_ref"), nativeLang: text("native_lang").default("zh"), level: text("level").default("A1"),
  balance: integer("balance").notNull().default(0), suspended: boolean("suspended").notNull().default(false), suspendedUntil: timestamp("suspended_until"),
  emailVerified: boolean("email_verified").notNull().default(true), timeZone: text("time_zone").notNull().default("UTC"),
  referralCode: text("referral_code").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(), createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [index("sessions_user_idx").on(t.userId)]);
export const teacherProfiles = pgTable("teacher_profiles", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  headline: text("headline").notNull().default(""), bio: text("bio").notNull().default(""),
  country: text("country").notNull().default("US"), accent: text("accent").notNull().default("American"),
  price: integer("price").notNull().default(2500), rating: real("rating").notNull().default(5),
  reviewsCount: integer("reviews_count").notNull().default(0), lessonsCount: integer("lessons_count").notNull().default(0),
  speaks: text("speaks").notNull().default("English"), tags: text("tags").notNull().default(""),
  certified: boolean("certified").notNull().default(false), credentialVerified: boolean("credential_verified").notNull().default(false), active: boolean("active").notNull().default(true),
  timeZone: text("time_zone").notNull().default("UTC"),
  startHour: integer("start_hour").notNull().default(9), endHour: integer("end_hour").notNull().default(21),
  tzOffset: integer("tz_offset").notNull().default(8), workDays: text("work_days").notNull().default("0,1,2,3,4,5,6"),
  // A private form preference only. Never applied automatically to a booking.
  platformDefault: text("platform_default").notNull().default("lingo"),
  payoutMethod: text("payout_method").notNull().default(""), payoutAccount: text("payout_account").notNull().default(""),
}, t => [index("tp_active_rating_idx").on(t.active, t.rating)]);

// Prices are frozen at purchase; unused lessons belong to this tutor and duration.
export const lessonPackages = pgTable("lesson_packages", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => users.id),
  teacherId: integer("teacher_id").notNull().references(() => users.id),
  duration: integer("duration").notNull(), totalLessons: integer("total_lessons").notNull(),
  remainingLessons: integer("remaining_lessons").notNull(),
  unitPrice: integer("unit_price").notNull(), originalUnitPrice: integer("original_unit_price").notNull(),
  discountPercent: integer("discount_percent").notNull(), totalPrice: integer("total_price").notNull(),
  purchaseKey: text("purchase_key").notNull().unique(), createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [
  index("packages_student_tutor_idx").on(t.studentId, t.teacherId),
  check("packages_remaining_check", sql`${t.remainingLessons} >= 0 and ${t.remainingLessons} <= ${t.totalLessons}`),
  check("packages_duration_check", sql`${t.duration} in (25,50)`),
]);

export const lessons = pgTable("lessons", {
  id: serial("id").primaryKey(), studentId: integer("student_id").notNull().references(() => users.id),
  teacherId: integer("teacher_id").notNull().references(() => users.id), startAt: timestamp("start_at").notNull(),
  duration: integer("duration").notNull().default(50), status: text("status").notNull().default("pending"),
  classType: text("class_type").notNull().default("private"), capacity: integer("capacity").notNull().default(1),
  price: integer("price").notNull(), trial: boolean("trial").notNull().default(false),
  topic: text("topic").notNull().default(""), teacherNotes: text("teacher_notes").notNull().default(""),
  reviewed: boolean("reviewed").notNull().default(false),
  packageId: integer("package_id").references(() => lessonPackages.id),
  rewardCreditId: integer("reward_credit_id"),
  // Explicit decision required for every lesson, regardless of tutor preference.
  platform: text("platform").notNull().default("undecided"), meetingUrl: text("meeting_url").notNull().default(""),
  platformRevision: integer("platform_revision").notNull().default(0), platformUpdatedAt: timestamp("platform_updated_at"),
  platformIssueAt: timestamp("platform_issue_at"), platformIssueBy: integer("platform_issue_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [
  index("lessons_student_idx").on(t.studentId, t.startAt), index("lessons_teacher_idx").on(t.teacherId, t.startAt),
  index("lessons_platform_idx").on(t.platform),
  uniqueIndex("lessons_slot_unique").on(t.teacherId, t.startAt).where(sql`${t.status} <> 'cancelled'`),
  check("lessons_class_type_check", sql`${t.classType} in ('private', 'semi_private')`),
  check("lessons_capacity_check", sql`${t.capacity} between 1 and 4`),
]);
export const teacherWeeklySlots = pgTable("teacher_weekly_slots", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  weekday: integer("weekday").notNull(),
  startMinute: integer("start_minute").notNull(),
  endMinute: integer("end_minute").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [
  index("weekly_slots_teacher_idx").on(t.teacherId, t.weekday),
  check("weekly_slots_range_check", sql`${t.weekday} >= 0 and ${t.weekday} <= 6 and ${t.startMinute} >= 0 and ${t.startMinute} < ${t.endMinute} and ${t.endMinute} <= 1440`),
]);
export const teacherBlockedSlots = pgTable("teacher_blocked_slots", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  reason: text("reason").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [
  index("blocked_slots_teacher_idx").on(t.teacherId, t.startAt),
  check("blocked_slots_range_check", sql`${t.endAt} > ${t.startAt}`),
]);
export const lessonPlatformEvents = pgTable("lesson_platform_events", {
  id: serial("id").primaryKey(), lessonId: integer("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  changedBy: integer("changed_by").notNull().references(() => users.id),
  fromPlatform: text("from_platform").notNull(), toPlatform: text("to_platform").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [index("platform_events_lesson_idx").on(t.lessonId)]);
export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(), lessonId: integer("lesson_id"),
  studentId: integer("student_id").notNull().references(() => users.id), teacherId: integer("teacher_id").notNull().references(() => users.id),
  rating: integer("rating").notNull(), comment: text("comment").notNull().default(""), createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [index("reviews_teacher_idx").on(t.teacherId, t.createdAt), uniqueIndex("reviews_lesson_student_unique").on(t.lessonId, t.studentId)]);
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(), fromId: integer("from_id").notNull().references(() => users.id),
  toId: integer("to_id").notNull().references(() => users.id), body: text("body").notNull(), createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [index("messages_from_idx").on(t.fromId), index("messages_to_idx").on(t.toId)]);
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), amount: integer("amount").notNull(), lessonId: integer("lesson_id"), ref: text("ref").unique(),
  note: text("note").notNull().default(""), createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [index("tx_user_idx").on(t.userId, t.createdAt)]);
// Double-entry journal for every non-zero wallet transaction. The `platform_clearing`
// account is the balancing control account; it should reconcile to the cash/payment
// and payable accounts maintained by the business outside this app.
export const accountingEntries = pgTable("accounting_entries", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull().references(() => transactions.id, { onDelete: "restrict" }),
  userId: integer("user_id").notNull().references(() => users.id),
  accountCode: text("account_code").notNull(),
  side: text("side").notNull(),
  amount: integer("amount").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [
  index("accounting_entries_account_idx").on(t.accountCode, t.createdAt),
  index("accounting_entries_user_idx").on(t.userId, t.createdAt),
  uniqueIndex("accounting_entries_transaction_account_unique").on(t.transactionId, t.accountCode),
  check("accounting_entries_side_check", sql`${t.side} in ('debit','credit')`),
  check("accounting_entries_amount_check", sql`${t.amount} > 0`),
]);

export const payouts = pgTable("payouts", {
  id: serial("id").primaryKey(), teacherId: integer("teacher_id").notNull().references(() => users.id), amount: integer("amount").notNull(),
  method: text("method").notNull(), account: text("account").notNull(), status: text("status").notNull().default("pending"),
  note: text("note").notNull().default(""), createdAt: timestamp("created_at").defaultNow().notNull(), processedAt: timestamp("processed_at"),
  reviewedBy: integer("reviewed_by").references(() => users.id), reviewedAt: timestamp("reviewed_at"),
  providerReference: text("provider_reference").notNull().default(""),
}, t => [index("payouts_teacher_idx").on(t.teacherId), index("payouts_status_idx").on(t.status)]);
export const payoutAccountAccessLogs = pgTable("payout_account_access_logs", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => users.id),
  payoutId: integer("payout_id").notNull().references(() => payouts.id),
  purpose: text("purpose").notNull().default("payout_processing"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [index("payout_access_admin_idx").on(t.adminId, t.createdAt), index("payout_access_payout_idx").on(t.payoutId, t.createdAt)]);

// Extended learning platform features.
export const learningMaterials = pgTable("learning_materials", {
  id: serial("id").primaryKey(), title: text("title").notNull(), description: text("description").notNull().default(""),
  kind: text("kind").notNull().default("textbook"), category: text("category").notNull().default("general"), language: text("language").notNull().default("English"), level: text("level").notNull().default("A1"),
  fileUrl: text("file_url").notNull(), coverUrl: text("cover_url").notNull().default(""), isFree: boolean("is_free").notNull().default(true),
  price: integer("price").notNull().default(0), published: boolean("published").notNull().default(false), createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [index("materials_published_idx").on(t.published, t.kind)]);
export const materialPurchases = pgTable("material_purchases", {
  id: serial("id").primaryKey(), materialId: integer("material_id").notNull().references(() => learningMaterials.id),
  userId: integer("user_id").notNull().references(() => users.id), amount: integer("amount").notNull().default(0),
  status: text("status").notNull().default("paid"), createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [uniqueIndex("material_purchase_unique").on(t.materialId, t.userId), index("material_purchase_user_idx").on(t.userId)]);
export const lessonReports = pgTable("lesson_reports", {
  id: serial("id").primaryKey(), lessonId: integer("lesson_id").notNull().references(() => lessons.id),
  reporterId: integer("reporter_id").notNull().references(() => users.id), category: text("category").notNull(), description: text("description").notNull(),
  status: text("status").notNull().default("open"), resolution: text("resolution").notNull().default(""), createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [index("lesson_reports_status_idx").on(t.status, t.createdAt)]);
export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(), referrerId: integer("referrer_id").notNull().references(() => users.id), referredUserId: integer("referred_user_id").notNull().unique().references(() => users.id),
  code: text("code").notNull(), status: text("status").notNull().default("registered"), createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [index("referrals_referrer_idx").on(t.referrerId, t.status)]);
export const referralRewards = pgTable("referral_rewards", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id), rewardType: text("reward_type").notNull(),
  lessonsGranted: integer("lessons_granted").notNull(), duration: integer("duration").notNull(), status: text("status").notNull().default("available"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [index("referral_rewards_user_idx").on(t.userId)]);
export const referralLessonCredits = pgTable("referral_lesson_credits", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  duration: integer("duration").notNull(), remainingLessons: integer("remaining_lessons").notNull().default(0),
  sourceRewardId: integer("source_reward_id").notNull().references(() => referralRewards.id, { onDelete: "cascade" }).unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [index("referral_credits_user_idx").on(t.userId, t.duration), check("referral_credit_duration_check", sql`${t.duration} in (25,50)`), check("referral_credit_remaining_check", sql`${t.remainingLessons} >= 0`)]);
export const teacherDocuments = pgTable("teacher_documents", {
  id: serial("id").primaryKey(), teacherId: integer("teacher_id").notNull().references(() => users.id), documentType: text("document_type").notNull(),
  fileUrl: text("file_url").notNull(), status: text("status").notNull().default("pending"), optionalCredential: boolean("optional_credential").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(), reviewedAt: timestamp("reviewed_at"),
}, t => [index("teacher_documents_user_idx").on(t.teacherId, t.status)]);
export const classroomWorkspaceStates = pgTable("classroom_workspace_states", {
  lessonId: integer("lesson_id").primaryKey().references(() => lessons.id, { onDelete: "cascade" }),
  state: jsonb("state").notNull().default(sql`'{}'::jsonb`),
  updatedBy: integer("updated_by").notNull().references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(), revision: integer("revision").notNull().default(1),
}, t => [index("classroom_workspace_updated_idx").on(t.updatedAt)]);

export const lessonChatMessages = pgTable("lesson_chat_messages", {
  id: serial("id").primaryKey(), lessonId: integer("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  senderId: integer("sender_id").notNull().references(() => users.id), body: text("body").notNull(), createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [index("lesson_chat_lesson_idx").on(t.lessonId, t.createdAt)]);
export const lessonRecordings = pgTable("lesson_recordings", {
  id: serial("id").primaryKey(), lessonId: integer("lesson_id").notNull().unique().references(() => lessons.id, { onDelete: "cascade" }),
  fileUrl: text("file_url").notNull().default(""), provider: text("provider").notNull().default("daily"),
  providerRecordingId: text("provider_recording_id").notNull().default(""), status: text("status").notNull().default("processing"),
  expiresAt: timestamp("expires_at").notNull(), createdAt: timestamp("created_at").defaultNow().notNull(), updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, t => [index("recordings_expiry_idx").on(t.expiresAt), index("recordings_status_idx").on(t.status)]);

// Additional students joining a semi-private lesson are represented here. The
// primary/legacy student_id on lessons remains the group creator for compatibility.
export const lessonParticipants = pgTable("lesson_participants", {
  id: serial("id").primaryKey(), lessonId: integer("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  paidAmount: integer("paid_amount").notNull().default(0), status: text("status").notNull().default("booked"),
  createdAt: timestamp("created_at").defaultNow().notNull(), cancelledAt: timestamp("cancelled_at"),
}, t => [
  uniqueIndex("lesson_participant_active_unique").on(t.lessonId, t.studentId).where(sql`${t.status} in ('booked','attended')`),
  index("lesson_participants_student_idx").on(t.studentId, t.status),
  index("lesson_participants_lesson_idx").on(t.lessonId, t.status),
  check("lesson_participant_status_check", sql`${t.status} in ('booked','attended','cancelled','refunded')`),
]);

export const lessonRecordingConsents = pgTable("lesson_recording_consents", {
  id: serial("id").primaryKey(), lessonId: integer("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  consented: boolean("consented").notNull().default(false), consentedAt: timestamp("consented_at"), updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, t => [uniqueIndex("lesson_recording_consent_unique").on(t.lessonId, t.userId), index("lesson_recording_consent_user_idx").on(t.userId)]);

export const moderationCases = pgTable("moderation_cases", {
  id: serial("id").primaryKey(), lessonId: integer("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
  reporterId: integer("reporter_id").notNull().references(() => users.id), subjectUserId: integer("subject_user_id").references(() => users.id),
  category: text("category").notNull(), description: text("description").notNull(), evidenceRef: text("evidence_ref").notNull().default(""),
  status: text("status").notNull().default("open"), resolution: text("resolution").notNull().default(""),
  appealText: text("appeal_text").notNull().default(""), createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
}, t => [index("moderation_cases_status_idx").on(t.status, t.createdAt), index("moderation_cases_subject_idx").on(t.subjectUserId)]);

export const lessonReminderLogs = pgTable("lesson_reminder_logs", {
  id: serial("id").primaryKey(), lessonId: integer("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  recipientId: integer("recipient_id").notNull().references(() => users.id), minutesBefore: integer("minutes_before").notNull(), status: text("status").notNull().default("pending"),
  sentAt: timestamp("sent_at"), createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [uniqueIndex("reminder_once_unique").on(t.lessonId, t.recipientId, t.minutesBefore)]);
export const userPresence = pgTable("user_presence", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  online: boolean("online").notNull().default(false),
  visible: boolean("visible").notNull().default(true),
});


// Append-only admin audit trail for manual financial and account actions.
export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: serial("id").primaryKey(), adminId: integer("admin_id").notNull().references(() => users.id),
  targetUserId: integer("target_user_id").references(() => users.id), action: text("action").notNull(),
  amount: integer("amount").notNull().default(0), balanceBefore: integer("balance_before"), balanceAfter: integer("balance_after"),
  reference: text("reference").notNull().default(""), note: text("note").notNull().default(""),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`), createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [index("admin_audit_admin_idx").on(t.adminId, t.createdAt), index("admin_audit_target_idx").on(t.targetUserId, t.createdAt), index("admin_audit_action_idx").on(t.action, t.createdAt)]);

export const authActionTokens = pgTable("auth_action_tokens", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(), tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(), consumedAt: timestamp("consumed_at"), createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [index("auth_tokens_user_purpose_idx").on(t.userId, t.purpose), index("auth_tokens_expiry_idx").on(t.expiresAt)]);


// Shared atomic rate-limit windows used when a Redis provider is not configured.
export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  key: text("key").primaryKey(), count: integer("count").notNull().default(0),
  expiresAt: timestamp("expires_at").notNull(), updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, t => [index("rate_limit_expires_idx").on(t.expiresAt)]);


export const scheduledJobRuns = pgTable("scheduled_job_runs", {
  id: serial("id").primaryKey(), job: text("job").notNull(), status: text("status").notNull().default("running"),
  startedAt: timestamp("started_at").defaultNow().notNull(), finishedAt: timestamp("finished_at"), durationMs: integer("duration_ms"),
  summary: jsonb("summary").notNull().default(sql`'{}'::jsonb`), error: text("error").notNull().default(""),
}, t => [index("scheduled_job_name_started_idx").on(t.job, t.startedAt), index("scheduled_job_status_started_idx").on(t.status, t.startedAt)]);
