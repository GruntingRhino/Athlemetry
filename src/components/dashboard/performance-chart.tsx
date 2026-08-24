"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = {
  date: string;
  value: number;
  percentile: number | null;
  score: number | null;
};

type PerformanceChartProps = {
  points: Point[];
};

export function PerformanceChart({ points }: PerformanceChartProps) {
  if (!points.length) {
    return <p className="athlemetry-message">No completed submissions yet.</p>;
  }

  return (
    <div className="h-[300px] w-full rounded-[24px] border border-slate-200 bg-white/70 p-3">
      <ResponsiveContainer>
        <LineChart data={points} margin={{ top: 10, right: 8, bottom: 6, left: 0 }}>
          <CartesianGrid strokeDasharray="4 6" stroke="#d9e1ee" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="left" tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              border: "1px solid #d9e1ee",
              borderRadius: 16,
              boxShadow: "0 18px 45px -30px rgba(15, 23, 42, 0.35)",
            }}
          />
          <Legend wrapperStyle={{ color: "#475569", fontSize: 12 }} />
          <Line yAxisId="left" type="monotone" dataKey="value" stroke="#0f766e" strokeWidth={3} dot={{ r: 2 }} name="Primary metric" />
          <Line yAxisId="right" type="monotone" dataKey="percentile" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 2 }} name="Percentile" />
          <Line yAxisId="right" type="monotone" dataKey="score" stroke="#b45309" strokeWidth={2.5} dot={{ r: 2 }} name="Composite score" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
