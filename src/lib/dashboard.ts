import { differenceInDays } from "date-fns";

import { prisma } from "@/lib/prisma";

type TrendPoint = {
  date: string;
  value: number;
  percentile: number;
};

function toTimelineDelta(points: TrendPoint[]) {
  if (points.length < 2) {
    return 0;
  }

  const first = points[0];
  const last = points[points.length - 1];
  const days = Math.max(1, differenceInDays(new Date(last.date), new Date(first.date)));
  return (last.value - first.value) / days;
}

export async function getAthleteDashboardData(userId: string) {
  const submissions = await prisma.drillSubmission.findMany({
    where: {
      athleteId: userId,
      processingStatus: "COMPLETED",
    },
    include: {
      drillDefinition: true,
      metricResult: true,
      benchmarkSnapshots: true,
    },
    orderBy: {
      submittedAt: "asc",
    },
  });

  const drillFrequency = submissions.reduce<Record<string, number>>((acc, item) => {
    acc[item.drillType] = (acc[item.drillType] ?? 0) + 1;
    return acc;
  }, {});

  const timeline: TrendPoint[] = submissions
    .filter((item) => item.metricResult)
    .map((item) => ({
      date: item.submittedAt.toISOString().slice(0, 10),
      value:
        item.metricResult?.sprintTime ??
        item.metricResult?.changeOfDirectionMeasurement ??
        item.metricResult?.shotTiming ??
        Number(item.metricResult?.repetitionCount ?? 0),
      percentile: item.benchmarkSnapshots[0]?.percentile ?? 50,
    }));

  const values = timeline.map((point) => point.value);
  const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const variance =
    values.length > 1
      ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
      : 0;
  const consistencyScore = values.length ? Math.max(0, 100 - Math.sqrt(variance) * 10) : 0;

  const strengths = [
    consistencyScore > 75 ? "High repeatability across drill sessions" : "Consistency needs work",
    timeline.length >= 3 ? "Sufficient historical dataset for trend analysis" : "Collect more sessions for stronger trends",
  ];

  const suggestions = [
    consistencyScore < 70
      ? "Prioritize form stability in repeat drills to improve consistency scores."
      : "Maintain current warmup and execution routine.",
    (timeline[timeline.length - 1]?.percentile ?? 50) < 60
      ? "Increase drill frequency to target percentile growth."
      : "Percentiles are trending up; preserve progression plan.",
  ];

  return {
    submissions,
    timeline,
    trendSlope: toTimelineDelta(timeline),
    consistencyScore,
    drillFrequency,
    strengths,
    suggestions,
  };
}

export async function getAdminDashboardData() {
  const [
    totalUsers,
    totalSubmissions,
    queuedSubmissions,
    failedSubmissions,
    processingLogs,
    systemErrors,
    adoption,
    growth,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.drillSubmission.count(),
    prisma.drillSubmission.count({ where: { processingStatus: "QUEUED" } }),
    prisma.drillSubmission.count({ where: { processingStatus: "FAILED" } }),
    prisma.processingLog.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.systemLog.findMany({ where: { level: "ERROR" }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.drillSubmission.groupBy({
      by: ["drillType"],
      _count: {
        drillType: true,
      },
      orderBy: {
        _count: {
          drillType: "desc",
        },
      },
    }),
    prisma.$queryRaw<Array<{ month: string; total: number }>>`
      SELECT to_char(date_trunc('month', "submittedAt"), 'YYYY-MM') AS month,
             COUNT(*)::int AS total
      FROM "DrillSubmission"
      GROUP BY month
      ORDER BY month ASC
    `,
  ]);

  return {
    totalUsers,
    totalSubmissions,
    queuedSubmissions,
    failedSubmissions,
    processingLogs,
    systemErrors,
    adoption,
    growth,
  };
}
