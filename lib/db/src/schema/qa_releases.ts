import { foreignKey, int, timestamp, varchar, longtext } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { createdAtColumn, helpdeskTable, idColumn, updatedAtColumn } from "./_shared";

export const qaReleaseStatusEnum = ["draft", "active", "in_review", "approved", "rejected", "archived"] as const;
export type QaReleaseStatus = typeof qaReleaseStatusEnum[number];

export const qaReleasesTable = helpdeskTable("QA_releases", {
  id: idColumn(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  productName: varchar("product_name", { length: 255 }).notNull(),
  versionLabel: varchar("version_label", { length: 120 }).notNull(),
  releaseDate: timestamp("release_date", { mode: "date", fsp: 3 }),
  environmentName: varchar("environment_name", { length: 120 }).default("preproduccion"),
  status: varchar("status", { length: 40 }).notNull().default("draft"),
  scopeSummary: longtext("scope_summary"),
  releaseNotes: longtext("release_notes"),
  createdByUserId: int("created_by_user_id").notNull(),
  approvedByUserId: int("approved_by_user_id"),
  approvedAt: timestamp("approved_at", { mode: "date", fsp: 3 }),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  foreignKey({
    columns: [table.createdByUserId],
    foreignColumns: [usersTable.id],
    name: "fk_qa_release_created_by",
  }),
  foreignKey({
    columns: [table.approvedByUserId],
    foreignColumns: [usersTable.id],
    name: "fk_qa_release_approved_by",
  }),
]);

export const insertQaReleaseSchema = createInsertSchema(qaReleasesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertQaRelease = z.infer<typeof insertQaReleaseSchema>;
export type QaRelease = typeof qaReleasesTable.$inferSelect;
