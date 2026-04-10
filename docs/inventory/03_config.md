# 03 Config

All paths relative to `training-hub/`.

## next.config.ts

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```

## tailwind.config.*

Not present. Tailwind v4 is configured via `postcss.config.mjs` only.

## postcss.config.mjs

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

## eslint.config.mjs

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
```

## middleware.ts

Not present at `training-hub/middleware.ts` or anywhere under `src/`.

## .env.local.example

```
# ============================================================
# EVC Training Hub -- Environment Variables
# ============================================================
# Copy this file to .env.local and fill in your values.
#
# SETUP:
#   1. Go to your Supabase project dashboard
#   2. Go to Settings > API to find your URL and keys
#   3. Create user accounts via Supabase Auth dashboard
# ============================================================

# Supabase project URL (from Settings > API)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co

# Supabase anon/public key (from Settings > API)
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Supabase service role key (from Settings > API)
# This is a SECRET key -- never expose to the client
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Legacy shared password for HR access (optional, for backward compat)
HR_PASSWORD=your-shared-password-here

# Environment
NODE_ENV=development
```
