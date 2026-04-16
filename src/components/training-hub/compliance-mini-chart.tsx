"use client";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const data = [
  { name: "Current", value: 72 },
  { name: "Due soon", value: 14 },
  { name: "Expired", value: 9 },
  { name: "Never", value: 5 },
];

export function ComplianceMiniChart() {
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
