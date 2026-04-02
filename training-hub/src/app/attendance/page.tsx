"use client";

import { useState } from "react";
import { QrCode, CheckCircle, UserCheck, Clock, Search } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";

// Demo recent check-ins
const recentCheckins = [
  { employee: "Anderson, James", training: "CPR/FA", time: "9:03 AM", status: "attended" as const },
  { employee: "Taylor, Aisha", training: "CPR/FA", time: "9:01 AM", status: "attended" as const },
  { employee: "Wilson, David", training: "CPR/FA", time: "8:58 AM", status: "attended" as const },
  { employee: "Garcia, Sofia", training: "CPR/FA", time: "8:55 AM", status: "attended" as const },
  { employee: "Johnson, Maria", training: "CPR/FA", time: "8:52 AM", status: "attended" as const },
];

export default function AttendancePage() {
  const [mode, setMode] = useState<"scan" | "manual" | "session">("scan");
  const [manualName, setManualName] = useState("");
  const [selectedSession, setSelectedSession] = useState("");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">QR Attendance</h1>
        <p className="text-slate-500 mt-1">
          Scan QR codes or manually record attendance
        </p>
      </div>

      {/* Mode selector */}
      <div className="flex bg-slate-100 rounded-lg p-0.5 w-fit">
        {(["scan", "manual", "session"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize ${
              mode === m ? "bg-white shadow text-slate-900" : "text-slate-600"
            }`}
          >
            {m === "scan" ? "QR Scan" : m === "manual" ? "Manual Entry" : "Session View"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left panel — scan/entry */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          {mode === "scan" ? (
            <div className="text-center space-y-4">
              <div className="inline-flex p-6 bg-blue-50 rounded-2xl">
                <QrCode className="h-24 w-24 text-blue-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">
                QR Code Scanner
              </h2>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                Point employee&apos;s QR code at the camera to automatically record
                attendance. The system will match their name and mark them present.
              </p>
              <button className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors">
                Start Camera
              </button>
              <p className="text-xs text-slate-400">
                Camera access required. Works on mobile and desktop.
              </p>
            </div>
          ) : mode === "manual" ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Manual Check-In
              </h2>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Training Session
                </label>
                <select
                  value={selectedSession}
                  onChange={(e) => setSelectedSession(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a session...</option>
                  <option value="cpr-0403">CPR/FA — Apr 3, 2026</option>
                  <option value="ukeru-0413">Ukeru — Apr 13, 2026</option>
                  <option value="meal-0415">Mealtime — Apr 15, 2026</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Employee Name
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Last, First..."
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Nickname matching enabled (e.g., &quot;Mike&quot; matches &quot;Michael&quot;)
                </p>
              </div>
              <div className="flex gap-3">
                <button className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors inline-flex items-center justify-center gap-2">
                  <UserCheck className="h-4 w-4" />
                  Check In
                </button>
                <button className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center justify-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Mark Pass
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Session Roster
              </h2>
              <select
                value={selectedSession}
                onChange={(e) => setSelectedSession(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a session...</option>
                <option value="cpr-0403">CPR/FA — Apr 3, 2026 (8/10 enrolled)</option>
                <option value="ukeru-0413">Ukeru — Apr 13, 2026 (10/12 enrolled)</option>
              </select>
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                {["Anderson, James", "Garcia, Sofia", "Johnson, Maria", "Taylor, Aisha", "Wilson, David"].map(
                  (name, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <span className="text-sm text-slate-900">{name}</span>
                      <div className="flex gap-2">
                        <button className="px-2.5 py-1 text-xs bg-green-100 text-green-700 rounded font-medium hover:bg-green-200">
                          Pass
                        </button>
                        <button className="px-2.5 py-1 text-xs bg-red-100 text-red-700 rounded font-medium hover:bg-red-200">
                          Fail
                        </button>
                        <button className="px-2.5 py-1 text-xs bg-orange-100 text-orange-700 rounded font-medium hover:bg-orange-200">
                          No Show
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
              <button className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                Finalize Session
              </button>
            </div>
          )}
        </div>

        {/* Right panel — recent check-ins */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">
              Recent Check-Ins
            </h2>
            <p className="text-sm text-slate-500">Today&apos;s attendance log</p>
          </div>
          <div className="divide-y divide-slate-100">
            {recentCheckins.map((checkin, i) => (
              <div
                key={i}
                className="px-6 py-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-green-100 rounded-full">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {checkin.employee}
                    </p>
                    <p className="text-xs text-slate-500">{checkin.training}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{checkin.time}</span>
                  <StatusBadge status={checkin.status} type="attendance" />
                </div>
              </div>
            ))}
          </div>
          {recentCheckins.length === 0 && (
            <div className="px-6 py-8 text-center text-slate-500 text-sm">
              No check-ins recorded today yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
