import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMyTodayAttendance,
  useListMyAttendanceRecords,
  useCheckIn,
  getGetMyTodayAttendanceQueryKey,
  getListMyAttendanceRecordsQueryKey,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  AlertTriangle,
  Loader2,
  Navigation,
  ShieldCheck,
  WifiOff,
} from "lucide-react";

type AttendanceStatus = "on-time" | "late" | "outside-zone" | "present";

type CheckInError =
  | { kind: "location_denied" }
  | { kind: "outside_zone"; distanceMeters: number; radiusMeters: number }
  | { kind: "geo_unavailable" }
  | { kind: "geo_denied" }
  | { kind: "unknown" };

function StatusCard({ status, checkInAt, distanceMeters }: {
  status: AttendanceStatus;
  checkInAt: string;
  distanceMeters?: number | null;
}) {
  const { t } = useTranslation();

  const config: Record<AttendanceStatus, { icon: JSX.Element; bg: string; text: string; label: string }> = {
    "on-time": {
      icon: <CheckCircle2 size={32} className="text-green-600 dark:text-green-400" />,
      bg: "border-green-200 dark:border-green-800",
      text: "text-green-700 dark:text-green-400",
      label: t("attendance.statusOnTime"),
    },
    late: {
      icon: <Clock size={32} className="text-yellow-600 dark:text-yellow-400" />,
      bg: "border-yellow-200 dark:border-yellow-800",
      text: "text-yellow-700 dark:text-yellow-400",
      label: t("attendance.statusLate"),
    },
    "outside-zone": {
      icon: <AlertTriangle size={32} className="text-red-600 dark:text-red-400" />,
      bg: "border-red-200 dark:border-red-800",
      text: "text-red-700 dark:text-red-400",
      label: t("attendance.statusOutsideZone"),
    },
    present: {
      icon: <CheckCircle2 size={32} className="text-blue-600 dark:text-blue-400" />,
      bg: "border-blue-200 dark:border-blue-800",
      text: "text-blue-700 dark:text-blue-400",
      label: t("attendance.statusPresent"),
    },
  };

  const c = config[status] ?? config["present"];

  return (
    <Card className={`border ${c.bg}`}>
      <CardContent className="pt-6 pb-6 flex flex-col items-center gap-3 text-center">
        {c.icon}
        <div>
          <div className={`text-lg font-bold ${c.text}`}>{c.label}</div>
          <div className="text-muted-foreground text-sm mt-1">
            {t("attendance.checkedInAt")} {format(new Date(checkInAt), "HH:mm")}
          </div>
          {distanceMeters != null && (
            <div className="text-muted-foreground text-xs mt-1 flex items-center justify-center gap-1">
              <MapPin size={10} />
              {distanceMeters}m {t("attendance.fromWorkshop")}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorCard({ error, onRetry }: { error: CheckInError; onRetry: () => void }) {
  const { t } = useTranslation();

  let icon = <WifiOff size={32} className="text-red-500" />;
  let title = "";
  let desc = "";

  if (error.kind === "location_denied" || error.kind === "geo_denied") {
    icon = <MapPin size={32} className="text-red-500" />;
    title = t("attendance.locationRequiredTitle");
    desc = t("attendance.locationRequiredDesc");
  } else if (error.kind === "geo_unavailable") {
    icon = <WifiOff size={32} className="text-red-500" />;
    title = t("attendance.locationRequiredTitle");
    desc = t("attendance.locationRequiredDesc");
  } else if (error.kind === "outside_zone") {
    icon = <AlertTriangle size={32} className="text-orange-500" />;
    title = t("attendance.outsideZoneTitle");
    desc = t("attendance.outsideZoneDesc", {
      distance: error.distanceMeters,
      radius: error.radiusMeters,
    });
  } else {
    icon = <XCircle size={32} className="text-red-500" />;
    title = t("attendance.checkInFailed");
    desc = "";
  }

  return (
    <Card className="border-red-200 dark:border-red-800">
      <CardContent className="pt-6 pb-6 flex flex-col items-center gap-4 text-center">
        {icon}
        <div>
          <div className="text-base font-bold text-red-700 dark:text-red-400">{title}</div>
          {desc && <p className="text-sm text-muted-foreground mt-1 max-w-xs">{desc}</p>}
        </div>
        <Button
          variant="outline"
          onClick={onRetry}
          className="gap-2 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
        >
          <Navigation size={14} />
          {t("attendance.retryCheckIn")}
        </Button>
      </CardContent>
    </Card>
  );
}

function CheckInButton({ onError }: { onError: (e: CheckInError) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [locating, setLocating] = useState(false);

  const checkInMutation = useCheckIn({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetMyTodayAttendanceQueryKey() });
        qc.invalidateQueries({ queryKey: getListMyAttendanceRecordsQueryKey() });
      },
      onError: (err) => {
        const body = (err as { response?: { data?: { error?: string; distanceMeters?: number; radiusMeters?: number } } })?.response?.data;
        if (body?.error === "location_required") {
          onError({ kind: "location_denied" });
        } else if (body?.error === "outside_zone") {
          onError({
            kind: "outside_zone",
            distanceMeters: body.distanceMeters ?? 0,
            radiusMeters: body.radiusMeters ?? 0,
          });
        } else {
          onError({ kind: "unknown" });
        }
      },
    },
  });

  function handleCheckIn() {
    if (!("geolocation" in navigator)) {
      onError({ kind: "geo_unavailable" });
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        checkInMutation.mutate({ data: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
      },
      () => {
        setLocating(false);
        onError({ kind: "geo_denied" });
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  const isPending = locating || checkInMutation.isPending;

  return (
    <Card>
      <CardContent className="pt-8 pb-8 flex flex-col items-center gap-5 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center">
          <ShieldCheck size={36} className="text-primary" />
        </div>
        <div>
          <h2 className="text-foreground text-lg font-bold">{t("attendance.checkInTitle")}</h2>
          <p className="text-muted-foreground text-sm mt-1 max-w-xs">
            {t("attendance.checkInHint")}
          </p>
        </div>
        <Button
          size="lg"
          onClick={handleCheckIn}
          disabled={isPending}
          className="w-full max-w-xs gap-2 h-12 text-base font-semibold"
        >
          {isPending ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Navigation size={18} />
          )}
          {locating ? t("attendance.gettingLocation") : t("attendance.checkInButton")}
        </Button>
        <p className="text-xs text-muted-foreground max-w-xs">
          {t("attendance.locationPermissionNote")}
        </p>
      </CardContent>
    </Card>
  );
}

export default function WorkerAttendance() {
  const { t } = useTranslation();
  const [checkInError, setCheckInError] = useState<CheckInError | null>(null);

  const { data: todayRecord, isLoading: loadingToday } = useGetMyTodayAttendance({
    query: { retry: false, staleTime: 0, refetchOnMount: "always" as const },
  });

  const { data: history, isLoading: loadingHistory } = useListMyAttendanceRecords({
    query: { staleTime: 0, refetchOnMount: "always" as const },
  });

  const hasCheckedIn = !!todayRecord && !("error" in (todayRecord as object));

  return (
    <div className="space-y-5 pb-8">
      <div className="pt-2">
        <h1 className="text-foreground text-xl font-bold">{t("attendance.portalTitle")}</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Today status / check-in */}
      {loadingToday ? (
        <Skeleton className="h-40" />
      ) : hasCheckedIn && todayRecord ? (
        <StatusCard
          status={(todayRecord as { status: AttendanceStatus }).status}
          checkInAt={(todayRecord as { checkInAt: string }).checkInAt}
          distanceMeters={(todayRecord as { distanceMeters?: number | null }).distanceMeters}
        />
      ) : checkInError ? (
        <ErrorCard error={checkInError} onRetry={() => setCheckInError(null)} />
      ) : (
        <CheckInButton onError={setCheckInError} />
      )}

      {/* History */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">{t("attendance.historyTitle")}</h2>

        {loadingHistory ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : !history || history.length === 0 ? (
          <Card>
            <CardContent className="pt-5 pb-5 text-center text-muted-foreground text-sm">
              {t("attendance.noHistory")}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {history.slice(0, 30).map((r) => (
              <Card key={r.id}>
                <CardContent className="py-3 px-4 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm text-foreground font-medium">{r.checkDate}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(r.checkInAt), "HH:mm")}
                      {r.distanceMeters != null && (
                        <span className="ms-2 inline-flex items-center gap-1">
                          <MapPin size={9} />
                          {r.distanceMeters}m
                        </span>
                      )}
                    </div>
                  </div>
                  {r.status === "on-time" && (
                    <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-900/40 dark:text-green-400 dark:border-green-700 text-xs gap-1">
                      <CheckCircle2 size={10} />
                      {t("attendance.statusOnTime")}
                    </Badge>
                  )}
                  {r.status === "late" && (
                    <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-400 dark:border-yellow-700 text-xs gap-1">
                      <Clock size={10} />
                      {t("attendance.statusLate")}
                    </Badge>
                  )}
                  {r.status === "outside-zone" && (
                    <Badge className="bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-400 dark:border-red-700 text-xs gap-1">
                      <AlertTriangle size={10} />
                      {t("attendance.statusOutsideZone")}
                    </Badge>
                  )}
                  {r.status === "present" && (
                    <Badge className="bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-400 dark:border-blue-700 text-xs gap-1">
                      <CheckCircle2 size={10} />
                      {t("attendance.statusPresent")}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
