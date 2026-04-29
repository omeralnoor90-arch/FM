import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAttendanceSettings,
  useUpdateAttendanceSettings,
  useGetTodayAttendance,
  useListAttendanceRecords,
  useListWorkers,
  useUpdateWorkerAttendanceMode,
  useGetFailedCheckInAttempts,
  getGetAttendanceSettingsQueryKey,
  getListWorkersQueryKey,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import WorkshopLocationPicker from "@/components/WorkshopLocationPicker";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  Settings2,
  Users,
  History,
  AlertTriangle,
  Loader2,
  UserCog,
  AlertOctagon,
} from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  if (status === "on-time")
    return (
      <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-900/40 dark:text-green-400 dark:border-green-700 gap-1">
        <CheckCircle2 size={11} />
        {t("attendance.statusOnTime")}
      </Badge>
    );
  if (status === "late")
    return (
      <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-400 dark:border-yellow-700 gap-1">
        <Clock size={11} />
        {t("attendance.statusLate")}
      </Badge>
    );
  if (status === "outside-zone")
    return (
      <Badge className="bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/40 dark:text-orange-400 dark:border-orange-700 gap-1">
        <AlertTriangle size={11} />
        {t("attendance.statusOutsideZone")}
      </Badge>
    );
  if (status === "absent")
    return (
      <Badge className="bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-400 dark:border-red-700 gap-1">
        <XCircle size={11} />
        {t("attendance.statusAbsent")}
      </Badge>
    );
  return (
    <Badge className="bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-400 dark:border-blue-700 gap-1">
      <CheckCircle2 size={11} />
      {t("attendance.statusPresent")}
    </Badge>
  );
}

function rowAccent(status: string) {
  if (status === "on-time") return "border-l-green-500";
  if (status === "late") return "border-l-yellow-500";
  if (status === "outside-zone") return "border-l-orange-500";
  if (status === "absent") return "border-l-red-500";
  return "border-l-blue-500";
}

function dotColor(status: string) {
  if (status === "on-time") return "bg-green-500";
  if (status === "late") return "bg-yellow-500";
  if (status === "outside-zone") return "bg-orange-500";
  if (status === "absent") return "bg-red-500";
  return "bg-blue-500";
}

function workerStatus(w: { hasCheckedIn: boolean; record?: { status: string } | null }) {
  if (!w.hasCheckedIn) return "absent";
  return w.record?.status ?? "present";
}

const STATUS_ORDER: Record<string, number> = {
  "on-time": 0,
  present: 1,
  late: 2,
  "outside-zone": 3,
  absent: 4,
};

function TodayTab() {
  const { t } = useTranslation();
  const { data: todayList, isLoading } = useGetTodayAttendance({
    query: { refetchInterval: 30000 },
  });
  const { data: failedAttempts } = useGetFailedCheckInAttempts(
    {},
    { query: { refetchInterval: 30000 } }
  );

  if (isLoading)
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );

  const required = (todayList ?? [])
    .filter((w) => !w.attendanceMode || w.attendanceMode === "required")
    .sort((a, b) => (STATUS_ORDER[workerStatus(a)] ?? 9) - (STATUS_ORDER[workerStatus(b)] ?? 9));

  const optional = (todayList ?? []).filter((w) => w.attendanceMode === "optional");

  const onTimeCount = required.filter((w) => workerStatus(w) === "on-time").length;
  const lateCount = required.filter(
    (w) => workerStatus(w) === "late" || workerStatus(w) === "outside-zone" || workerStatus(w) === "present"
  ).length;
  const absentCount = required.filter((w) => !w.hasCheckedIn).length;

  return (
    <div className="space-y-4">
      {/* ── Failed check-in alerts ── */}
      {failedAttempts && failedAttempts.length > 0 && (
        <Card className="border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
          <CardContent className="pt-4 pb-4 space-y-2">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-semibold text-sm">
              <AlertOctagon size={15} />
              {t("attendance.failedAttempts")} ({failedAttempts.length})
            </div>
            {failedAttempts.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-md bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-3 py-2"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium text-foreground">{a.workerName}</span>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    <span>{format(new Date(a.attemptedAt), "HH:mm")}</span>
                    {a.distanceMeters != null && (
                      <span className="flex items-center gap-0.5">
                        <MapPin size={9} />
                        {a.distanceMeters}m
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs font-medium text-red-700 dark:text-red-400 shrink-0">
                  {a.reason === "location_denied"
                    ? t("attendance.reasonLocationDenied")
                    : t("attendance.reasonOutsideZone")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Summary ── */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-3 pb-3 text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{onTimeCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{t("attendance.statusOnTime")}</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="pt-3 pb-3 text-center">
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{lateCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{t("attendance.statusLate")}</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="pt-3 pb-3 text-center">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{absentCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{t("attendance.statusAbsent")}</div>
          </CardContent>
        </Card>
      </div>

      {/* ── Required workers ── */}
      <div className="space-y-1.5">
        {required.map((w) => {
          const st = workerStatus(w);
          return (
            <Card key={w.workerId} className={`border-l-4 ${rowAccent(st)}`}>
              <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor(st)}`} />
                  <span className="font-medium text-sm text-foreground truncate">{w.workerName}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {w.hasCheckedIn && w.record ? (
                    <>
                      <span className="text-xs text-muted-foreground font-mono">
                        {format(new Date(w.record.checkInAt), "HH:mm")}
                      </span>
                      {w.record.distanceMeters != null && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <MapPin size={10} />
                          {w.record.distanceMeters}m
                        </span>
                      )}
                      <StatusBadge status={w.record.status} />
                    </>
                  ) : (
                    <StatusBadge status="absent" />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Optional workers ── */}
      {optional.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
            {t("attendance.optionalSection")}
          </p>
          {optional
            .sort((a, b) => (STATUS_ORDER[workerStatus(a)] ?? 9) - (STATUS_ORDER[workerStatus(b)] ?? 9))
            .map((w) => {
              const st = workerStatus(w);
              return (
                <Card
                  key={w.workerId}
                  className={`border-l-4 ${w.hasCheckedIn ? rowAccent(st) : "border-l-border"}`}
                >
                  <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                          w.hasCheckedIn ? dotColor(st) : "bg-muted-foreground/30"
                        }`}
                      />
                      <span
                        className={`font-medium text-sm truncate ${
                          w.hasCheckedIn ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {w.workerName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {w.hasCheckedIn && w.record ? (
                        <>
                          <span className="text-xs text-muted-foreground font-mono">
                            {format(new Date(w.record.checkInAt), "HH:mm")}
                          </span>
                          <StatusBadge status={w.record.status} />
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("attendance.didNotAttend")}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}
    </div>
  );
}

function HistoryTab() {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(today);

  const { data: records, isLoading: recordsLoading } = useListAttendanceRecords(
    { from, to },
    { query: { staleTime: 0 } }
  );
  const { data: workers, isLoading: workersLoading } = useListWorkers();

  const isLoading = recordsLoading || workersLoading;

  const requiredWorkers = (workers ?? []).filter(
    (w) => w.active && w.attendanceMode !== "exempt"
  );

  const groupedByDate = (() => {
    if (!records || !workers) return [];

    const dates = [...new Set(records.map((r) => r.checkDate))].sort().reverse();

    return dates.map((date) => {
      const dayRecords = records.filter((r) => r.checkDate === date);
      const byWorker = new Map(dayRecords.map((r) => [r.workerId, r]));

      const rows = requiredWorkers.map((w) => {
        const rec = byWorker.get(w.id);
        return {
          workerId: w.id,
          workerName: w.name,
          attendanceMode: w.attendanceMode ?? "required",
          record: rec ?? null,
          status: rec ? rec.status : "absent",
        };
      });

      rows.sort(
        (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
      );

      const onTime = rows.filter((r) => r.status === "on-time").length;
      const late = rows.filter(
        (r) => r.status === "late" || r.status === "outside-zone" || r.status === "present"
      ).length;
      const absent = rows.filter((r) => r.status === "absent").length;

      return { date, rows, onTime, late, absent };
    });
  })();

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-9 text-sm"
        />
        <span className="text-muted-foreground text-sm">→</span>
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-9 text-sm"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : groupedByDate.length === 0 ? (
        <Card>
          <CardContent className="pt-6 pb-6 text-center text-muted-foreground text-sm">
            {t("attendance.noRecords")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {groupedByDate.map(({ date, rows, onTime, late, absent }) => (
            <div key={date} className="space-y-1.5">
              {/* Date header with mini summary */}
              <div className="flex items-center justify-between px-1">
                <span className="text-sm font-semibold text-foreground">{date}</span>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-green-600 dark:text-green-400 font-medium">{onTime} ✓</span>
                  {late > 0 && <span className="text-yellow-600 dark:text-yellow-400 font-medium">{late} ⏰</span>}
                  {absent > 0 && <span className="text-red-600 dark:text-red-400 font-medium">{absent} ✗</span>}
                </div>
              </div>

              {/* Worker rows */}
              {rows.map((r) => (
                <Card
                  key={r.workerId}
                  className={`border-l-4 ${rowAccent(r.status)}`}
                >
                  <CardContent className="py-2.5 px-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor(r.status)}`} />
                      <span
                        className={`font-medium text-sm truncate ${
                          r.status === "absent" ? "text-muted-foreground" : "text-foreground"
                        }`}
                      >
                        {r.workerName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {r.record ? (
                        <>
                          <span className="text-xs text-muted-foreground font-mono">
                            {format(new Date(r.record.checkInAt), "HH:mm")}
                          </span>
                          {r.record.distanceMeters != null && (
                            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                              <MapPin size={9} />
                              {r.record.distanceMeters}m
                            </span>
                          )}
                          <StatusBadge status={r.record.status} />
                        </>
                      ) : (
                        <StatusBadge status="absent" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: settings, isLoading } = useGetAttendanceSettings();
  const { data: workers, isLoading: workersLoading } = useListWorkers();

  const updateMutation = useUpdateAttendanceSettings({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetAttendanceSettingsQueryKey() });
        toast({ title: t("attendance.settingsSaved") });
      },
      onError: (err) => {
        toast({
          title: t("attendance.saveFailed"),
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      },
    },
  });

  const [optimisticModes, setOptimisticModes] = useState<Record<number, string>>({});

  const modeMutation = useUpdateWorkerAttendanceMode({
    mutation: {
      onSuccess: (_data, variables) => {
        setOptimisticModes((prev) => {
          const next = { ...prev };
          delete next[variables.id];
          return next;
        });
        qc.invalidateQueries({ queryKey: getListWorkersQueryKey() });
      },
      onError: (err, variables) => {
        setOptimisticModes((prev) => {
          const next = { ...prev };
          delete next[variables.id];
          return next;
        });
        toast({
          title: t("attendance.saveFailed"),
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      },
    },
  });

  const [form, setForm] = useState<{
    isActive: boolean;
    workStartTime: string;
    graceMinutes: number;
    locationName: string;
    locationLat: number | null;
    locationLng: number | null;
    locationRadiusMeters: number;
  }>({
    isActive: false,
    workStartTime: "08:00",
    graceMinutes: 15,
    locationName: "Workshop",
    locationLat: null,
    locationLng: null,
    locationRadiusMeters: 200,
  });

  useEffect(() => {
    if (!settings) return;
    setForm({
      isActive: settings.isActive,
      workStartTime: settings.workStartTime,
      graceMinutes: settings.graceMinutes,
      locationName: settings.locationName,
      locationLat: settings.locationLat != null ? Number(settings.locationLat) : null,
      locationLng: settings.locationLng != null ? Number(settings.locationLng) : null,
      locationRadiusMeters: settings.locationRadiusMeters,
    });
  }, [settings]);

  function save() {
    updateMutation.mutate({
      data: {
        isActive: form.isActive,
        workStartTime: form.workStartTime,
        graceMinutes: Number(form.graceMinutes),
        locationName: form.locationName,
        locationLat: form.locationLat,
        locationLng: form.locationLng,
        locationRadiusMeters: Number(form.locationRadiusMeters),
      },
    });
  }

  function setWorkerMode(workerId: number, mode: string) {
    setOptimisticModes((prev) => ({ ...prev, [workerId]: mode }));
    modeMutation.mutate({ id: workerId, data: { mode } });
  }

  const modeOptions = [
    { value: "required", label: t("attendance.modeRequired") },
    { value: "optional", label: t("attendance.modeOptional") },
    { value: "exempt", label: t("attendance.modeExempt") },
  ];

  if (isLoading)
    return (
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );

  const activeWorkers = workers?.filter((w) => w.active) ?? [];

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="pt-5 pb-5 space-y-5">
          {/* Active toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-foreground">{t("attendance.systemActive")}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t("attendance.systemActiveHint")}</p>
            </div>
            <Switch
              checked={form.isActive}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
            />
          </div>

          <div className="h-px bg-border" />

          {/* Work start time */}
          <div className="space-y-1.5">
            <Label className="text-sm text-foreground">{t("attendance.workStartTime")}</Label>
            <Input
              type="time"
              value={form.workStartTime}
              onChange={(e) => setForm((f) => ({ ...f, workStartTime: e.target.value }))}
              className="w-36"
            />
          </div>

          {/* Grace period */}
          <div className="space-y-1.5">
            <Label className="text-sm text-foreground">{t("attendance.graceMinutes")}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={120}
                value={form.graceMinutes}
                onChange={(e) => setForm((f) => ({ ...f, graceMinutes: Number(e.target.value) }))}
                className="w-24"
              />
              <span className="text-muted-foreground text-sm">{t("attendance.minutes")}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 pt-4">
          <CardTitle className="text-sm flex items-center gap-2 text-foreground">
            <MapPin size={15} />
            {t("attendance.locationSettings")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pb-5">
          {/* Location name */}
          <div className="space-y-1.5">
            <Label className="text-sm text-foreground">{t("attendance.locationName")}</Label>
            <Input
              value={form.locationName}
              onChange={(e) => setForm((f) => ({ ...f, locationName: e.target.value }))}
            />
          </div>

          {/* Interactive map */}
          <div className="space-y-1.5">
            <Label className="text-sm text-foreground">{t("attendance.mapPickerLabel")}</Label>
            <p className="text-xs text-muted-foreground">{t("attendance.mapPickerHint")}</p>
            <WorkshopLocationPicker
              lat={form.locationLat}
              lng={form.locationLng}
              radius={form.locationRadiusMeters}
              onChange={(lat, lng) => setForm((f) => ({ ...f, locationLat: lat, locationLng: lng }))}
            />
          </div>

          {/* Coordinates display */}
          {form.locationLat != null && form.locationLng != null && (
            <div className="flex gap-4 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              <span>{t("attendance.latitude")}: <span className="font-mono text-foreground">{form.locationLat.toFixed(6)}</span></span>
              <span>{t("attendance.longitude")}: <span className="font-mono text-foreground">{form.locationLng.toFixed(6)}</span></span>
            </div>
          )}

          {/* Radius slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-foreground">{t("attendance.radiusMeters")}</Label>
              <span className="text-sm font-semibold tabular-nums">
                {form.locationRadiusMeters} {t("attendance.meters")}
              </span>
            </div>
            <Slider
              min={25}
              max={2000}
              step={25}
              value={[form.locationRadiusMeters]}
              onValueChange={([v]) => setForm((f) => ({ ...f, locationRadiusMeters: v }))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>25 m</span>
              <span>2 000 m</span>
            </div>
            <p className="text-xs text-muted-foreground">{t("attendance.radiusHint")}</p>
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={save}
        disabled={updateMutation.isPending}
        className="w-full"
        style={{ background: "#FF3C00", color: "#fff" }}
      >
        {updateMutation.isPending ? (
          <Loader2 size={14} className="animate-spin me-2" />
        ) : null}
        {t("attendance.saveSettings")}
      </Button>

      {/* ── Worker Attendance Rules ─────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3 pt-4">
          <CardTitle className="text-sm flex items-center gap-2 text-foreground">
            <UserCog size={15} />
            {t("attendance.workerRules")}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{t("attendance.workerRulesHint")}</p>
        </CardHeader>
        <CardContent className="space-y-3 pb-5">
          {workersLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : activeWorkers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("attendance.noWorkers")}</p>
          ) : (
            activeWorkers.map((worker) => {
              const currentMode =
                optimisticModes[worker.id] ?? worker.attendanceMode ?? "required";
              return (
                <div
                  key={worker.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="text-sm text-foreground font-medium truncate min-w-0 flex-1">
                    {worker.name}
                  </span>
                  <div className="flex items-center rounded-lg overflow-hidden border border-border shrink-0">
                    {modeOptions.map((opt) => {
                      const isActive = currentMode === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setWorkerMode(worker.id, opt.value)}
                          className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            isActive
                              ? opt.value === "exempt"
                                ? "bg-muted text-foreground"
                                : opt.value === "optional"
                                ? "bg-blue-600 text-white"
                                : "bg-green-600 text-white"
                              : "bg-background text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AttendancePage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 pb-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">{t("attendance.title")}</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{t("attendance.subtitle")}</p>
      </div>

      <Tabs defaultValue="today">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="today" className="gap-1.5">
            <Users size={13} />
            {t("attendance.tabToday")}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History size={13} />
            {t("attendance.tabHistory")}
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <Settings2 size={13} />
            {t("attendance.tabSettings")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-4">
          <TodayTab />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryTab />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
