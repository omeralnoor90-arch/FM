import { useAuth } from "@/contexts/auth-context";
import { useListJobs } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Briefcase, Clock, CheckCircle2, XCircle } from "lucide-react";

function StatusBadge({ status }: { status?: string }) {
  const { t } = useTranslation();
  if (status === "pending") {
    return (
      <Badge variant="outline" className="text-xs border-yellow-600 text-yellow-400 bg-yellow-900/20 gap-1">
        <Clock size={10} />
        {t("portal.statusPending")}
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge variant="outline" className="text-xs border-red-700 text-red-400 bg-red-900/20 gap-1">
        <XCircle size={10} />
        {t("portal.statusRejected")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs border-green-700 text-green-400 bg-green-900/20 gap-1">
      <CheckCircle2 size={10} />
      {t("portal.statusApproved")}
    </Badge>
  );
}

export default function WorkerJobs() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const workerId = user?.workerId;

  const { data: jobs, isLoading } = useListJobs(
    { workerId: workerId ?? undefined, status: "all" },
    { query: { enabled: !!workerId, staleTime: 0, refetchOnMount: "always" as const } },
  );

  return (
    <div className="space-y-4 pb-4">
      <div className="pt-2">
        <h1 className="text-white text-xl font-bold">{t("portal.myJobsTitle")}</h1>
        <p className="text-zinc-400 text-sm mt-0.5">{t("portal.allJobsHint")}</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 bg-zinc-800" />)}
        </div>
      ) : !jobs || jobs.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-6 text-center">
            <Briefcase className="mx-auto text-zinc-600 mb-3" size={32} />
            <p className="text-zinc-400">{t("portal.noJobs")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const myShare = job.jobType === "shared"
              ? (job.workerShares ?? []).find((s) => s.workerId === workerId)?.amount
              : job.workerShare;

            return (
              <Card
                key={job.id}
                className={`bg-zinc-900 border-zinc-800 ${job.status === "rejected" ? "opacity-60" : ""}`}
              >
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{job.source}</p>
                      <p className="text-zinc-500 text-xs mt-0.5">
                        {format(new Date(job.occurredAt), "EEEE, MMM d yyyy")}
                      </p>
                    </div>
                    <div className="text-end shrink-0 space-y-1">
                      <p className="text-white font-semibold font-mono">{formatCurrency(job.grossAmount)}</p>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          job.paymentMethod === "cash"
                            ? "border-yellow-700 text-yellow-400"
                            : "border-blue-700 text-blue-400"
                        }`}
                      >
                        {job.paymentMethod === "cash" ? `💵 ${t("common.cash")}` : `💳 ${t("common.card")}`}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-zinc-800 flex items-center justify-between">
                    <StatusBadge status={job.status} />
                    {myShare !== undefined && job.status !== "rejected" && (
                      <p className="text-green-400 text-sm font-medium font-mono">
                        +{formatCurrency(Number(myShare))}
                      </p>
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
