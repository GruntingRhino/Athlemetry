"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type FrequencyChartProps = {
  data: Array<{ drill: string; count: number }>;
};

export function FrequencyChart({ data }: FrequencyChartProps) {
  if (!data.length) {
    return <p className="text-sm text-slate-500">No drill frequency data yet.</p>;
  }

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="drill" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
