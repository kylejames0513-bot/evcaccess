import Link from "next/link";
import { SignupForm } from "@/components/training-hub/signup-form";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0f1117] px-4 text-[#e8eaed]">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-[#2a2e3d] bg-[#1a1d27] p-8">
        <div>
          <h1 className="text-xl font-semibold">Create account</h1>
          <p className="mt-1 text-sm text-[#8b8fa3]">You will set up your organization right after.</p>
        </div>
        <SignupForm />
        <p className="text-center text-sm text-[#8b8fa3]">
          Already registered?{" "}
          <Link href="/login" className="text-[#3b82f6] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
