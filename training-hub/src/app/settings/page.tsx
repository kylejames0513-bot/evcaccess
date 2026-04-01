import { Database, Key, Users, Bell, Shield } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">System configuration</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Supabase connection */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <Database className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Database Connection</h2>
              <p className="text-xs text-slate-500">Supabase PostgreSQL</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Project URL
              </label>
              <input
                type="text"
                placeholder="https://your-project.supabase.co"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Anon Key
              </label>
              <input
                type="password"
                placeholder="Configured via .env.local"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50"
                disabled
              />
            </div>
            <p className="text-xs text-slate-500">
              Connection settings are managed via environment variables.
              See .env.local.example for setup instructions.
            </p>
          </div>
        </div>

        {/* Auth settings */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Shield className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Authentication</h2>
              <p className="text-xs text-slate-500">SSO configuration</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-700">Google SSO</span>
              <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                Not configured
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-700">Microsoft SSO</span>
              <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                Not configured
              </span>
            </div>
            <p className="text-xs text-slate-500">
              SSO providers are configured in your Supabase dashboard under
              Authentication → Providers.
            </p>
          </div>
        </div>

        {/* Notification settings */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-50 rounded-lg">
              <Bell className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Notifications</h2>
              <p className="text-xs text-slate-500">Alert thresholds</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Expiring Soon Threshold (days)
              </label>
              <input
                type="number"
                defaultValue={60}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Reminder Intervals (days before expiration)
              </label>
              <input
                type="text"
                defaultValue="60, 30, 7"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Data management */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Data Import</h2>
              <p className="text-xs text-slate-500">Migrate from spreadsheet</p>
            </div>
          </div>
          <div className="space-y-3">
            <button className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors text-left">
              Import employees from CSV
            </button>
            <button className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors text-left">
              Import training records from CSV
            </button>
            <button className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors text-left">
              Seed training types from config
            </button>
            <p className="text-xs text-slate-500">
              Export your Google Sheet as CSV and import here to migrate data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
