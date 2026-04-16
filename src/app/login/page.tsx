import { LoginForm } from "@/components/training-hub/login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[--bg] px-4 text-[--ink]">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-[--rule] bg-[--surface] p-8">
        <div>
          <h1 className="font-display text-xl font-medium">HR Hub</h1>
          <p className="mt-1 text-sm text-[--ink-muted]">Enter the shared HR password to continue.</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
