# 02 Package

`training-hub/package.json`:

```json
{
  "name": "training-hub",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.101.1",
    "lucide-react": "^1.7.0",
    "next": "16.2.2",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.2.2",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

Framework: Next.js 16.2.2 with React 19.2.4 and TypeScript 5. Package manager: npm (lockfile is `package-lock.json`). Top 5 runtime deps: `next`, `react`, `react-dom`, `@supabase/supabase-js`, `xlsx`. UI styling uses Tailwind v4 via `@tailwindcss/postcss`. No shadcn detected in deps. Icon library is `lucide-react`.

Heads up: per `training-hub/AGENTS.md`, Next.js 16 has breaking changes vs earlier versions. Before any code is written in Step 2, the relevant docs under `node_modules/next/dist/docs/` must be consulted.
