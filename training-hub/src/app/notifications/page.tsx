"use client";

import { useState } from "react";
import { Bell, Mail, Send, Settings, Clock, CheckCircle, AlertTriangle } from "lucide-react";

// Demo notification history
const demoNotifications = [
  { id: "1", type: "expiration_warning", recipient: "Johnson, Maria", subject: "CPR/FA expires in 14 days", sent: "2026-04-01 8:00 AM", channel: "email" },
  { id: "2", type: "expiration_warning", recipient: "Smith, Terrence", subject: "Med Recert expires in 7 days", sent: "2026-04-01 8:00 AM", channel: "email" },
  { id: "3", type: "enrollment_confirm", recipient: "Williams, Aisha", subject: "Enrolled in CPR/FA — Apr 10", sent: "2026-03-31 2:15 PM", channel: "email" },
  { id: "4", type: "class_reminder", recipient: "Anderson, James", subject: "CPR/FA class tomorrow at 9:00 AM", sent: "2026-04-02 8:00 AM", channel: "email" },
  { id: "5", type: "expiration_warning", recipient: "Brown, Marcus", subject: "Ukeru training EXPIRED", sent: "2026-03-29 8:00 AM", channel: "email" },
  { id: "6", type: "manager_digest", recipient: "Garcia, Sofia (Supervisor)", subject: "Weekly compliance digest — 3 issues", sent: "2026-03-31 7:00 AM", channel: "email" },
];

const automationRules = [
  { name: "60-day expiration warning", description: "Email employees when any training expires within 60 days", enabled: true, frequency: "Daily check" },
  { name: "30-day expiration warning", description: "Follow-up email at 30 days before expiration", enabled: true, frequency: "Daily check" },
  { name: "7-day expiration urgent", description: "Urgent notice 7 days before expiration + CC supervisor", enabled: true, frequency: "Daily check" },
  { name: "Expired training alert", description: "Notify employee + supervisor when training expires", enabled: true, frequency: "Daily check" },
  { name: "Enrollment confirmation", description: "Email when enrolled in a training session", enabled: true, frequency: "On event" },
  { name: "Class reminder (1 day)", description: "Remind attendees 1 day before their scheduled class", enabled: true, frequency: "Daily check" },
  { name: "Weekly manager digest", description: "Send supervisors a compliance summary every Monday", enabled: true, frequency: "Weekly (Monday)" },
  { name: "No-show follow-up", description: "Email employee + supervisor after a no-show", enabled: false, frequency: "On event" },
];

export default function NotificationsPage() {
  const [tab, setTab] = useState<"history" | "automation">("automation");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
        <p className="text-slate-500 mt-1">
          Automated alerts and notification history
        </p>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-100 rounded-lg p-0.5 w-fit">
        <button
          onClick={() => setTab("automation")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === "automation" ? "bg-white shadow text-slate-900" : "text-slate-600"
          }`}
        >
          Automation Rules
        </button>
        <button
          onClick={() => setTab("history")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === "history" ? "bg-white shadow text-slate-900" : "text-slate-600"
          }`}
        >
          History
        </button>
      </div>

      {tab === "automation" ? (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex gap-3">
              <Bell className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-blue-900">
                  Automated Notifications
                </h3>
                <p className="text-sm text-blue-700 mt-1">
                  These rules run automatically. When connected to Supabase, the system
                  will check daily for expiring trainings and send emails without any
                  manual intervention. No more chasing people down.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
            {automationRules.map((rule, i) => (
              <div key={i} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${rule.enabled ? "bg-green-50" : "bg-slate-50"}`}>
                    {rule.enabled ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <Clock className="h-5 w-5 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-900">
                      {rule.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {rule.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-500">{rule.frequency}</span>
                  <button
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      rule.enabled ? "bg-blue-600" : "bg-slate-200"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        rule.enabled ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Recipient</th>
                  <th className="px-6 py-3">Subject</th>
                  <th className="px-6 py-3">Sent</th>
                  <th className="px-6 py-3">Channel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {demoNotifications.map((notif) => (
                  <tr key={notif.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                        notif.type === "expiration_warning"
                          ? "text-yellow-700"
                          : notif.type === "enrollment_confirm"
                            ? "text-green-700"
                            : notif.type === "class_reminder"
                              ? "text-blue-700"
                              : "text-purple-700"
                      }`}>
                        {notif.type === "expiration_warning" && <AlertTriangle className="h-3.5 w-3.5" />}
                        {notif.type === "enrollment_confirm" && <CheckCircle className="h-3.5 w-3.5" />}
                        {notif.type === "class_reminder" && <Clock className="h-3.5 w-3.5" />}
                        {notif.type === "manager_digest" && <Mail className="h-3.5 w-3.5" />}
                        {notif.type.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900">
                      {notif.recipient}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {notif.subject}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {notif.sent}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                        <Mail className="h-3.5 w-3.5" />
                        {notif.channel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
