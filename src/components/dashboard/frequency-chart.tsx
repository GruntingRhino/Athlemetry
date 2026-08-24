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
    return <p className="athlemetry-message">No drill frequency data yet.</p>;
  }

  return (
    <div className="h-[280px] w-full rounded-[24px] border border-slate-200 bg-white/70 p-3">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 8, bottom: 6, left: 0 }}>
          <CartesianGrid strokeDasharray="4 6" stroke="#d9e1ee" vertical={false} />
          <XAxis dataKey="drill" tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              border: "1px solid #d9e1ee",
              borderRadius: 16,
              boxShadow: "0 18px 45px -30px rgba(15, 23, 42, 0.35)",
            }}
          />
          <Bar dataKey="count" fill="#0f766e" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
