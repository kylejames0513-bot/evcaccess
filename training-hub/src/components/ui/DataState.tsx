import { Loader2, AlertCircle, WifiOff } from "lucide-react";

export function Loading({ message = "Loading data from Google Sheets..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
      <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-3" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  const isConnectionError = message.includes("GOOGLE_") || message.includes("env var");

  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md text-center">
        {isConnectionError ? (
          <WifiOff className="h-8 w-8 text-red-400 mx-auto mb-3" />
        ) : (
          <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
        )}
        <h3 className="text-sm font-semibold text-red-800 mb-1">
          {isConnectionError ? "Not Connected" : "Error Loading Data"}
        </h3>
        <p className="text-sm text-red-600">{message}</p>
        {isConnectionError && (
          <p className="text-xs text-red-500 mt-3">
            Set up your .env.local file with Google service account credentials.
            See .env.local.example for instructions.
          </p>
        )}
      </div>
    </div>
  );
}
