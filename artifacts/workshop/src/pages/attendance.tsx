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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Navigation,
  UserCog,
} from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  if (status === "on-time")
    return (
      <Badge className="bg-green-900/40 text-green-400 border-green-700 gap-1">
        <CheckCircle2 size={11} />
        {t("attendance.statusOnTime")}
      </Badge>
    );
  if (status === "late")
    return (
      <Badge className="bg-yellow-900/40 text-yellow-400 border-yellow-700 gap-1">
        <Clock size={11} />
        {t("attendance.statusLate")}
      </Badge>
    );
  if (status === "outside-zone")
    return (
      <Badge className="bg-red-900/40 text-red-400 border-red-700 gap-1">
        <AlertTriangle size={11} />
        {t("attendance.statusOutsideZone")}
      </Badge>
    );
  return (
    <Badge className="bg-blue-900/40 text-blue-400 border-blue-700 gap-1">
      <CheckCircle2 size={11} />
      {t("attendance.statusPresent")}
    </Badge>
  );
}

function TodayTab() {
  const { t } = useTranslation();
  const { data: todayList, isLoading } = useGetTodayAttendance({
    query: { refetchInterval: 30000 },
  });

  if (isLoading)
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 bg-zinc-800" />
        ))}
      </div>
    );

  const present = todayList?.filter((w) => w.hasCheckedIn) ?? [];
  const absent = todayList?.filter((w) => !w.hasCheckedIn) ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold text-white">{todayList?.length ?? 0}</div>
            <div className="text-xs text-zinc-400 mt-0.5">{t("attendance.totalWorkers")}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold text-green-400">{present.length}</div>
            <div className="text-xs text-zinc-400 mt-0.5">{t("attendance.present")}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold text-red-400">{absent.length}</div>
            <div className="text-xs text-zinc-400 mt-0.5">{t("attendance.absent")}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        {todayList?.map((w) => (
          <Card key={w.workerId} className="bg-zinc-900 border-zinc-800">
            <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    w.hasCheckedIn ? "bg-green-400" : "bg-zinc-600"
                  }`}
                />
                <span className="font-medium text-sm text-white truncate">{w.workerName}</span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {w.hasCheckedIn && w.record ? (
                  <>
                    <span className="text-xs text-zinc-400">
                      {format(new Date(w.record.checkInAt), "HH:mm")}
                    </span>
                    {w.record.distanceMeters != null && (
                      <span className="text-xs text-zinc-500 flex items-center gap-1">
                        <MapPin size={10} />
                        {w.record.distanceMeters}m
                      </span>
                    )}
                    <StatusBadge status={w.record.status} />
                  </>
                ) : (
                  <Badge variant="outline" className="text-xs text-zinc-500 border-zinc-700">
                    <XCircle size={11} className="mr-1" />
                    {t("attendance.notCheckedIn")}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
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

  const { data: records, isLoading } = useListAttendanceRecords(
    { from, to },
    { query: { staleTime: 0 } }
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="bg-zinc-800 border-zinc-700 text-white h-9 text-sm"
        />
        <span className="text-zinc-500 text-sm">→</span>
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="bg-zinc-800 border-zinc-700 text-white h-9 text-sm"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-14 bg-zinc-800" />
          ))}
        </div>
      ) : !records || records.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-6 text-center text-zinc-500 text-sm">
            {t("attendance.noRecords")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <Card key={r.id} className="bg-zinc-900 border-zinc-800">
              <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm text-white truncate">{r.workerName}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {r.checkDate} · {format(new Date(r.checkInAt), "HH:mm")}
                    {r.distanceMeters != null && (
                      <span className="ms-2 flex items-center gap-1 inline-flex">
                        <MapPin size={9} />
                        {r.distanceMeters}m
                      </span>
                    )}
                  </div>
                </div>
                <StatusBadge status={r.status} />
              </CardContent>
            </Card>
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

  const modeMutation = useUpdateWorkerAttendanceMode({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListWorkersQueryKey() });
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

  const [form, setForm] = useState({
    isActive: false,
    workStartTime: "08:00",
    graceMinutes: 15,
    locationName: "Workshop",
    locationLat: "",
    locationLng: "",
    locationRadiusMeters: 200,
  });

  useEffect(() => {
    if (!settings) return;
    setForm({
      isActive: settings.isActive,
      workStartTime: settings.workStartTime,
      graceMinutes: settings.graceMinutes,
      locationName: settings.locationName,
      locationLat: settings.locationLat != null ? String(settings.locationLat) : "",
      locationLng: settings.locationLng != null ? String(settings.locationLng) : "",
      locationRadiusMeters: settings.locationRadiusMeters,
    });
  }, [settings]);

  const [locating, setLocating] = useState(false);

  function captureMyLocation() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          locationLat: String(pos.coords.latitude.toFixed(6)),
          locationLng: String(pos.coords.longitude.toFixed(6)),
        }));
        setLocating(false);
        toast({ title: t("attendance.locationCaptured") });
      },
      () => {
        setLocating(false);
        toast({ title: t("attendance.locationDenied"), variant: "destructive" });
      },
      { enableHighAccuracy: true }
    );
  }

  function save() {
    updateMutation.mutate({
      data: {
        isActive: form.isActive,
        workStartTime: form.workStartTime,
        graceMinutes: Number(form.graceMinutes),
        locationName: form.locationName,
        locationLat: form.locationLat ? Number(form.locationLat) : null,
        locationLng: form.locationLng ? Number(form.locationLng) : null,
        locationRadiusMeters: Number(form.locationRadiusMeters),
      },
    });
  }

  function setWorkerMode(workerId: number, mode: string) {
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
          <Skeleton key={i} className="h-12 bg-zinc-800" />
        ))}
      </div>
    );

  const activeWorkers = workers?.filter((w) => w.active) ?? [];

  return (
    <div className="space-y-5">
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-5 pb-5 space-y-5">
          {/* Active toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-white">{t("attendance.systemActive")}</Label>
              <p className="text-xs text-zinc-500 mt-0.5">{t("attendance.systemActiveHint")}</p>
            </div>
            <Switch
              checked={form.isActive}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
            />
          </div>

          <div className="h-px bg-zinc-800" />

          {/* Work start time */}
          <div className="space-y-1.5">
            <Label className="text-sm text-zinc-300">{t("attendance.workStartTime")}</Label>
            <Input
              type="time"
              value={form.workStartTime}
              onChange={(e) => setForm((f) => ({ ...f, workStartTime: e.target.value }))}
              className="bg-zinc-800 border-zinc-700 text-white w-36"
            />
          </div>

          {/* Grace period */}
          <div className="space-y-1.5">
            <Label className="text-sm text-zinc-300">{t("attendance.graceMinutes")}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={120}
                value={form.graceMinutes}
                onChange={(e) => setForm((f) => ({ ...f, graceMinutes: Number(e.target.value) }))}
                className="bg-zinc-800 border-zinc-700 text-white w-24"
              />
              <span className="text-zinc-500 text-sm">{t("attendance.minutes")}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3 pt-4">
          <CardTitle className="text-sm flex items-center gap-2 text-zinc-200">
            <MapPin size={15} />
            {t("attendance.locationSettings")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pb-5">
          {/* Location name */}
          <div className="space-y-1.5">
            <Label className="text-sm text-zinc-300">{t("attendance.locationName")}</Label>
            <Input
              value={form.locationName}
              onChange={(e) => setForm((f) => ({ ...f, locationName: e.target.value }))}
              className="bg-zinc-800 border-zinc-700 text-white"
            />
          </div>

          {/* Lat / Lng */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm text-zinc-300">{t("attendance.latitude")}</Label>
              <Input
                type="number"
                step="any"
                placeholder="24.000000"
                value={form.locationLat}
                onChange={(e) => setForm((f) => ({ ...f, locationLat: e.target.value }))}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-zinc-300">{t("attendance.longitude")}</Label>
              <Input
                type="number"
                step="any"
                placeholder="46.000000"
                value={form.locationLng}
                onChange={(e) => setForm((f) => ({ ...f, locationLng: e.target.value }))}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
          </div>

          {/* Capture current location */}
          <Button
            variant="outline"
            size="sm"
            onClick={captureMyLocation}
            disabled={locating}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-2"
          >
            {locating ? <Loader2 size={13} className="animate-spin" /> : <Navigation size={13} />}
            {t("attendance.captureMyLocation")}
          </Button>

          {/* Radius */}
          <div className="space-y-1.5">
            <Label className="text-sm text-zinc-300">{t("attendance.radiusMeters")}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={10}
                max={5000}
                value={form.locationRadiusMeters}
                onChange={(e) =>
                  setForm((f) => ({ ...f, locationRadiusMeters: Number(e.target.value) }))
                }
                className="bg-zinc-800 border-zinc-700 text-white w-28"
              />
              <span className="text-zinc-500 text-sm">{t("attendance.meters")}</span>
            </div>
            <p className="text-xs text-zinc-600">
              {t("attendance.radiusHint")}
            </p>
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
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3 pt-4">
          <CardTitle className="text-sm flex items-center gap-2 text-zinc-200">
            <UserCog size={15} />
            {t("attendance.workerRules")}
          </CardTitle>
          <p className="text-xs text-zinc-500 mt-0.5">{t("attendance.workerRulesHint")}</p>
        </CardHeader>
        <CardContent className="space-y-3 pb-5">
          {workersLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 bg-zinc-800" />
              ))}
            </div>
          ) : activeWorkers.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("attendance.noWorkers")}</p>
          ) : (
            activeWorkers.map((worker) => {
              const currentMode = worker.attendanceMode ?? "required";
              return (
                <div
                  key={worker.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="text-sm text-white font-medium truncate min-w-0 flex-1">
                    {worker.name}
                  </span>
                  <div className="flex items-center rounded-lg overflow-hidden border border-zinc-700 shrink-0">
                    {modeOptions.map((opt) => {
                      const isActive = currentMode === opt.value;
                      const isBusy = modeMutation.isPending;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => !isBusy && setWorkerMode(worker.id, opt.value)}
                          disabled={isBusy}
                          className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            isActive
                              ? opt.value === "exempt"
                                ? "bg-zinc-600 text-white"
                                : opt.value === "optional"
                                ? "bg-blue-700 text-white"
                                : "bg-green-700 text-white"
                              : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
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
        <h1 className="text-xl font-bold text-white">{t("attendance.title")}</h1>
        <p className="text-zinc-400 text-sm mt-0.5">{t("attendance.subtitle")}</p>
      </div>

      <Tabs defaultValue="today">
        <TabsList className="bg-zinc-900 border border-zinc-800 w-full grid grid-cols-3">
          <TabsTrigger value="today" className="gap-1.5 data-[state=active]:bg-zinc-800">
            <Users size={13} />
            {t("attendance.tabToday")}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 data-[state=active]:bg-zinc-800">
            <History size={13} />
            {t("attendance.tabHistory")}
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5 data-[state=active]:bg-zinc-800">
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
