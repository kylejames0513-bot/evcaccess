"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2, GraduationCap } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Incorrect password");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Connection error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#1e3a5f] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <GraduationCap className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">EVC Training Hub</h1>
          <p className="text-sm text-slate-500 mt-1">HR Administration Access</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter HR password"
                autoFocus
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:bg-white"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full px-6 py-3 bg-[#1e3a5f] text-white font-semibold rounded-xl hover:bg-[#2a4d7a] transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {loading ? "Checking..." : "Sign In"}
          </button>

          <p className="text-center">
            <a href="/signin" className="text-xs text-slate-400 hover:text-slate-600">
              Employee training sign-in →
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
