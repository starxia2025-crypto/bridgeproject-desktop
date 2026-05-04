import { foreignKey, int, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { qaTestResultsTable } from "./qa_test_results";
import { usersTable } from "./users";
import { createdAtColumn, helpdeskTable, idColumn } from "./_shared";

export const qaEvidenceTypeEnum = ["image", "video", "document", "other"] as const;
export type QaEvidenceType = typeof qaEvidenceTypeEnum[number];

export const qaTestEvidencesTable = helpdeskTable("QA_test_evidences", {
  id: idColumn(),
  resultId: int("result_id").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  storedFileName: varchar("stored_file_name", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 160 }).notNull(),
  fileSize: int("file_size").notNull().default(0),
  publicUrl: varchar("public_url", { length: 1000 }).notNull(),
  evidenceType: varchar("evidence_type", { length: 40 }).notNull().default("other"),
  createdByUserId: int("created_by_user_id").notNull(),
  createdAt: createdAtColumn(),
}, (table) => [
  foreignKey({
    columns: [table.resultId],
    foreignColumns: [qaTestResultsTable.id],
    name: "fk_qa_evidence_result",
  }),
  foreignKey({
    columns: [table.createdByUserId],
    foreignColumns: [usersTable.id],
    name: "fk_qa_evidence_created_by",
  }),
]);

export const insertQaTestEvidenceSchema = createInsertSchema(qaTestEvidencesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertQaTestEvidence = z.infer<typeof insertQaTestEvidenceSchema>;
export type QaTestEvidence = typeof qaTestEvidencesTable.$inferSelect;
