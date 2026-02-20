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
  percentile: number;
};

type PerformanceChartProps = {
  points: Point[];
};

export function PerformanceChart({ points }: PerformanceChartProps) {
  if (!points.length) {
    return <p className="text-sm text-slate-500">No completed submissions yet.</p>;
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer>
        <LineChart data={points}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" />
          <YAxis yAxisId="left" />
          <YAxis yAxisId="right" orientation="right" />
          <Tooltip />
          <Legend />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="value"
            stroke="#2563eb"
            strokeWidth={2}
            dot={{ r: 2 }}
            name="Primary Metric"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="percentile"
            stroke="#16a34a"
            strokeWidth={2}
            dot={{ r: 2 }}
            name="Percentile"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
