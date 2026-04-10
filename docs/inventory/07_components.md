# 07 Components

All paths relative to `training-hub/src/`.

| path | export | description |
|---|---|---|
| components/AppShell.tsx | AppShell | Top level layout wrapping children with sidebar and mobile nav |
| components/Sidebar.tsx | Sidebar | Desktop sidebar navigation with Quick Record button trigger |
| components/MobileNav.tsx | MobileNav | Mobile bottom nav bar with Quick Record button trigger |
| components/AuthGuard.tsx | AuthGuard | Client wrapper that redirects unauthenticated users to /login |
| components/EmployeeDetailModal.tsx | EmployeeDetailModal | Modal showing one employee's training records, excusals, enroll action |
| components/QuickRecord.tsx | QuickRecord | Modal for quickly recording a completion (employee + training) |
| components/ui/StatusBadge.tsx | StatusBadge | Colored badge for compliance/session/attendance status values |
| components/ui/StatCard.tsx | StatCard | Card showing a single stat with icon, title, value, subtitle |
| components/ui/DataState.tsx | Loading, ErrorState | Named exports for loading and error placeholder states |

Total: 9 component files. Note that `DataState.tsx` contains the string `"Loading data from Google Sheets..."` as a default message, which is a tell that the client UI was originally talking to a sheets backed API and has not been fully rewritten for Supabase.
