import { foreignKey, int, varchar, longtext } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { qaReleasesTable } from "./qa_releases";
import { createdAtColumn, helpdeskTable, idColumn, updatedAtColumn } from "./_shared";

export const qaReleaseSectionsTable = helpdeskTable("QA_release_sections", {
  id: idColumn(),
  releaseId: int("release_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: longtext("description"),
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  foreignKey({
    columns: [table.releaseId],
    foreignColumns: [qaReleasesTable.id],
    name: "fk_qa_section_release",
  }),
]);

export const insertQaReleaseSectionSchema = createInsertSchema(qaReleaseSectionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertQaReleaseSection = z.infer<typeof insertQaReleaseSectionSchema>;
export type QaReleaseSection = typeof qaReleaseSectionsTable.$inferSelect;
