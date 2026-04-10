import { Loader2, AlertCircle, WifiOff } from "lucide-react";

export function Loading({ message = "Loading data..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
      <Loader2 className="h-7 w-7 animate-spin text-blue-500 mb-3" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  const isConnectionError = message.includes("GOOGLE_") || message.includes("env var");

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="bg-white border border-red-200 rounded-xl p-6 max-w-md text-center shadow-sm">
        {isConnectionError ? (
          <WifiOff className="h-8 w-8 text-red-400 mx-auto mb-3" />
        ) : (
          <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
        )}
        <h3 className="text-sm font-semibold text-slate-900 mb-1">
          {isConnectionError ? "Not Connected" : "Error Loading Data"}
        </h3>
        <p className="text-sm text-slate-500">{message}</p>
        {isConnectionError && (
          <p className="text-xs text-slate-400 mt-3">
            Set up your .env.local file with Google service account credentials.
            See .env.local.example for instructions.
          </p>
        )}
      </div>
    </div>
  );
}
