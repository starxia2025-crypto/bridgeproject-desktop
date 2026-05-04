import { Router } from "express";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  qaReleasesTable,
  qaReleaseSectionsTable,
  qaTestCasesTable,
  qaTestResultsTable,
  qaTestEvidencesTable,
  usersTable,
} from "@workspace/db/schema";
import { requireAuth, requireRole } from "../lib/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { logger } from "../lib/logger.js";

const router = Router();
const supportRoles = ["superadmin", "tecnico"] as const;
const storageRoot = path.resolve(process.env["DOCUMENTS_STORAGE_ROOT"] || "/app/storage");
const evidenceStoragePath = path.join(storageRoot, "qa-evidence");

type UploadedFile = {
  arrayBuffer: () => Promise<ArrayBuffer>;
  name: string;
  size: number;
  type: string;
};

const releaseStatusEnum = ["draft", "active", "in_review", "approved", "rejected", "archived"] as const;
const casePriorityEnum = ["low", "medium", "high", "critical"] as const;
const caseStatusEnum = ["pending", "assigned", "in_progress", "passed", "failed", "blocked", "not_applicable"] as const;
const resultOutcomeEnum = ["passed", "failed", "blocked", "not_run"] as const;
const bugSeverityEnum = ["minor", "medium", "high", "critical"] as const;
const evidenceTypeEnum = ["image", "video", "document", "other"] as const;

const createReleaseSchema = z.object({
  code: z.string().trim().min(2).max(64),
  productName: z.string().trim().min(2).max(255),
  versionLabel: z.string().trim().min(2).max(120),
  releaseDate: z.string().datetime().nullable().optional(),
  environmentName: z.string().trim().min(2).max(120).optional(),
  status: z.enum(releaseStatusEnum).optional(),
  scopeSummary: z.string().trim().max(10000).nullable().optional(),
  releaseNotes: z.string().trim().max(12000).nullable().optional(),
}).strict();

const updateReleaseSchema = z.object({
  productName: z.string().trim().min(2).max(255).optional(),
  versionLabel: z.string().trim().min(2).max(120).optional(),
  releaseDate: z.string().datetime().nullable().optional(),
  environmentName: z.string().trim().min(2).max(120).nullable().optional(),
  status: z.enum(releaseStatusEnum).optional(),
  scopeSummary: z.string().trim().max(10000).nullable().optional(),
  releaseNotes: z.string().trim().max(12000).nullable().optional(),
}).strict();

const createSectionSchema = z.object({
  title: z.string().trim().min(2).max(255),
  description: z.string().trim().max(4000).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
}).strict();

const createCaseSchema = z.object({
  title: z.string().trim().min(2).max(255),
  objective: z.string().trim().max(6000).nullable().optional(),
  stepsText: z.string().trim().max(12000).nullable().optional(),
  expectedResult: z.string().trim().max(6000).nullable().optional(),
  priority: z.enum(casePriorityEnum).optional(),
  executionOrder: z.number().int().min(0).optional(),
}).strict();

const assignCaseSchema = z.object({
  assignedToUserId: z.number().int().positive().nullable(),
  status: z.enum(caseStatusEnum).optional(),
}).strict();

const createResultSchema = z.object({
  outcome: z.enum(resultOutcomeEnum),
  notes: z.string().trim().max(10000).nullable().optional(),
  actualResult: z.string().trim().max(10000).nullable().optional(),
  bugTitle: z.string().trim().max(255).nullable().optional(),
  bugSeverity: z.enum(bugSeverityEnum).nullable().optional(),
  evidences: z.array(z.object({
    fileName: z.string().trim().min(1).max(255),
    storedFileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(160),
    fileSize: z.number().int().nonnegative(),
    publicUrl: z.string().trim().url().max(1000),
    evidenceType: z.enum(evidenceTypeEnum),
  })).default([]),
}).strict();

function isUploadedFile(value: unknown): value is UploadedFile {
  return !!value && typeof value !== "string" && typeof (value as UploadedFile).arrayBuffer === "function" && typeof (value as UploadedFile).name === "string";
}

function getSafeErrorMessage(error: unknown, fallback: string) {
  logger.error({ err: error }, fallback);
  return fallback;
}

function toNullableDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeNullableText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function inferEvidenceType(mimeType: string) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.includes("pdf") || mimeType.includes("sheet") || mimeType.includes("document") || mimeType.includes("word")) return "document";
  return "other";
}

async function getReleaseSummary(releaseId: number) {
  const [cases, results] = await Promise.all([
    db
      .select({
        id: qaTestCasesTable.id,
        status: qaTestCasesTable.status,
      })
      .from(qaTestCasesTable)
      .where(eq(qaTestCasesTable.releaseId, releaseId)),
    db
      .select({
        id: qaTestResultsTable.id,
        caseId: qaTestResultsTable.caseId,
        outcome: qaTestResultsTable.outcome,
        bugSeverity: qaTestResultsTable.bugSeverity,
      })
      .from(qaTestResultsTable)
      .where(eq(qaTestResultsTable.releaseId, releaseId))
      .orderBy(desc(qaTestResultsTable.executedAt), desc(qaTestResultsTable.id)),
  ]);

  const latestByCase = new Map<number, any>();
  for (const result of results) {
    if (!latestByCase.has(result.caseId)) {
      latestByCase.set(result.caseId, result);
    }
  }

  const executed = latestByCase.size;
  const totals = {
    totalCases: cases.length,
    executedCases: executed,
    pendingCases: Math.max(cases.length - executed, 0),
    passedCases: 0,
    failedCases: 0,
    blockedCases: 0,
    criticalFindings: 0,
    highFindings: 0,
  };

  for (const result of latestByCase.values()) {
    if (result.outcome === "passed") totals.passedCases += 1;
    if (result.outcome === "failed") totals.failedCases += 1;
    if (result.outcome === "blocked") totals.blockedCases += 1;
    if (result.bugSeverity === "critical") totals.criticalFindings += 1;
    if (result.bugSeverity === "high") totals.highFindings += 1;
  }

  return {
    ...totals,
    completionRate: totals.totalCases > 0 ? Math.round((totals.executedCases / totals.totalCases) * 100) : 0,
    passRate: totals.executedCases > 0 ? Math.round((totals.passedCases / totals.executedCases) * 100) : 0,
  };
}

router.get("/meta", requireAuth, requireRole(...supportRoles), async (_req, res) => {
  try {
    const technicians = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
      })
      .from(usersTable)
      .where(and(eq(usersTable.active, true), eq(usersTable.role, "tecnico")))
      .orderBy(asc(usersTable.name));

    res.json({
      technicians,
      releaseStatuses: releaseStatusEnum,
      casePriorities: casePriorityEnum,
      caseStatuses: caseStatusEnum,
      resultOutcomes: resultOutcomeEnum,
      bugSeverities: bugSeverityEnum,
    });
  } catch (error) {
    res.status(500).json({ error: "InternalServerError", message: getSafeErrorMessage(error, "No se pudo cargar la configuracion de QA.") });
  }
});

router.get("/releases", requireAuth, requireRole(...supportRoles), async (_req, res) => {
  try {
    const releases = await db
      .select({
        id: qaReleasesTable.id,
        code: qaReleasesTable.code,
        productName: qaReleasesTable.productName,
        versionLabel: qaReleasesTable.versionLabel,
        releaseDate: qaReleasesTable.releaseDate,
        environmentName: qaReleasesTable.environmentName,
        status: qaReleasesTable.status,
        scopeSummary: qaReleasesTable.scopeSummary,
        releaseNotes: qaReleasesTable.releaseNotes,
        createdByUserId: qaReleasesTable.createdByUserId,
        createdByName: usersTable.name,
        approvedAt: qaReleasesTable.approvedAt,
        createdAt: qaReleasesTable.createdAt,
        updatedAt: qaReleasesTable.updatedAt,
      })
      .from(qaReleasesTable)
      .leftJoin(usersTable, eq(qaReleasesTable.createdByUserId, usersTable.id))
      .orderBy(desc(qaReleasesTable.releaseDate), desc(qaReleasesTable.createdAt));

    const releasesWithSummary = await Promise.all(
      releases.map(async (release) => ({
        ...release,
        summary: await getReleaseSummary(release.id),
      })),
    );

    res.json({ data: releasesWithSummary });
  } catch (error) {
    res.status(500).json({ error: "InternalServerError", message: getSafeErrorMessage(error, "No se pudieron cargar las releases de QA.") });
  }
});

router.post("/releases", requireAuth, requireRole(...supportRoles), async (req, res) => {
  const parsed = createReleaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "Los datos de la release QA no son validos." });
    return;
  }

  try {
    const authUser = (req as any).user;
    await db.insert(qaReleasesTable).values({
      code: parsed.data.code,
      productName: parsed.data.productName,
      versionLabel: parsed.data.versionLabel,
      releaseDate: toNullableDate(parsed.data.releaseDate ?? null),
      environmentName: normalizeNullableText(parsed.data.environmentName) ?? "preproduccion",
      status: parsed.data.status ?? "draft",
      scopeSummary: normalizeNullableText(parsed.data.scopeSummary),
      releaseNotes: normalizeNullableText(parsed.data.releaseNotes),
      createdByUserId: authUser.userId,
    } as any);

    const inserted = await db
      .select({ id: qaReleasesTable.id })
      .from(qaReleasesTable)
      .where(eq(qaReleasesTable.code, parsed.data.code))
      .limit(1);

    const releaseId = inserted[0]?.id;
    if (releaseId) {
      await createAuditLog({
        action: "create_qa_release",
        entityType: "qa_release",
        entityId: releaseId,
        userId: authUser.userId,
        newValues: parsed.data,
      });
    }

    res.status(201).json({ id: releaseId, message: "Release QA creada correctamente." });
  } catch (error) {
    res.status(500).json({ error: "InternalServerError", message: getSafeErrorMessage(error, "No se pudo crear la release de QA.") });
  }
});

router.patch("/releases/:releaseId", requireAuth, requireRole(...supportRoles), async (req, res) => {
  const releaseId = Number(req.params["releaseId"]);
  if (!Number.isInteger(releaseId) || releaseId <= 0) {
    res.status(400).json({ error: "ValidationError", message: "Release QA no valida." });
    return;
  }

  const parsed = updateReleaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "Los cambios de la release QA no son validos." });
    return;
  }

  try {
    const authUser = (req as any).user;
    const currentRows = await db.select().from(qaReleasesTable).where(eq(qaReleasesTable.id, releaseId)).limit(1);
    const current = currentRows[0];
    if (!current) {
      res.status(404).json({ error: "NotFound", message: "Release QA no encontrada." });
      return;
    }

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.productName !== undefined) updateValues["productName"] = parsed.data.productName;
    if (parsed.data.versionLabel !== undefined) updateValues["versionLabel"] = parsed.data.versionLabel;
    if (parsed.data.releaseDate !== undefined) updateValues["releaseDate"] = toNullableDate(parsed.data.releaseDate ?? null);
    if (parsed.data.environmentName !== undefined) updateValues["environmentName"] = normalizeNullableText(parsed.data.environmentName);
    if (parsed.data.status !== undefined) updateValues["status"] = parsed.data.status;
    if (parsed.data.scopeSummary !== undefined) updateValues["scopeSummary"] = normalizeNullableText(parsed.data.scopeSummary);
    if (parsed.data.releaseNotes !== undefined) updateValues["releaseNotes"] = normalizeNullableText(parsed.data.releaseNotes);
    if (parsed.data.status === "approved") {
      updateValues["approvedByUserId"] = authUser.userId;
      updateValues["approvedAt"] = new Date();
    }

    await db.update(qaReleasesTable).set(updateValues as any).where(eq(qaReleasesTable.id, releaseId));

    await createAuditLog({
      action: "update_qa_release",
      entityType: "qa_release",
      entityId: releaseId,
      userId: authUser.userId,
      oldValues: {
        status: current.status,
        versionLabel: current.versionLabel,
      },
      newValues: parsed.data,
    });

    res.json({ message: "Release QA actualizada correctamente." });
  } catch (error) {
    res.status(500).json({ error: "InternalServerError", message: getSafeErrorMessage(error, "No se pudo actualizar la release de QA.") });
  }
});

router.get("/releases/:releaseId", requireAuth, requireRole(...supportRoles), async (req, res) => {
  const releaseId = Number(req.params["releaseId"]);
  if (!Number.isInteger(releaseId) || releaseId <= 0) {
    res.status(400).json({ error: "ValidationError", message: "Release QA no valida." });
    return;
  }

  try {
    const [releaseRows, sections, cases, results, evidences] = await Promise.all([
      db
        .select({
          id: qaReleasesTable.id,
          code: qaReleasesTable.code,
          productName: qaReleasesTable.productName,
          versionLabel: qaReleasesTable.versionLabel,
          releaseDate: qaReleasesTable.releaseDate,
          environmentName: qaReleasesTable.environmentName,
          status: qaReleasesTable.status,
          scopeSummary: qaReleasesTable.scopeSummary,
          releaseNotes: qaReleasesTable.releaseNotes,
          createdByUserId: qaReleasesTable.createdByUserId,
          createdByName: usersTable.name,
          approvedAt: qaReleasesTable.approvedAt,
          createdAt: qaReleasesTable.createdAt,
          updatedAt: qaReleasesTable.updatedAt,
        })
        .from(qaReleasesTable)
        .leftJoin(usersTable, eq(qaReleasesTable.createdByUserId, usersTable.id))
        .where(eq(qaReleasesTable.id, releaseId))
        .limit(1),
      db
        .select()
        .from(qaReleaseSectionsTable)
        .where(eq(qaReleaseSectionsTable.releaseId, releaseId))
        .orderBy(asc(qaReleaseSectionsTable.sortOrder), asc(qaReleaseSectionsTable.id)),
      db
        .select({
          id: qaTestCasesTable.id,
          releaseId: qaTestCasesTable.releaseId,
          sectionId: qaTestCasesTable.sectionId,
          title: qaTestCasesTable.title,
          objective: qaTestCasesTable.objective,
          stepsText: qaTestCasesTable.stepsText,
          expectedResult: qaTestCasesTable.expectedResult,
          priority: qaTestCasesTable.priority,
          status: qaTestCasesTable.status,
          assignedToUserId: qaTestCasesTable.assignedToUserId,
          assignedAt: qaTestCasesTable.assignedAt,
          executionOrder: qaTestCasesTable.executionOrder,
          createdByUserId: qaTestCasesTable.createdByUserId,
          createdAt: qaTestCasesTable.createdAt,
          updatedAt: qaTestCasesTable.updatedAt,
          assignedToName: usersTable.name,
        })
        .from(qaTestCasesTable)
        .leftJoin(usersTable, eq(qaTestCasesTable.assignedToUserId, usersTable.id))
        .where(eq(qaTestCasesTable.releaseId, releaseId))
        .orderBy(asc(qaTestCasesTable.executionOrder), asc(qaTestCasesTable.id)),
      db
        .select({
          id: qaTestResultsTable.id,
          releaseId: qaTestResultsTable.releaseId,
          caseId: qaTestResultsTable.caseId,
          executedByUserId: qaTestResultsTable.executedByUserId,
          outcome: qaTestResultsTable.outcome,
          notes: qaTestResultsTable.notes,
          actualResult: qaTestResultsTable.actualResult,
          bugTitle: qaTestResultsTable.bugTitle,
          bugSeverity: qaTestResultsTable.bugSeverity,
          executedAt: qaTestResultsTable.executedAt,
          createdAt: qaTestResultsTable.createdAt,
          executedByName: usersTable.name,
        })
        .from(qaTestResultsTable)
        .leftJoin(usersTable, eq(qaTestResultsTable.executedByUserId, usersTable.id))
        .where(eq(qaTestResultsTable.releaseId, releaseId))
        .orderBy(desc(qaTestResultsTable.executedAt), desc(qaTestResultsTable.id)),
      db
        .select()
        .from(qaTestEvidencesTable)
        .innerJoin(qaTestResultsTable, eq(qaTestEvidencesTable.resultId, qaTestResultsTable.id))
        .where(eq(qaTestResultsTable.releaseId, releaseId))
        .orderBy(desc(qaTestEvidencesTable.createdAt)),
    ]);

    const release = releaseRows[0];
    if (!release) {
      res.status(404).json({ error: "NotFound", message: "Release QA no encontrada." });
      return;
    }

    const evidencesByResult = new Map<number, any[]>();
    for (const row of evidences) {
      const evidence = {
        id: row.QA_test_evidences.id,
        resultId: row.QA_test_evidences.resultId,
        fileName: row.QA_test_evidences.fileName,
        storedFileName: row.QA_test_evidences.storedFileName,
        mimeType: row.QA_test_evidences.mimeType,
        fileSize: row.QA_test_evidences.fileSize,
        publicUrl: row.QA_test_evidences.publicUrl,
        evidenceType: row.QA_test_evidences.evidenceType,
        createdByUserId: row.QA_test_evidences.createdByUserId,
        createdAt: row.QA_test_evidences.createdAt,
      };
      const current = evidencesByResult.get(evidence.resultId) ?? [];
      current.push(evidence);
      evidencesByResult.set(evidence.resultId, current);
    }

    const resultsWithEvidence = results.map((result) => ({
      ...result,
      evidences: evidencesByResult.get(result.id) ?? [],
    }));

    const sectionsWithCases = sections.map((section) => ({
      ...section,
      cases: cases
        .filter((item) => item.sectionId === section.id)
        .map((item) => ({
          ...item,
          results: resultsWithEvidence.filter((result) => result.caseId === item.id),
        })),
    }));

    const summary = await getReleaseSummary(releaseId);
    const report = {
      ...summary,
      releaseStatus: release.status,
      generatedAt: new Date().toISOString(),
      recommendation:
        summary.criticalFindings > 0 || summary.failedCases > 0
          ? "La release necesita revisiones antes de aprobarse."
          : summary.totalCases > 0 && summary.executedCases === summary.totalCases
            ? "La release puede pasar a validacion final."
            : "La release sigue en ejecucion y aun no ha completado su cobertura prevista.",
    };

    res.json({
      release,
      sections: sectionsWithCases,
      results: resultsWithEvidence,
      report,
    });
  } catch (error) {
    res.status(500).json({ error: "InternalServerError", message: getSafeErrorMessage(error, "No se pudo cargar el detalle de la release QA.") });
  }
});

router.post("/releases/:releaseId/sections", requireAuth, requireRole(...supportRoles), async (req, res) => {
  const releaseId = Number(req.params["releaseId"]);
  if (!Number.isInteger(releaseId) || releaseId <= 0) {
    res.status(400).json({ error: "ValidationError", message: "Release QA no valida." });
    return;
  }

  const parsed = createSectionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "La seccion de QA no es valida." });
    return;
  }

  try {
    const authUser = (req as any).user;
    await db.insert(qaReleaseSectionsTable).values({
      releaseId,
      title: parsed.data.title,
      description: normalizeNullableText(parsed.data.description),
      sortOrder: parsed.data.sortOrder ?? 0,
    } as any);

    const inserted = await db
      .select({ id: qaReleaseSectionsTable.id })
      .from(qaReleaseSectionsTable)
      .where(and(eq(qaReleaseSectionsTable.releaseId, releaseId), eq(qaReleaseSectionsTable.title, parsed.data.title)))
      .orderBy(desc(qaReleaseSectionsTable.id))
      .limit(1);

    const sectionId = inserted[0]?.id;
    if (sectionId) {
      await createAuditLog({
        action: "create_qa_section",
        entityType: "qa_release_section",
        entityId: sectionId,
        userId: authUser.userId,
        newValues: { releaseId, ...parsed.data },
      });
    }

    res.status(201).json({ id: sectionId, message: "Bloque de pruebas creado correctamente." });
  } catch (error) {
    res.status(500).json({ error: "InternalServerError", message: getSafeErrorMessage(error, "No se pudo crear el bloque de pruebas.") });
  }
});

router.post("/sections/:sectionId/cases", requireAuth, requireRole(...supportRoles), async (req, res) => {
  const sectionId = Number(req.params["sectionId"]);
  if (!Number.isInteger(sectionId) || sectionId <= 0) {
    res.status(400).json({ error: "ValidationError", message: "Seccion QA no valida." });
    return;
  }

  const parsed = createCaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "El caso de prueba no es valido." });
    return;
  }

  try {
    const authUser = (req as any).user;
    const sectionRows = await db.select().from(qaReleaseSectionsTable).where(eq(qaReleaseSectionsTable.id, sectionId)).limit(1);
    const section = sectionRows[0];
    if (!section) {
      res.status(404).json({ error: "NotFound", message: "Seccion QA no encontrada." });
      return;
    }

    await db.insert(qaTestCasesTable).values({
      releaseId: section.releaseId,
      sectionId,
      title: parsed.data.title,
      objective: normalizeNullableText(parsed.data.objective),
      stepsText: normalizeNullableText(parsed.data.stepsText),
      expectedResult: normalizeNullableText(parsed.data.expectedResult),
      priority: parsed.data.priority ?? "medium",
      status: "pending",
      executionOrder: parsed.data.executionOrder ?? 0,
      createdByUserId: authUser.userId,
    } as any);

    const inserted = await db
      .select({ id: qaTestCasesTable.id })
      .from(qaTestCasesTable)
      .where(and(eq(qaTestCasesTable.sectionId, sectionId), eq(qaTestCasesTable.title, parsed.data.title)))
      .orderBy(desc(qaTestCasesTable.id))
      .limit(1);

    const caseId = inserted[0]?.id;
    if (caseId) {
      await createAuditLog({
        action: "create_qa_case",
        entityType: "qa_test_case",
        entityId: caseId,
        userId: authUser.userId,
        newValues: { sectionId, ...parsed.data },
      });
    }

    res.status(201).json({ id: caseId, message: "Caso de prueba creado correctamente." });
  } catch (error) {
    res.status(500).json({ error: "InternalServerError", message: getSafeErrorMessage(error, "No se pudo crear el caso de prueba.") });
  }
});

router.post("/cases/:caseId/take", requireAuth, requireRole(...supportRoles), async (req, res) => {
  const caseId = Number(req.params["caseId"]);
  if (!Number.isInteger(caseId) || caseId <= 0) {
    res.status(400).json({ error: "ValidationError", message: "Caso QA no valido." });
    return;
  }

  try {
    const authUser = (req as any).user;
    const rows = await db.select().from(qaTestCasesTable).where(eq(qaTestCasesTable.id, caseId)).limit(1);
    const current = rows[0];
    if (!current) {
      res.status(404).json({ error: "NotFound", message: "Caso QA no encontrado." });
      return;
    }

    if (current.assignedToUserId && current.assignedToUserId !== authUser.userId) {
      res.status(409).json({ error: "Conflict", message: "Este caso ya lo esta ejecutando otro tecnico." });
      return;
    }

    await db.update(qaTestCasesTable).set({
      assignedToUserId: authUser.userId,
      assignedAt: new Date(),
      status: current.status === "pending" ? "assigned" : current.status,
      updatedAt: new Date(),
    } as any).where(eq(qaTestCasesTable.id, caseId));

    await createAuditLog({
      action: "take_qa_case",
      entityType: "qa_test_case",
      entityId: caseId,
      userId: authUser.userId,
      newValues: { assignedToUserId: authUser.userId },
    });

    res.json({ message: "Caso QA asignado correctamente." });
  } catch (error) {
    res.status(500).json({ error: "InternalServerError", message: getSafeErrorMessage(error, "No se pudo tomar el caso de QA.") });
  }
});

router.patch("/cases/:caseId/assign", requireAuth, requireRole(...supportRoles), async (req, res) => {
  const caseId = Number(req.params["caseId"]);
  if (!Number.isInteger(caseId) || caseId <= 0) {
    res.status(400).json({ error: "ValidationError", message: "Caso QA no valido." });
    return;
  }

  const parsed = assignCaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "La asignacion del caso QA no es valida." });
    return;
  }

  try {
    const authUser = (req as any).user;
    const updateValues: Record<string, unknown> = {
      assignedToUserId: parsed.data.assignedToUserId,
      assignedAt: parsed.data.assignedToUserId ? new Date() : null,
      updatedAt: new Date(),
    };
    if (parsed.data.status) {
      updateValues["status"] = parsed.data.status;
    } else {
      updateValues["status"] = parsed.data.assignedToUserId ? "assigned" : "pending";
    }

    await db.update(qaTestCasesTable).set(updateValues as any).where(eq(qaTestCasesTable.id, caseId));

    await createAuditLog({
      action: "assign_qa_case",
      entityType: "qa_test_case",
      entityId: caseId,
      userId: authUser.userId,
      newValues: parsed.data,
    });

    res.json({ message: "Asignacion del caso QA guardada correctamente." });
  } catch (error) {
    res.status(500).json({ error: "InternalServerError", message: getSafeErrorMessage(error, "No se pudo asignar el caso de QA.") });
  }
});

router.post("/cases/:caseId/results", requireAuth, requireRole(...supportRoles), async (req, res) => {
  const caseId = Number(req.params["caseId"]);
  if (!Number.isInteger(caseId) || caseId <= 0) {
    res.status(400).json({ error: "ValidationError", message: "Caso QA no valido." });
    return;
  }

  const parsed = createResultSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "El resultado QA no es valido." });
    return;
  }

  try {
    const authUser = (req as any).user;
    const caseRows = await db.select().from(qaTestCasesTable).where(eq(qaTestCasesTable.id, caseId)).limit(1);
    const testCase = caseRows[0];
    if (!testCase) {
      res.status(404).json({ error: "NotFound", message: "Caso QA no encontrado." });
      return;
    }

    const executedAt = new Date();
    await db.insert(qaTestResultsTable).values({
      releaseId: testCase.releaseId,
      caseId,
      executedByUserId: authUser.userId,
      outcome: parsed.data.outcome,
      notes: normalizeNullableText(parsed.data.notes),
      actualResult: normalizeNullableText(parsed.data.actualResult),
      bugTitle: normalizeNullableText(parsed.data.bugTitle),
      bugSeverity: parsed.data.bugSeverity ?? null,
      executedAt,
    } as any);

    const resultRows = await db
      .select({ id: qaTestResultsTable.id })
      .from(qaTestResultsTable)
      .where(and(eq(qaTestResultsTable.caseId, caseId), eq(qaTestResultsTable.executedByUserId, authUser.userId)))
      .orderBy(desc(qaTestResultsTable.id))
      .limit(1);

    const resultId = resultRows[0]?.id;
    if (resultId && parsed.data.evidences.length > 0) {
      await db.insert(qaTestEvidencesTable).values(
        parsed.data.evidences.map((evidence) => ({
          resultId,
          fileName: evidence.fileName,
          storedFileName: evidence.storedFileName,
          mimeType: evidence.mimeType,
          fileSize: evidence.fileSize,
          publicUrl: evidence.publicUrl,
          evidenceType: evidence.evidenceType,
          createdByUserId: authUser.userId,
        })) as any,
      );
    }

    const nextCaseStatus =
      parsed.data.outcome === "passed"
        ? "passed"
        : parsed.data.outcome === "failed"
          ? "failed"
          : parsed.data.outcome === "blocked"
            ? "blocked"
            : "in_progress";

    await db.update(qaTestCasesTable).set({
      status: nextCaseStatus,
      assignedToUserId: testCase.assignedToUserId ?? authUser.userId,
      assignedAt: testCase.assignedAt ?? new Date(),
      updatedAt: new Date(),
    } as any).where(eq(qaTestCasesTable.id, caseId));

    if (resultId) {
      await createAuditLog({
        action: "create_qa_result",
        entityType: "qa_test_result",
        entityId: resultId,
        userId: authUser.userId,
        newValues: parsed.data,
      });
    }

    res.status(201).json({ id: resultId, message: "Resultado QA registrado correctamente." });
  } catch (error) {
    res.status(500).json({ error: "InternalServerError", message: getSafeErrorMessage(error, "No se pudo guardar el resultado de QA.") });
  }
});

router.post("/evidence/upload", requireAuth, requireRole(...supportRoles), async (req, res) => {
  try {
    const request = new Request("http://local/upload", {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: Readable.toWeb(req) as any,
      duplex: "half",
    });

    const formData = await request.formData();
    const file = formData.get("file");
    if (!isUploadedFile(file)) {
      res.status(400).json({ error: "ValidationError", message: "No se ha recibido ningun archivo de evidencia." });
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      res.status(413).json({ error: "PayloadTooLarge", message: "La evidencia supera el limite de 100 MB." });
      return;
    }

    await mkdir(evidenceStoragePath, { recursive: true });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const finalName = `${Date.now()}-${safeName}`;
    const filePath = path.join(evidenceStoragePath, finalName);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, fileBuffer);

    const publicUrl = `${req.protocol}://${req.get("host")}/uploads/qa-evidence/${finalName}`;

    res.status(201).json({
      fileName: file.name,
      storedFileName: finalName,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      publicUrl,
      evidenceType: inferEvidenceType(file.type || "application/octet-stream"),
    });
  } catch (error) {
    res.status(500).json({ error: "InternalServerError", message: getSafeErrorMessage(error, "No se pudo subir la evidencia de QA.") });
  }
});

export default router;
