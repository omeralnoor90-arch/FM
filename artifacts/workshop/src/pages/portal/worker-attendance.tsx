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
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  AlertTriangle,
  Loader2,
  Navigation,
  ShieldCheck,
} from "lucide-react";

type AttendanceStatus = "on-time" | "late" | "outside-zone" | "present";

function StatusCard({ status, checkInAt, distanceMeters }: {
  status: AttendanceStatus;
  checkInAt: string;
  distanceMeters?: number | null;
}) {
  const { t } = useTranslation();

  const config: Record<AttendanceStatus, { icon: JSX.Element; bg: string; text: string; label: string }> = {
    "on-time": {
      icon: <CheckCircle2 size={32} className="text-green-400" />,
      bg: "bg-green-900/20 border-green-800",
      text: "text-green-400",
      label: t("attendance.statusOnTime"),
    },
    late: {
      icon: <Clock size={32} className="text-yellow-400" />,
      bg: "bg-yellow-900/20 border-yellow-800",
      text: "text-yellow-400",
      label: t("attendance.statusLate"),
    },
    "outside-zone": {
      icon: <AlertTriangle size={32} className="text-red-400" />,
      bg: "bg-red-900/20 border-red-800",
      text: "text-red-400",
      label: t("attendance.statusOutsideZone"),
    },
    present: {
      icon: <CheckCircle2 size={32} className="text-blue-400" />,
      bg: "bg-blue-900/20 border-blue-800",
      text: "text-blue-400",
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
          <div className="text-zinc-400 text-sm mt-1">
            {t("attendance.checkedInAt")} {format(new Date(checkInAt), "HH:mm")}
          </div>
          {distanceMeters != null && (
            <div className="text-zinc-500 text-xs mt-1 flex items-center justify-center gap-1">
              <MapPin size={10} />
              {distanceMeters}m {t("attendance.fromWorkshop")}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CheckInButton() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [locating, setLocating] = useState(false);

  const checkInMutation = useCheckIn({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetMyTodayAttendanceQueryKey() });
        qc.invalidateQueries({ queryKey: getListMyAttendanceRecordsQueryKey() });
      },
      onError: () => {
        toast({ title: t("attendance.checkInFailed"), variant: "destructive" });
      },
    },
  });

  function doCheckIn(lat?: number, lng?: number) {
    checkInMutation.mutate({ data: { lat: lat ?? null, lng: lng ?? null } });
  }

  function handleCheckIn() {
    if (!("geolocation" in navigator)) {
      doCheckIn();
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        doCheckIn(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setLocating(false);
        toast({
          title: t("attendance.locationDenied"),
          description: t("attendance.checkingInWithoutLocation"),
        });
        doCheckIn();
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const isPending = locating || checkInMutation.isPending;

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="pt-8 pb-8 flex flex-col items-center gap-5 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center">
          <ShieldCheck size={36} className="text-primary" />
        </div>
        <div>
          <h2 className="text-white text-lg font-bold">{t("attendance.checkInTitle")}</h2>
          <p className="text-zinc-400 text-sm mt-1 max-w-xs">
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
        <p className="text-xs text-zinc-600 max-w-xs">
          {t("attendance.locationPermissionNote")}
        </p>
      </CardContent>
    </Card>
  );
}

export default function WorkerAttendance() {
  const { t } = useTranslation();

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
        <h1 className="text-white text-xl font-bold">{t("attendance.portalTitle")}</h1>
        <p className="text-zinc-400 text-sm mt-0.5">
          {new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Today status / check-in */}
      {loadingToday ? (
        <Skeleton className="h-40 bg-zinc-800" />
      ) : hasCheckedIn && todayRecord ? (
        <StatusCard
          status={(todayRecord as { status: AttendanceStatus }).status}
          checkInAt={(todayRecord as { checkInAt: string }).checkInAt}
          distanceMeters={(todayRecord as { distanceMeters?: number | null }).distanceMeters}
        />
      ) : (
        <CheckInButton />
      )}

      {/* History */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-400 mb-3">{t("attendance.historyTitle")}</h2>

        {loadingHistory ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-14 bg-zinc-800" />
            ))}
          </div>
        ) : !history || history.length === 0 ? (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-5 pb-5 text-center text-zinc-500 text-sm">
              {t("attendance.noHistory")}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {history.slice(0, 30).map((r) => (
              <Card key={r.id} className="bg-zinc-900 border-zinc-800">
                <CardContent className="py-3 px-4 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm text-white font-medium">{r.checkDate}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">
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
                    <Badge className="bg-green-900/40 text-green-400 border-green-700 text-xs gap-1">
                      <CheckCircle2 size={10} />
                      {t("attendance.statusOnTime")}
                    </Badge>
                  )}
                  {r.status === "late" && (
                    <Badge className="bg-yellow-900/40 text-yellow-400 border-yellow-700 text-xs gap-1">
                      <Clock size={10} />
                      {t("attendance.statusLate")}
                    </Badge>
                  )}
                  {r.status === "outside-zone" && (
                    <Badge className="bg-red-900/40 text-red-400 border-red-700 text-xs gap-1">
                      <AlertTriangle size={10} />
                      {t("attendance.statusOutsideZone")}
                    </Badge>
                  )}
                  {r.status === "present" && (
                    <Badge className="bg-blue-900/40 text-blue-400 border-blue-700 text-xs gap-1">
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
