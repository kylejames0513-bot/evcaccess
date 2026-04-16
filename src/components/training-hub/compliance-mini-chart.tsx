"use client";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ComplianceMiniChartProps {
  data?: { name: string; value: number }[];
}

export function ComplianceMiniChart({ data: propData }: ComplianceMiniChartProps) {
  const data = propData ?? [
    { name: "Current", value: 0 },
    { name: "Due soon", value: 0 },
    { name: "Expired", value: 0 },
    { name: "Never", value: 0 },
  ];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fill: "#8b8fa3", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis hide />
        <Tooltip
          contentStyle={{
            background: "#1a1d27",
            border: "1px solid #2a2e3d",
            borderRadius: 8,
            color: "#e8eaed",
          }}
        />
        <Bar dataKey="value" fill="#3b82f6" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
