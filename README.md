# Loomian inventory

## Deploying to Vercel

1. Import the repo in Vercel. `vercel.json` sets the Vite build (`npm run build` → `dist`) and rewrites every path to `index.html` so routes like `/leads/:id` work on refresh.
2. Add these environment variables (Project → Settings → Environment Variables, for Production and Preview), from Supabase → Project Settings → API:
   - `VITE_SUPABASE_URL` — the project URL
   - `VITE_SUPABASE_ANON_KEY` — the `anon` public key (never the `service_role` key: `VITE_` values are bundled into the browser)
3. Apply the database migrations in `supabase/migrations` (`supabase db push`) **before or together with** the deploy.
4. In Supabase → Authentication → URL Configuration, set the Site URL to the Vercel domain and add it to the Redirect URLs.

Vite reads `VITE_*` variables at build time, so redeploy after changing them.

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
