import { foreignKey, int, timestamp, varchar, longtext } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { qaReleasesTable } from "./qa_releases";
import { qaReleaseSectionsTable } from "./qa_release_sections";
import { usersTable } from "./users";
import { createdAtColumn, helpdeskTable, idColumn, updatedAtColumn } from "./_shared";

export const qaCasePriorityEnum = ["low", "medium", "high", "critical"] as const;
export type QaCasePriority = typeof qaCasePriorityEnum[number];

export const qaCaseStatusEnum = ["pending", "assigned", "in_progress", "passed", "failed", "blocked", "not_applicable"] as const;
export type QaCaseStatus = typeof qaCaseStatusEnum[number];

export const qaTestCasesTable = helpdeskTable("QA_test_cases", {
  id: idColumn(),
  releaseId: int("release_id").notNull(),
  sectionId: int("section_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  objective: longtext("objective"),
  stepsText: longtext("steps_text"),
  expectedResult: longtext("expected_result"),
  priority: varchar("priority", { length: 40 }).notNull().default("medium"),
  status: varchar("status", { length: 40 }).notNull().default("pending"),
  assignedToUserId: int("assigned_to_user_id"),
  assignedAt: timestamp("assigned_at", { mode: "date", fsp: 3 }),
  executionOrder: int("execution_order").notNull().default(0),
  createdByUserId: int("created_by_user_id").notNull(),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  foreignKey({
    columns: [table.releaseId],
    foreignColumns: [qaReleasesTable.id],
    name: "fk_qa_case_release",
  }),
  foreignKey({
    columns: [table.sectionId],
    foreignColumns: [qaReleaseSectionsTable.id],
    name: "fk_qa_case_section",
  }),
  foreignKey({
    columns: [table.assignedToUserId],
    foreignColumns: [usersTable.id],
    name: "fk_qa_case_assigned_to",
  }),
  foreignKey({
    columns: [table.createdByUserId],
    foreignColumns: [usersTable.id],
    name: "fk_qa_case_created_by",
  }),
]);

export const insertQaTestCaseSchema = createInsertSchema(qaTestCasesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertQaTestCase = z.infer<typeof insertQaTestCaseSchema>;
export type QaTestCase = typeof qaTestCasesTable.$inferSelect;
