import { foreignKey, int, timestamp, varchar, longtext } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { qaReleasesTable } from "./qa_releases";
import { qaTestCasesTable } from "./qa_test_cases";
import { usersTable } from "./users";
import { createdAtColumn, helpdeskTable, idColumn } from "./_shared";

export const qaResultOutcomeEnum = ["passed", "failed", "blocked", "not_run"] as const;
export type QaResultOutcome = typeof qaResultOutcomeEnum[number];

export const qaBugSeverityEnum = ["minor", "medium", "high", "critical"] as const;
export type QaBugSeverity = typeof qaBugSeverityEnum[number];

export const qaTestResultsTable = helpdeskTable("QA_test_results", {
  id: idColumn(),
  releaseId: int("release_id").notNull(),
  caseId: int("case_id").notNull(),
  executedByUserId: int("executed_by_user_id").notNull(),
  outcome: varchar("outcome", { length: 40 }).notNull(),
  notes: longtext("notes"),
  actualResult: longtext("actual_result"),
  bugTitle: varchar("bug_title", { length: 255 }),
  bugSeverity: varchar("bug_severity", { length: 40 }),
  executedAt: timestamp("executed_at", { mode: "date", fsp: 3 }).notNull(),
  createdAt: createdAtColumn(),
}, (table) => [
  foreignKey({
    columns: [table.releaseId],
    foreignColumns: [qaReleasesTable.id],
    name: "fk_qa_result_release",
  }),
  foreignKey({
    columns: [table.caseId],
    foreignColumns: [qaTestCasesTable.id],
    name: "fk_qa_result_case",
  }),
  foreignKey({
    columns: [table.executedByUserId],
    foreignColumns: [usersTable.id],
    name: "fk_qa_result_executed_by",
  }),
]);

export const insertQaTestResultSchema = createInsertSchema(qaTestResultsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertQaTestResult = z.infer<typeof insertQaTestResultSchema>;
export type QaTestResult = typeof qaTestResultsTable.$inferSelect;
