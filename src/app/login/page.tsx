import Link from "next/link";
import { LoginForm } from "@/components/training-hub/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0f1117] px-4 text-[#e8eaed]">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-[#2a2e3d] bg-[#1a1d27] p-8">
        <div>
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-[#8b8fa3]">Use your work email and password.</p>
        </div>
        <LoginForm />
        <p className="text-center text-sm text-[#8b8fa3]">
          Need an account?{" "}
          <Link href="/signup" className="text-[#3b82f6] hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
