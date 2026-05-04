import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { buildApiUrl } from "@/lib/api-base-url";
import { CheckCircle2, ClipboardCheck, FileUp, FlaskConical, Loader2, Plus, ShieldAlert, Sparkles, TestTube2, Users } from "lucide-react";

type QaMeta = {
  technicians: Array<{ id: number; name: string; email: string; role: string }>;
  releaseStatuses: string[];
  casePriorities: string[];
  caseStatuses: string[];
  resultOutcomes: string[];
  bugSeverities: string[];
};

type QaReleaseListItem = {
  id: number;
  code: string;
  productName: string;
  versionLabel: string;
  releaseDate: string | null;
  environmentName: string | null;
  status: string;
  scopeSummary: string | null;
  releaseNotes: string | null;
  createdByUserId: number;
  createdByName: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  summary: {
    totalCases: number;
    executedCases: number;
    pendingCases: number;
    passedCases: number;
    failedCases: number;
    blockedCases: number;
    criticalFindings: number;
    highFindings: number;
    completionRate: number;
    passRate: number;
  };
};

type QaEvidence = {
  id?: number;
  resultId?: number;
  fileName: string;
  storedFileName: string;
  mimeType: string;
  fileSize: number;
  publicUrl: string;
  evidenceType: string;
  createdByUserId?: number;
  createdAt?: string;
};

type QaResult = {
  id: number;
  releaseId: number;
  caseId: number;
  executedByUserId: number;
  outcome: string;
  notes: string | null;
  actualResult: string | null;
  bugTitle: string | null;
  bugSeverity: string | null;
  executedAt: string;
  createdAt: string;
  executedByName: string | null;
  evidences: QaEvidence[];
};

type QaCase = {
  id: number;
  releaseId: number;
  sectionId: number;
  title: string;
  objective: string | null;
  stepsText: string | null;
  expectedResult: string | null;
  priority: string;
  status: string;
  assignedToUserId: number | null;
  assignedAt: string | null;
  executionOrder: number;
  createdByUserId: number;
  createdAt: string;
  updatedAt: string;
  assignedToName: string | null;
  results: QaResult[];
};

type QaSection = {
  id: number;
  releaseId: number;
  title: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  cases: QaCase[];
};

type QaReleaseDetail = {
  release: Omit<QaReleaseListItem, "summary">;
  sections: QaSection[];
  results: QaResult[];
  report: {
    totalCases: number;
    executedCases: number;
    pendingCases: number;
    passedCases: number;
    failedCases: number;
    blockedCases: number;
    criticalFindings: number;
    highFindings: number;
    completionRate: number;
    passRate: number;
    releaseStatus: string;
    generatedAt: string;
    recommendation: string;
  };
};

const releaseStatusLabels: Record<string, string> = {
  draft: "Borrador",
  active: "Activa",
  in_review: "En revision",
  approved: "Aprobada",
  rejected: "Rechazada",
  archived: "Archivada",
};

const casePriorityLabels: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Critica",
};

const caseStatusLabels: Record<string, string> = {
  pending: "Pendiente",
  assigned: "Asignada",
  in_progress: "En curso",
  passed: "Superada",
  failed: "Fallida",
  blocked: "Bloqueada",
  not_applicable: "No aplica",
};

const resultOutcomeLabels: Record<string, string> = {
  passed: "Pass",
  failed: "Fail",
  blocked: "Blocked",
  not_run: "No ejecutada",
};

const severityLabels: Record<string, string> = {
  minor: "Menor",
  medium: "Media",
  high: "Alta",
  critical: "Critica",
};

function formatDateLabel(value?: string | null, fallback = "-") {
  if (!value) return fallback;
  return format(new Date(value), "d MMM yyyy", { locale: es });
}

function formatDateTimeLabel(value?: string | null, fallback = "-") {
  if (!value) return fallback;
  return format(new Date(value), "d MMM yyyy, HH:mm", { locale: es });
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "approved":
    case "passed":
      return "border-transparent bg-emerald-100 text-emerald-800";
    case "active":
    case "assigned":
    case "in_progress":
      return "border-transparent bg-sky-100 text-sky-800";
    case "rejected":
    case "failed":
      return "border-transparent bg-rose-100 text-rose-800";
    case "blocked":
      return "border-transparent bg-amber-100 text-amber-800";
    case "draft":
    case "pending":
      return "border-transparent bg-slate-100 text-slate-700";
    default:
      return "border-transparent bg-violet-100 text-violet-800";
  }
}

async function uploadQaEvidenceFiles(files: File[]) {
  const uploaded: QaEvidence[] = [];

  for (const file of files) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(buildApiUrl("/api/qa/evidence/upload"), {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.message || `No se pudo subir ${file.name}.`);
    }

    uploaded.push(payload as QaEvidence);
  }

  return uploaded;
}

export default function QaPage() {
  const { data: user } = useGetMe();
  const queryClient = useQueryClient();
  const [selectedReleaseId, setSelectedReleaseId] = useState<number | null>(null);
  const [createReleaseOpen, setCreateReleaseOpen] = useState(false);
  const [createSectionOpen, setCreateSectionOpen] = useState(false);
  const [createCaseOpen, setCreateCaseOpen] = useState(false);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [selectedCase, setSelectedCase] = useState<QaCase | null>(null);
  const [selectedEvidenceFiles, setSelectedEvidenceFiles] = useState<File[]>([]);
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<number, string>>({});
  const [releaseForm, setReleaseForm] = useState({
    code: "",
    productName: "",
    versionLabel: "",
    releaseDate: "",
    environmentName: "preproduccion",
    status: "draft",
    scopeSummary: "",
    releaseNotes: "",
  });
  const [sectionForm, setSectionForm] = useState({
    title: "",
    description: "",
    sortOrder: "0",
  });
  const [caseForm, setCaseForm] = useState({
    title: "",
    objective: "",
    stepsText: "",
    expectedResult: "",
    priority: "medium",
    executionOrder: "0",
  });
  const [resultForm, setResultForm] = useState({
    outcome: "passed",
    notes: "",
    actualResult: "",
    bugTitle: "",
    bugSeverity: "medium",
  });
  const [releaseStatusDraft, setReleaseStatusDraft] = useState("draft");

  const metaQuery = useQuery({
    queryKey: ["qa-meta"],
    queryFn: () => customFetch<QaMeta>("/api/qa/meta", { method: "GET" }),
  });

  const releasesQuery = useQuery({
    queryKey: ["qa-releases"],
    queryFn: () => customFetch<{ data: QaReleaseListItem[] }>("/api/qa/releases", { method: "GET" }),
  });

  const detailQuery = useQuery({
    queryKey: ["qa-release-detail", selectedReleaseId],
    queryFn: () => customFetch<QaReleaseDetail>(`/api/qa/releases/${selectedReleaseId}`, { method: "GET" }),
    enabled: !!selectedReleaseId,
  });

  useEffect(() => {
    const releases = releasesQuery.data?.data ?? [];
    if (releases.length > 0 && !selectedReleaseId) {
      setSelectedReleaseId(releases[0].id);
    }
  }, [releasesQuery.data, selectedReleaseId]);

  useEffect(() => {
    if (!detailQuery.data) return;
    setReleaseStatusDraft(detailQuery.data.release.status);
    const nextDrafts = Object.fromEntries(
      detailQuery.data.sections.flatMap((section) =>
        section.cases.map((item) => [item.id, item.assignedToUserId ? String(item.assignedToUserId) : "unassigned"]),
      ),
    );
    setAssignmentDrafts(nextDrafts);
  }, [detailQuery.data]);

  const createReleaseMutation = useMutation({
    mutationFn: async () =>
      customFetch("/api/qa/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...releaseForm,
          releaseDate: releaseForm.releaseDate ? new Date(`${releaseForm.releaseDate}T00:00:00`).toISOString() : null,
          scopeSummary: releaseForm.scopeSummary || null,
          releaseNotes: releaseForm.releaseNotes || null,
        }),
      }),
    onSuccess: async () => {
      toast({ title: "Release QA creada", description: "La release ya aparece en la bandeja de QA." });
      setCreateReleaseOpen(false);
      setReleaseForm({
        code: "",
        productName: "",
        versionLabel: "",
        releaseDate: "",
        environmentName: "preproduccion",
        status: "draft",
        scopeSummary: "",
        releaseNotes: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["qa-releases"] });
    },
    onError: (error) => {
      toast({
        title: "No se pudo crear la release QA",
        description: error instanceof Error ? error.message : "Intentalo de nuevo.",
        variant: "destructive",
      });
    },
  });

  const updateReleaseMutation = useMutation({
    mutationFn: async () =>
      customFetch(`/api/qa/releases/${selectedReleaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: releaseStatusDraft }),
      }),
    onSuccess: async () => {
      toast({ title: "Estado actualizado", description: "La release QA ya refleja su nuevo estado." });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["qa-releases"] }),
        queryClient.invalidateQueries({ queryKey: ["qa-release-detail", selectedReleaseId] }),
      ]);
    },
    onError: (error) => {
      toast({
        title: "No se pudo actualizar la release",
        description: error instanceof Error ? error.message : "Intentalo de nuevo.",
        variant: "destructive",
      });
    },
  });

  const createSectionMutation = useMutation({
    mutationFn: async () =>
      customFetch(`/api/qa/releases/${selectedReleaseId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: sectionForm.title,
          description: sectionForm.description || null,
          sortOrder: Number(sectionForm.sortOrder || "0"),
        }),
      }),
    onSuccess: async () => {
      toast({ title: "Bloque creado", description: "Ya puedes repartir casos dentro de este bloque QA." });
      setCreateSectionOpen(false);
      setSectionForm({ title: "", description: "", sortOrder: "0" });
      await queryClient.invalidateQueries({ queryKey: ["qa-release-detail", selectedReleaseId] });
    },
    onError: (error) => {
      toast({
        title: "No se pudo crear el bloque",
        description: error instanceof Error ? error.message : "Intentalo de nuevo.",
        variant: "destructive",
      });
    },
  });

  const createCaseMutation = useMutation({
    mutationFn: async () =>
      customFetch(`/api/qa/sections/${selectedSectionId}/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: caseForm.title,
          objective: caseForm.objective || null,
          stepsText: caseForm.stepsText || null,
          expectedResult: caseForm.expectedResult || null,
          priority: caseForm.priority,
          executionOrder: Number(caseForm.executionOrder || "0"),
        }),
      }),
    onSuccess: async () => {
      toast({ title: "Caso creado", description: "El caso de prueba ya forma parte de la release." });
      setCreateCaseOpen(false);
      setCaseForm({
        title: "",
        objective: "",
        stepsText: "",
        expectedResult: "",
        priority: "medium",
        executionOrder: "0",
      });
      await queryClient.invalidateQueries({ queryKey: ["qa-release-detail", selectedReleaseId] });
    },
    onError: (error) => {
      toast({
        title: "No se pudo crear el caso",
        description: error instanceof Error ? error.message : "Intentalo de nuevo.",
        variant: "destructive",
      });
    },
  });

  const assignCaseMutation = useMutation({
    mutationFn: async ({ caseId, assignedToUserId }: { caseId: number; assignedToUserId: string }) =>
      customFetch(`/api/qa/cases/${caseId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedToUserId: assignedToUserId === "unassigned" ? null : Number(assignedToUserId),
        }),
      }),
    onSuccess: async () => {
      toast({ title: "Asignacion guardada", description: "El caso ya aparece en la carga del tecnico seleccionado." });
      await queryClient.invalidateQueries({ queryKey: ["qa-release-detail", selectedReleaseId] });
    },
    onError: (error) => {
      toast({
        title: "No se pudo asignar el caso",
        description: error instanceof Error ? error.message : "Intentalo de nuevo.",
        variant: "destructive",
      });
    },
  });

  const takeCaseMutation = useMutation({
    mutationFn: async (caseId: number) =>
      customFetch(`/api/qa/cases/${caseId}/take`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    onSuccess: async () => {
      toast({ title: "Caso tomado", description: "El caso ya queda reservado en tu bandeja de QA." });
      await queryClient.invalidateQueries({ queryKey: ["qa-release-detail", selectedReleaseId] });
    },
    onError: (error) => {
      toast({
        title: "No se pudo tomar el caso",
        description: error instanceof Error ? error.message : "Intentalo de nuevo.",
        variant: "destructive",
      });
    },
  });

  const createResultMutation = useMutation({
    mutationFn: async () => {
      const uploadedEvidence = await uploadQaEvidenceFiles(selectedEvidenceFiles);
      return customFetch(`/api/qa/cases/${selectedCase?.id}/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome: resultForm.outcome,
          notes: resultForm.notes || null,
          actualResult: resultForm.actualResult || null,
          bugTitle: resultForm.outcome === "failed" || resultForm.outcome === "blocked" ? resultForm.bugTitle || null : null,
          bugSeverity: resultForm.outcome === "failed" || resultForm.outcome === "blocked" ? resultForm.bugSeverity || null : null,
          evidences: uploadedEvidence,
        }),
      });
    },
    onSuccess: async () => {
      toast({ title: "Resultado registrado", description: "La ejecucion QA ya queda guardada con su evidencia." });
      setResultDialogOpen(false);
      setSelectedCase(null);
      setSelectedEvidenceFiles([]);
      setResultForm({
        outcome: "passed",
        notes: "",
        actualResult: "",
        bugTitle: "",
        bugSeverity: "medium",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["qa-release-detail", selectedReleaseId] }),
        queryClient.invalidateQueries({ queryKey: ["qa-releases"] }),
      ]);
    },
    onError: (error) => {
      toast({
        title: "No se pudo registrar el resultado QA",
        description: error instanceof Error ? error.message : "Intentalo de nuevo.",
        variant: "destructive",
      });
    },
  });

  const releases = releasesQuery.data?.data ?? [];
  const detail = detailQuery.data;
  const summary = detail?.report;
  const failedResults = useMemo(
    () => (detail?.results ?? []).filter((item) => item.outcome === "failed" || item.outcome === "blocked"),
    [detail],
  );
  const totalEvidence = useMemo(
    () => (detail?.results ?? []).reduce((sum, result) => sum + result.evidences.length, 0),
    [detail],
  );

  function openCreateCase(sectionId: number) {
    setSelectedSectionId(sectionId);
    setCreateCaseOpen(true);
  }

  function openResultDialog(testCase: QaCase) {
    setSelectedCase(testCase);
    setSelectedEvidenceFiles([]);
    setResultForm({
      outcome: "passed",
      notes: "",
      actualResult: "",
      bugTitle: "",
      bugSeverity: "medium",
    });
    setResultDialogOpen(true);
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-fuchsia-50/60 p-8 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-700">
              <FlaskConical className="h-3.5 w-3.5" />
              QA moderno
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">QA</h1>
              <p className="mt-1 max-w-3xl text-slate-500">
                Centraliza campañas de testing, reparte casos entre técnicos, conserva evidencias y genera un histórico claro para cada release.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Releases</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{releases.length}</p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Cobertura</p>
              <p className="mt-2 text-3xl font-semibold text-sky-700">{summary?.completionRate ?? 0}%</p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Hallazgos</p>
              <p className="mt-2 text-3xl font-semibold text-rose-600">{summary?.failedCases ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Evidencias</p>
              <p className="mt-2 text-3xl font-semibold text-fuchsia-700">{totalEvidence}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="rounded-[1.75rem] border-slate-200/80 shadow-lg shadow-slate-200/40">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Releases QA</CardTitle>
              <CardDescription>Campañas de testing con su histórico y cobertura.</CardDescription>
            </div>
            <Button className="gap-2" onClick={() => setCreateReleaseOpen(true)}>
              <Plus className="h-4 w-4" />
              Nueva
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {releasesQuery.isLoading ? (
              <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-slate-500">Cargando releases...</div>
            ) : releases.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-slate-500">Todavia no hay campanas QA creadas.</div>
            ) : (
              releases.map((release) => {
                const isActive = release.id === selectedReleaseId;
                return (
                  <button
                    key={release.id}
                    type="button"
                    onClick={() => setSelectedReleaseId(release.id)}
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition ${isActive ? "border-fuchsia-300 bg-fuchsia-50/70 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{release.code}</p>
                        <h3 className="mt-2 text-base font-semibold text-slate-950">{release.productName}</h3>
                        <p className="mt-1 text-sm text-slate-500">{release.versionLabel} · {release.environmentName || "preproduccion"}</p>
                      </div>
                      <Badge variant="outline" className={statusBadgeClass(release.status)}>
                        {releaseStatusLabels[release.status] ?? release.status}
                      </Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-xl bg-slate-50 px-2 py-2">
                        <p className="font-semibold text-slate-900">{release.summary.totalCases}</p>
                        <p className="text-slate-500">Casos</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-2 py-2">
                        <p className="font-semibold text-slate-900">{release.summary.completionRate}%</p>
                        <p className="text-slate-500">Cobertura</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-2 py-2">
                        <p className="font-semibold text-slate-900">{release.summary.failedCases}</p>
                        <p className="text-slate-500">Fallos</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-400">Fecha objetivo: {formatDateLabel(release.releaseDate, "Sin fecha")}</p>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        {!selectedReleaseId || detailQuery.isLoading || !detail ? (
          <Card className="rounded-[1.75rem] border-slate-200/80 shadow-lg shadow-slate-200/40">
            <CardContent className="flex min-h-[420px] items-center justify-center p-10 text-center text-slate-500">
              {detailQuery.isLoading ? "Cargando release QA..." : "Selecciona una release de QA para empezar a trabajar."}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card className="rounded-[1.75rem] border-slate-200/80 shadow-lg shadow-slate-200/40">
              <CardHeader className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="outline" className="border-transparent bg-slate-100 text-slate-700">{detail.release.code}</Badge>
                    <Badge variant="outline" className={statusBadgeClass(detail.release.status)}>
                      {releaseStatusLabels[detail.release.status] ?? detail.release.status}
                    </Badge>
                  </div>
                  <div>
                    <CardTitle className="text-3xl tracking-tight">{detail.release.productName}</CardTitle>
                    <CardDescription className="mt-2 text-base">
                      {detail.release.versionLabel} · {detail.release.environmentName || "preproduccion"} · Creada por {detail.release.createdByName || "equipo QA"}
                    </CardDescription>
                  </div>
                  <p className="max-w-3xl text-sm leading-6 text-slate-600">
                    {detail.release.scopeSummary || "Define aqui el alcance funcional de la release y las areas que deben revisarse en esta campana de QA."}
                  </p>
                </div>

                <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="space-y-2">
                    <Label>Estado de release</Label>
                    <Select value={releaseStatusDraft} onValueChange={setReleaseStatusDraft}>
                      <SelectTrigger className="w-[220px] bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {metaQuery.data?.releaseStatuses.map((status) => (
                          <SelectItem key={status} value={status}>{releaseStatusLabels[status] ?? status}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={() => updateReleaseMutation.mutate()} disabled={updateReleaseMutation.isPending} className="gap-2">
                    {updateReleaseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Guardar estado
                  </Button>
                  <p className="text-xs text-slate-500">Ultima actualizacion: {formatDateTimeLabel(detail.release.updatedAt)}</p>
                </div>
              </CardHeader>
            </Card>

            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
                <TabsTrigger value="overview">Resumen</TabsTrigger>
                <TabsTrigger value="plan">Plan de pruebas</TabsTrigger>
                <TabsTrigger value="findings">Hallazgos</TabsTrigger>
                <TabsTrigger value="report">Informe</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <div className="grid gap-4 md:grid-cols-4">
                  <Card className="border-0 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white/70">Casos</p>
                          <p className="mt-2 text-3xl font-bold">{summary?.totalCases ?? 0}</p>
                        </div>
                        <ClipboardCheck className="h-8 w-8 text-white/70" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-0 bg-gradient-to-br from-sky-500 to-sky-600 text-white shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white/70">Cobertura</p>
                          <p className="mt-2 text-3xl font-bold">{summary?.completionRate ?? 0}%</p>
                        </div>
                        <TestTube2 className="h-8 w-8 text-white/70" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-0 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white/70">Pass rate</p>
                          <p className="mt-2 text-3xl font-bold">{summary?.passRate ?? 0}%</p>
                        </div>
                        <CheckCircle2 className="h-8 w-8 text-white/70" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-0 bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white/70">Bloqueos y fallos</p>
                          <p className="mt-2 text-3xl font-bold">{(summary?.failedCases ?? 0) + (summary?.blockedCases ?? 0)}</p>
                        </div>
                        <ShieldAlert className="h-8 w-8 text-white/70" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
                  <Card className="rounded-[1.75rem] border-slate-200/80 shadow-sm">
                    <CardHeader>
                      <CardTitle>Alcance y notas de release</CardTitle>
                      <CardDescription>Contexto funcional y acuerdos de validacion.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Release notes</p>
                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{detail.release.releaseNotes || "Aun no se han documentado notas de release para esta campana."}</p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Fecha objetivo</p>
                          <p className="mt-2 font-semibold text-slate-900">{formatDateLabel(detail.release.releaseDate, "Sin fecha")}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Entorno</p>
                          <p className="mt-2 font-semibold text-slate-900">{detail.release.environmentName || "Preproduccion"}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Evidencias</p>
                          <p className="mt-2 font-semibold text-slate-900">{totalEvidence}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-[1.75rem] border-slate-200/80 shadow-sm">
                    <CardHeader>
                      <CardTitle>Equipo QA</CardTitle>
                      <CardDescription>Tecnicos disponibles para repartirse la release.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {(metaQuery.data?.technicians ?? []).map((tech) => (
                        <div key={tech.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 rounded-full bg-slate-100 p-2">
                              <Users className="h-4 w-4 text-slate-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900">{tech.name}</p>
                              <p className="text-sm text-slate-500">{tech.email}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="plan" className="space-y-6">
                <div className="flex flex-wrap gap-3">
                  <Button className="gap-2" onClick={() => setCreateSectionOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Nuevo bloque
                  </Button>
                </div>

                {detail.sections.length === 0 ? (
                  <Card><CardContent className="p-10 text-center text-slate-500">Aun no hay bloques definidos para esta release QA.</CardContent></Card>
                ) : (
                  detail.sections.map((section) => (
                    <Card key={section.id} className="rounded-[1.75rem] border-slate-200/80 shadow-sm">
                      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <CardTitle>{section.title}</CardTitle>
                          <CardDescription>{section.description || "Bloque funcional sin descripcion adicional."}</CardDescription>
                        </div>
                        <Button variant="outline" className="gap-2" onClick={() => openCreateCase(section.id)}>
                          <Plus className="h-4 w-4" />
                          Anadir caso
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {section.cases.length === 0 ? (
                          <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-slate-500">Todavia no hay casos en este bloque.</div>
                        ) : (
                          section.cases.map((testCase) => {
                            const latestResult = testCase.results[0] ?? null;
                            const canTake = !testCase.assignedToUserId || testCase.assignedToUserId === user?.id;
                            return (
                              <div key={testCase.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                  <div className="min-w-0 flex-1 space-y-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge variant="outline" className={statusBadgeClass(testCase.status)}>
                                        {caseStatusLabels[testCase.status] ?? testCase.status}
                                      </Badge>
                                      <Badge variant="outline" className="border-transparent bg-slate-100 text-slate-700">
                                        Prioridad {casePriorityLabels[testCase.priority] ?? testCase.priority}
                                      </Badge>
                                      {latestResult && (
                                        <Badge variant="outline" className={statusBadgeClass(latestResult.outcome)}>
                                          {resultOutcomeLabels[latestResult.outcome] ?? latestResult.outcome}
                                        </Badge>
                                      )}
                                    </div>
                                    <div>
                                      <h3 className="text-lg font-semibold text-slate-950">{testCase.title}</h3>
                                      <p className="mt-1 text-sm text-slate-500">Orden {testCase.executionOrder} · Asignada a {testCase.assignedToName || "nadie"}</p>
                                    </div>
                                    {testCase.objective && (
                                      <p className="text-sm leading-6 text-slate-600"><span className="font-medium text-slate-900">Objetivo:</span> {testCase.objective}</p>
                                    )}
                                    {testCase.stepsText && (
                                      <p className="whitespace-pre-line text-sm leading-6 text-slate-600"><span className="font-medium text-slate-900">Pasos:</span> {`\n${testCase.stepsText}`}</p>
                                    )}
                                    {testCase.expectedResult && (
                                      <p className="whitespace-pre-line text-sm leading-6 text-slate-600"><span className="font-medium text-slate-900">Esperado:</span> {`\n${testCase.expectedResult}`}</p>
                                    )}
                                    {latestResult && (
                                      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                                        <p className="font-medium text-slate-900">Ultimo resultado</p>
                                        <p className="mt-2"><span className="font-medium text-slate-900">Ejecutado por:</span> {latestResult.executedByName || "Equipo QA"}</p>
                                        <p className="mt-1"><span className="font-medium text-slate-900">Fecha:</span> {formatDateTimeLabel(latestResult.executedAt)}</p>
                                        {latestResult.notes && <p className="mt-2 whitespace-pre-line">{latestResult.notes}</p>}
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex w-full flex-col gap-3 xl:w-[260px]">
                                    <div className="space-y-2">
                                      <Label>Tecnico asignado</Label>
                                      <Select
                                        value={assignmentDrafts[testCase.id] || "unassigned"}
                                        onValueChange={(value) => setAssignmentDrafts((current) => ({ ...current, [testCase.id]: value }))}
                                      >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="unassigned">Sin asignar</SelectItem>
                                          {(metaQuery.data?.technicians ?? []).map((tech) => (
                                            <SelectItem key={tech.id} value={String(tech.id)}>{tech.name}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <Button
                                      variant="outline"
                                      onClick={() => assignCaseMutation.mutate({ caseId: testCase.id, assignedToUserId: assignmentDrafts[testCase.id] || "unassigned" })}
                                      disabled={assignCaseMutation.isPending}
                                    >
                                      Guardar asignacion
                                    </Button>
                                    <Button
                                      variant="outline"
                                      onClick={() => takeCaseMutation.mutate(testCase.id)}
                                      disabled={takeCaseMutation.isPending || !canTake}
                                    >
                                      Tomar prueba
                                    </Button>
                                    <Button onClick={() => openResultDialog(testCase)} className="gap-2">
                                      <FileUp className="h-4 w-4" />
                                      Registrar resultado
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="findings" className="space-y-6">
                {failedResults.length === 0 ? (
                  <Card><CardContent className="p-10 text-center text-slate-500">No hay incidencias registradas para esta release QA.</CardContent></Card>
                ) : (
                  failedResults.map((result) => (
                    <Card key={result.id} className="rounded-[1.75rem] border-slate-200/80 shadow-sm">
                      <CardHeader>
                        <div className="flex flex-wrap items-center gap-3">
                          <Badge variant="outline" className={statusBadgeClass(result.outcome)}>
                            {resultOutcomeLabels[result.outcome] ?? result.outcome}
                          </Badge>
                          {result.bugSeverity && (
                            <Badge variant="outline" className="border-transparent bg-rose-100 text-rose-700">
                              Severidad {severityLabels[result.bugSeverity] ?? result.bugSeverity}
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-xl">{result.bugTitle || "Incidencia QA sin titulo"}</CardTitle>
                        <CardDescription>
                          Ejecutado por {result.executedByName || "equipo QA"} el {formatDateTimeLabel(result.executedAt)}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {result.actualResult && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Resultado real</p>
                            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{result.actualResult}</p>
                          </div>
                        )}
                        {result.notes && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Notas</p>
                            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{result.notes}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Evidencias</p>
                          {result.evidences.length === 0 ? (
                            <p className="mt-2 text-sm text-slate-500">No se adjuntaron evidencias en esta ejecucion.</p>
                          ) : (
                            <div className="mt-3 flex flex-wrap gap-3">
                              {result.evidences.map((evidence) => (
                                <a
                                  key={evidence.storedFileName}
                                  href={evidence.publicUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:border-slate-300 hover:bg-white"
                                >
                                  {evidence.fileName}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="report" className="space-y-6">
                <Card className="rounded-[1.75rem] border-slate-200/80 shadow-sm">
                  <CardHeader>
                    <CardTitle>Informe ejecutivo de release</CardTitle>
                    <CardDescription>Historico consultable para gerencia y seguimiento de calidad.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Total ejecutado</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-950">{summary?.executedCases ?? 0} / {summary?.totalCases ?? 0}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Pass rate</p>
                        <p className="mt-2 text-2xl font-semibold text-emerald-700">{summary?.passRate ?? 0}%</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Criticos</p>
                        <p className="mt-2 text-2xl font-semibold text-rose-700">{summary?.criticalFindings ?? 0}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Bloqueados</p>
                        <p className="mt-2 text-2xl font-semibold text-amber-700">{summary?.blockedCases ?? 0}</p>
                      </div>
                    </div>

                    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Recomendacion</p>
                      <p className="mt-3 text-base leading-7 text-slate-800">{summary?.recommendation}</p>
                      <p className="mt-4 text-xs text-slate-500">Informe generado el {formatDateTimeLabel(summary?.generatedAt)}</p>
                    </div>

                    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Detalle resumido</p>
                      <ul className="mt-4 space-y-3 text-sm text-slate-700">
                        <li>Release: <span className="font-medium">{detail.release.productName} {detail.release.versionLabel}</span></li>
                        <li>Entorno validado: <span className="font-medium">{detail.release.environmentName || "preproduccion"}</span></li>
                        <li>Cobertura completada: <span className="font-medium">{summary?.completionRate ?? 0}%</span></li>
                        <li>Casos superados: <span className="font-medium">{summary?.passedCases ?? 0}</span></li>
                        <li>Casos fallidos: <span className="font-medium">{summary?.failedCases ?? 0}</span></li>
                        <li>Evidencias almacenadas: <span className="font-medium">{totalEvidence}</span></li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      <Dialog open={createReleaseOpen} onOpenChange={setCreateReleaseOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nueva release QA</DialogTitle>
            <DialogDescription>Abre una nueva campana de testing y deja su alcance definido desde el inicio.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Codigo</Label>
              <Input value={releaseForm.code} onChange={(event) => setReleaseForm((current) => ({ ...current, code: event.target.value }))} placeholder="REL-2026-05-A" />
            </div>
            <div className="space-y-2">
              <Label>Version</Label>
              <Input value={releaseForm.versionLabel} onChange={(event) => setReleaseForm((current) => ({ ...current, versionLabel: event.target.value }))} placeholder="v2026.05.1" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Producto / aplicacion</Label>
              <Input value={releaseForm.productName} onChange={(event) => setReleaseForm((current) => ({ ...current, productName: event.target.value }))} placeholder="Bridge Desktop" />
            </div>
            <div className="space-y-2">
              <Label>Fecha objetivo</Label>
              <Input type="date" value={releaseForm.releaseDate} onChange={(event) => setReleaseForm((current) => ({ ...current, releaseDate: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Entorno</Label>
              <Input value={releaseForm.environmentName} onChange={(event) => setReleaseForm((current) => ({ ...current, environmentName: event.target.value }))} placeholder="preproduccion" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Alcance</Label>
              <Textarea value={releaseForm.scopeSummary} onChange={(event) => setReleaseForm((current) => ({ ...current, scopeSummary: event.target.value }))} className="min-h-[100px]" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Notas de release</Label>
              <Textarea value={releaseForm.releaseNotes} onChange={(event) => setReleaseForm((current) => ({ ...current, releaseNotes: event.target.value }))} className="min-h-[120px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateReleaseOpen(false)}>Cancelar</Button>
            <Button onClick={() => createReleaseMutation.mutate()} disabled={createReleaseMutation.isPending}>
              {createReleaseMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Crear release
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createSectionOpen} onOpenChange={setCreateSectionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo bloque de pruebas</DialogTitle>
            <DialogDescription>Agrupa los casos por area funcional para repartir mejor el testing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Titulo</Label>
              <Input value={sectionForm.title} onChange={(event) => setSectionForm((current) => ({ ...current, title: event.target.value }))} placeholder="Login y acceso" />
            </div>
            <div className="space-y-2">
              <Label>Descripcion</Label>
              <Textarea value={sectionForm.description} onChange={(event) => setSectionForm((current) => ({ ...current, description: event.target.value }))} className="min-h-[100px]" />
            </div>
            <div className="space-y-2">
              <Label>Orden</Label>
              <Input value={sectionForm.sortOrder} onChange={(event) => setSectionForm((current) => ({ ...current, sortOrder: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateSectionOpen(false)}>Cancelar</Button>
            <Button onClick={() => createSectionMutation.mutate()} disabled={createSectionMutation.isPending}>
              {createSectionMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Crear bloque
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createCaseOpen} onOpenChange={setCreateCaseOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nuevo caso de prueba</DialogTitle>
            <DialogDescription>Define pasos y resultado esperado para que el equipo ejecute la prueba con criterio comun.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Titulo</Label>
              <Input value={caseForm.title} onChange={(event) => setCaseForm((current) => ({ ...current, title: event.target.value }))} placeholder="Validar inicio de sesion con usuario activo" />
            </div>
            <div className="space-y-2">
              <Label>Prioridad</Label>
              <Select value={caseForm.priority} onValueChange={(value) => setCaseForm((current) => ({ ...current, priority: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(metaQuery.data?.casePriorities ?? ["low", "medium", "high", "critical"]).map((priority) => (
                    <SelectItem key={priority} value={priority}>{casePriorityLabels[priority] ?? priority}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Orden</Label>
              <Input value={caseForm.executionOrder} onChange={(event) => setCaseForm((current) => ({ ...current, executionOrder: event.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Objetivo</Label>
              <Textarea value={caseForm.objective} onChange={(event) => setCaseForm((current) => ({ ...current, objective: event.target.value }))} className="min-h-[90px]" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Pasos</Label>
              <Textarea value={caseForm.stepsText} onChange={(event) => setCaseForm((current) => ({ ...current, stepsText: event.target.value }))} className="min-h-[120px]" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Resultado esperado</Label>
              <Textarea value={caseForm.expectedResult} onChange={(event) => setCaseForm((current) => ({ ...current, expectedResult: event.target.value }))} className="min-h-[120px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateCaseOpen(false)}>Cancelar</Button>
            <Button onClick={() => createCaseMutation.mutate()} disabled={createCaseMutation.isPending}>
              {createCaseMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Crear caso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registrar resultado QA</DialogTitle>
            <DialogDescription>{selectedCase?.title}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Resultado</Label>
              <Select value={resultForm.outcome} onValueChange={(value) => setResultForm((current) => ({ ...current, outcome: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(metaQuery.data?.resultOutcomes ?? ["passed", "failed", "blocked", "not_run"]).map((outcome) => (
                    <SelectItem key={outcome} value={outcome}>{resultOutcomeLabels[outcome] ?? outcome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(resultForm.outcome === "failed" || resultForm.outcome === "blocked") && (
              <div className="space-y-2">
                <Label>Severidad</Label>
                <Select value={resultForm.bugSeverity} onValueChange={(value) => setResultForm((current) => ({ ...current, bugSeverity: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(metaQuery.data?.bugSeverities ?? ["minor", "medium", "high", "critical"]).map((severity) => (
                      <SelectItem key={severity} value={severity}>{severityLabels[severity] ?? severity}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {(resultForm.outcome === "failed" || resultForm.outcome === "blocked") && (
              <div className="space-y-2 md:col-span-2">
                <Label>Titulo del bug</Label>
                <Input value={resultForm.bugTitle} onChange={(event) => setResultForm((current) => ({ ...current, bugTitle: event.target.value }))} placeholder="Ej. El login no devuelve feedback de error" />
              </div>
            )}
            <div className="space-y-2 md:col-span-2">
              <Label>Resultado real</Label>
              <Textarea value={resultForm.actualResult} onChange={(event) => setResultForm((current) => ({ ...current, actualResult: event.target.value }))} className="min-h-[120px]" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Notas del tester</Label>
              <Textarea value={resultForm.notes} onChange={(event) => setResultForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-[120px]" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Capturas, videos o documentos</Label>
              <Input
                type="file"
                multiple
                onChange={(event) => setSelectedEvidenceFiles(Array.from(event.target.files ?? []))}
              />
              <p className="text-xs text-slate-500">Puedes adjuntar varias evidencias en una sola ejecucion QA.</p>
              {selectedEvidenceFiles.length > 0 && (
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                  {selectedEvidenceFiles.map((file) => (
                    <p key={`${file.name}-${file.size}`}>{file.name}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResultDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => createResultMutation.mutate()} disabled={createResultMutation.isPending}>
              {createResultMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Guardar resultado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
