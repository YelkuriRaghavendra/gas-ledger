# Cylinder Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Cylinder Tracker prototype as a real, deployed app: a React/TypeScript PWA on Cloudflare Pages backed by Supabase (Postgres + Auth), free to run, for a single gas-cylinder agency.

**Architecture:** Vite + React + TypeScript compiled to a static bundle, deployed on Cloudflare Pages. Supabase is the entire backend — the browser talks to Postgres directly via `@supabase/supabase-js`, and Postgres Row Level Security enforces that only the `owner` role can edit/delete records. No custom API server.

**Tech Stack:** React 18, TypeScript, Vite, React Router v6, Tailwind CSS, `@supabase/supabase-js`, `vite-plugin-pwa`, Supabase (Postgres + Auth), Cloudflare Pages, GitHub Actions.

## Global Constraints

- Free tier only: Cloudflare Pages + Supabase free tiers, both of which permit commercial use.
- No automated test suite (per spec) — every task's verification step is a manual check against the running dev server and/or the Supabase dashboard, not automated tests.
- TypeScript `strict` mode.
- Color palette (reused from the prototype's bundler thumbnail): cream `#DED6C9` (background), ink `#211913` (text), accent `#E4571B` (primary actions/buttons).
- RLS is enforced in Postgres for every owner-only action (edit/delete) — the UI hides controls for staff, but the database is the real gate.
- Currency formatting assumes INR (`en-IN`) in `src/utils/format.ts` — change this if the agency uses a different currency.
- No comments in code unless explaining a non-obvious constraint.

---

## Task 1: Scaffold the project and initialize git

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/index.css`
- Create: `.gitignore`
- Create: `.env.example`

**Interfaces:**
- Produces: a running Vite dev server at `http://localhost:5173` rendering `App`.

- [ ] **Step 1: Initialize git**

```bash
cd "/Users/yelkuriraghavendra/Desktop/Personal/new"
git init
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules
dist
.env.local
.DS_Store
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "cylinder-tracker",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.40",
    "tailwindcss": "^3.4.7",
    "typescript": "^5.5.4",
    "vite": "^5.3.4",
    "vite-plugin-pwa": "^0.20.1"
  }
}
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 5: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 6: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

- [ ] **Step 7: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#E4571B" />
    <title>Cylinder Tracker</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create `src/index.css`**

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: sans-serif; }
```

- [ ] **Step 9: Create `src/App.tsx`**

```tsx
export default function App() {
  return (
    <div style={{ padding: 24 }}>
      <h1>Cylinder Tracker</h1>
      <p>Project scaffold OK.</p>
    </div>
  )
}
```

- [ ] **Step 10: Create `src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 11: Create `.env.example`**

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Step 12: Install dependencies**

```bash
npm install
```

- [ ] **Step 13: Verify the dev server runs**

```bash
npm run dev
```

Expected: server starts on `http://localhost:5173`; opening it in a browser shows "Cylinder Tracker / Project scaffold OK." Stop the server with Ctrl+C when confirmed.

- [ ] **Step 14: Commit**

```bash
git add package.json tsconfig.json tsconfig.node.json vite.config.ts index.html src .gitignore .env.example
git commit -m "chore: scaffold vite react-ts project"
```

---

## Task 2: Tailwind styling setup

**Files:**
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Modify: `src/index.css`

**Interfaces:**
- Produces: Tailwind utility classes available in all components, custom colors `cream`, `ink`, `accent`.

- [ ] **Step 1: Create `tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#DED6C9',
        ink: '#211913',
        accent: '#E4571B',
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 2: Create `postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 3: Replace `src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background-color: #DED6C9;
}
```

- [ ] **Step 4: Verify Tailwind is active**

Temporarily add `className="text-accent"` to the `<h1>` in `src/App.tsx`, run `npm run dev`, and confirm the heading renders in orange (`#E4571B`) in the browser. Revert the temporary change (App.tsx will be fully rewritten in Task 6 anyway).

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.js postcss.config.js src/index.css
git commit -m "chore: add tailwind css"
```

---

## Task 3: Supabase schema, view, and RLS policies

**Files:**
- Create: `supabase/schema.sql`

**Interfaces:**
- Produces: tables `customers`, `transactions`, `profiles`; views `customer_balances`, `activity_feed`; RLS policies gating `UPDATE`/`DELETE` to `profiles.role = 'owner'`.

- [ ] **Step 1: Create a Supabase project**

Go to https://supabase.com/dashboard, create a new project (free tier), and note the **Project URL** and **anon public key** from Settings → API. You'll need these in Task 4.

- [ ] **Step 2: Create `supabase/schema.sql`**

```sql
create table customers (
  id         bigint generated always as identity primary key,
  name       text not null,
  phone      text,
  address    text,
  created_at timestamptz not null default now()
);

create table transactions (
  id          bigint generated always as identity primary key,
  customer_id bigint not null references customers(id) on delete cascade,
  type        text not null check (type in ('sale','return','payment')),
  qty         int not null default 0,
  empties     int not null default 0,
  amount      numeric(12,2) not null default 0,
  note        text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create index on transactions (customer_id, created_at desc);

create table profiles (
  id   uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  role text not null default 'staff' check (role in ('owner','staff'))
);

create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), 'staff');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create view customer_balances as
select
  c.id, c.name, c.phone, c.address,
  coalesce(sum(t.qty)     filter (where t.type='sale'), 0)                                as sold,
  coalesce(sum(t.empties) filter (where t.type='sale'), 0)
    + coalesce(sum(t.qty) filter (where t.type='return'), 0)                             as returned,
  coalesce(sum(t.qty)     filter (where t.type='sale'), 0)
    - (coalesce(sum(t.empties) filter (where t.type='sale'), 0)
       + coalesce(sum(t.qty)  filter (where t.type='return'), 0))                        as empties_outstanding,
  coalesce(sum(t.amount)  filter (where t.type='sale'), 0)
    - coalesce(sum(t.amount) filter (where t.type='payment'), 0)                         as amount_due
from customers c
left join transactions t on t.customer_id = c.id
group by c.id;

create view activity_feed as
select
  t.id, t.customer_id, c.name as customer_name, t.type, t.qty, t.empties,
  t.amount, t.note, t.created_by, t.created_at
from transactions t
join customers c on c.id = t.customer_id
order by t.created_at desc;

alter table customers enable row level security;
alter table transactions enable row level security;
alter table profiles enable row level security;

create policy "read customers" on customers for select to authenticated using (true);
create policy "insert customers" on customers for insert to authenticated with check (true);
create policy "owner update customers" on customers for update to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
create policy "owner delete customers" on customers for delete to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

create policy "read transactions" on transactions for select to authenticated using (true);
create policy "insert own transactions" on transactions for insert to authenticated
  with check (created_by = auth.uid());
create policy "owner update transactions" on transactions for update to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
create policy "owner delete transactions" on transactions for delete to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

create policy "read own profile" on profiles for select to authenticated using (id = auth.uid());
```

- [ ] **Step 3: Run the schema**

Paste the full contents of `supabase/schema.sql` into the Supabase dashboard's SQL Editor and run it. Expected: "Success. No rows returned."

- [ ] **Step 4: Create the owner and staff accounts**

In the Supabase dashboard, go to Authentication → Users → Add user, and create one account for the owner and one for each staff member (email + password, "Auto Confirm User" checked so no email verification step is needed).

- [ ] **Step 5: Promote the owner account**

Copy the owner's user id from Authentication → Users, then run in the SQL Editor:

```sql
update profiles set role = 'owner', name = 'Owner Name' where id = '<paste-owner-user-id-here>';
```

Verify: `select id, name, role from profiles;` shows the owner row with `role = 'owner'` and every other account with `role = 'staff'`.

- [ ] **Step 6: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add supabase schema, views, and RLS policies"
```

---

## Task 4: Supabase client, types, and environment config

**Files:**
- Create: `src/vite-env.d.ts`
- Create: `src/lib/supabase.ts`
- Create: `src/types/db.ts`
- Create: `.env.local` (not committed)

**Interfaces:**
- Produces: `supabase` client (`src/lib/supabase.ts`), types `Role`, `Profile`, `TransactionType`, `Customer`, `Transaction`, `CustomerBalance`, `ActivityEntry` (`src/types/db.ts`).

- [ ] **Step 1: Create `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 2: Create `src/types/db.ts`**

```ts
export type Role = 'owner' | 'staff'

export interface Profile {
  id: string
  name: string
  role: Role
}

export type TransactionType = 'sale' | 'return' | 'payment'

export interface Customer {
  id: number
  name: string
  phone: string | null
  address: string | null
  created_at: string
}

export interface Transaction {
  id: number
  customer_id: number
  type: TransactionType
  qty: number
  empties: number
  amount: number
  note: string | null
  created_by: string | null
  created_at: string
}

export interface CustomerBalance {
  id: number
  name: string
  phone: string | null
  address: string | null
  sold: number
  returned: number
  empties_outstanding: number
  amount_due: number
}

export interface ActivityEntry {
  id: number
  customer_id: number
  customer_name: string
  type: TransactionType
  qty: number
  empties: number
  amount: number
  note: string | null
  created_by: string | null
  created_at: string
}
```

- [ ] **Step 3: Create `src/lib/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 4: Create `.env.local`**

```
VITE_SUPABASE_URL=<your Supabase project URL>
VITE_SUPABASE_ANON_KEY=<your Supabase anon public key>
```

Fill in the real values from Settings → API in the Supabase dashboard (Task 3, Step 1). This file is gitignored and never committed.

- [ ] **Step 5: Verify the client compiles**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/vite-env.d.ts src/lib/supabase.ts src/types/db.ts
git commit -m "feat: add supabase client and db types"
```

---

## Task 5: Auth provider and protected routing

**Files:**
- Create: `src/auth/AuthContext.tsx`
- Create: `src/components/ProtectedRoute.tsx`

**Interfaces:**
- Consumes: `supabase` (`src/lib/supabase.ts`), `Profile` (`src/types/db.ts`).
- Produces: `AuthProvider` component, `useAuth()` hook returning `{ session, profile, loading, signIn, signOut }`; `ProtectedRoute` component (renders `<Outlet />` or redirects to `/login`).

- [ ] **Step 1: Create `src/auth/AuthContext.tsx`**

```tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/db'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (!newSession) {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    setLoading(true)
    supabase
      .from('profiles')
      .select('id, name, role')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setProfile(data as Profile | null)
        setLoading(false)
      })
  }, [session])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? error.message : null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

- [ ] **Step 2: Create `src/components/ProtectedRoute.tsx`**

```tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function ProtectedRoute() {
  const { session, loading } = useAuth()

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-ink">Loading…</div>
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc -b --noEmit
```

Expected: no errors (these files aren't wired into `main.tsx`/`App.tsx` yet — that happens in Task 6).

- [ ] **Step 4: Commit**

```bash
git add src/auth/AuthContext.tsx src/components/ProtectedRoute.tsx
git commit -m "feat: add auth provider and protected route"
```

---

## Task 6: Router, app shell, bottom nav, connection banner

**Files:**
- Create: `src/hooks/useOnlineStatus.ts`
- Create: `src/components/ConnectionBanner.tsx`
- Create: `src/components/BottomNav.tsx`
- Create: `src/pages/Login.tsx` (temporary stub — full version in Task 7)
- Create: `src/pages/Home.tsx` (temporary stub — full version in Task 8)
- Create: `src/pages/Customers.tsx` (temporary stub — full version in Task 9)
- Create: `src/pages/CustomerDetail.tsx` (temporary stub — full version in Task 10)
- Create: `src/pages/NewSale.tsx` (temporary stub — full version in Task 11)
- Create: `src/pages/LogReturn.tsx` (temporary stub — full version in Task 12)
- Create: `src/pages/RecordPayment.tsx` (temporary stub — full version in Task 13)
- Create: `src/pages/ActivityFeed.tsx` (temporary stub — full version in Task 14)
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `AuthProvider`, `useAuth` (Task 5), `ProtectedRoute` (Task 5).
- Produces: routes `/login`, `/`, `/customers`, `/customers/:id`, `/customers/:id/sale`, `/customers/:id/return`, `/customers/:id/payment`, `/activity`.

- [ ] **Step 1: Create `src/hooks/useOnlineStatus.ts`**

```ts
import { useEffect, useState } from 'react'

export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
```

- [ ] **Step 2: Create `src/components/ConnectionBanner.tsx`**

```tsx
import { useOnlineStatus } from '../hooks/useOnlineStatus'

export function ConnectionBanner() {
  const online = useOnlineStatus()
  if (online) return null
  return (
    <div className="bg-red-600 py-1 text-center text-sm text-white">
      No connection — reconnect to continue
    </div>
  )
}
```

- [ ] **Step 3: Create `src/components/BottomNav.tsx`**

```tsx
import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/', label: 'Home' },
  { to: '/customers', label: 'Customers' },
  { to: '/activity', label: 'Activity' },
]

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 flex border-t border-ink/10 bg-white">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) =>
            `flex-1 py-3 text-center text-sm font-medium ${isActive ? 'text-accent' : 'text-ink/60'}`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
```

- [ ] **Step 4: Create stub pages**

Create each of the following with the same minimal pattern so routing can be verified before the real screens are built (Tasks 7–14 replace these one by one):

`src/pages/Login.tsx`:
```tsx
export function Login() {
  return <div className="p-4">Login (stub)</div>
}
```

`src/pages/Home.tsx`:
```tsx
export function Home() {
  return <div className="p-4">Home (stub)</div>
}
```

`src/pages/Customers.tsx`:
```tsx
export function Customers() {
  return <div className="p-4">Customers (stub)</div>
}
```

`src/pages/CustomerDetail.tsx`:
```tsx
export function CustomerDetail() {
  return <div className="p-4">Customer detail (stub)</div>
}
```

`src/pages/NewSale.tsx`:
```tsx
export function NewSale() {
  return <div className="p-4">New sale (stub)</div>
}
```

`src/pages/LogReturn.tsx`:
```tsx
export function LogReturn() {
  return <div className="p-4">Log return (stub)</div>
}
```

`src/pages/RecordPayment.tsx`:
```tsx
export function RecordPayment() {
  return <div className="p-4">Record payment (stub)</div>
}
```

`src/pages/ActivityFeed.tsx`:
```tsx
export function ActivityFeed() {
  return <div className="p-4">Activity feed (stub)</div>
}
```

- [ ] **Step 5: Rewrite `src/App.tsx`**

```tsx
import { Routes, Route, useLocation } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { BottomNav } from './components/BottomNav'
import { ConnectionBanner } from './components/ConnectionBanner'
import { Login } from './pages/Login'
import { Home } from './pages/Home'
import { Customers } from './pages/Customers'
import { CustomerDetail } from './pages/CustomerDetail'
import { NewSale } from './pages/NewSale'
import { LogReturn } from './pages/LogReturn'
import { RecordPayment } from './pages/RecordPayment'
import { ActivityFeed } from './pages/ActivityFeed'

export default function App() {
  const location = useLocation()
  const hideNav = location.pathname === '/login'

  return (
    <div className="min-h-screen bg-cream pb-16">
      <ConnectionBanner />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Home />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/customers/:id/sale" element={<NewSale />} />
          <Route path="/customers/:id/return" element={<LogReturn />} />
          <Route path="/customers/:id/payment" element={<RecordPayment />} />
          <Route path="/activity" element={<ActivityFeed />} />
        </Route>
      </Routes>
      {!hideNav && <BottomNav />}
    </div>
  )
}
```

- [ ] **Step 6: Rewrite `src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
```

- [ ] **Step 7: Verify routing manually**

```bash
npm run dev
```

Expected: visiting `/` redirects to `/login` (no session yet) showing "Login (stub)"; the bottom nav is hidden on `/login`.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useOnlineStatus.ts src/components/ConnectionBanner.tsx src/components/BottomNav.tsx src/pages src/App.tsx src/main.tsx
git commit -m "feat: add router, app shell, bottom nav, connection banner"
```

---

## Task 7: Login page

**Files:**
- Modify: `src/pages/Login.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 5) — `session`, `signIn(email, password)`.

- [ ] **Step 1: Rewrite `src/pages/Login.tsx`**

```tsx
import { FormEvent, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function Login() {
  const { session, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await signIn(email, password)
    setSubmitting(false)
    if (error) setError(error)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <h1 className="mb-8 text-2xl font-bold text-ink">Cylinder Tracker</h1>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-ink/20 px-4 py-3"
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-ink/20 px-4 py-3"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-accent py-3 font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verify login manually**

```bash
npm run dev
```

Log in with the owner account created in Task 3, Step 4. Expected: on success, redirected to `/` (shows "Home (stub)"); on wrong password, an error message appears and you stay on `/login`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Login.tsx
git commit -m "feat: implement login page"
```

---

## Task 8: Data hooks and format utilities

**Files:**
- Create: `src/hooks/useCustomerBalances.ts`
- Create: `src/hooks/useCustomerBalance.ts`
- Create: `src/hooks/useTransactions.ts`
- Create: `src/hooks/useActivityFeed.ts`
- Create: `src/utils/format.ts`

**Interfaces:**
- Consumes: `supabase` (Task 4), `CustomerBalance`, `Transaction`, `ActivityEntry` (Task 4).
- Produces: `useCustomerBalances()` → `{ data: CustomerBalance[], loading, error, refresh }`; `useCustomerBalance(id)` → `{ data: CustomerBalance | null, loading, error, refresh }`; `useTransactions(customerId)` → `{ data: Transaction[], loading, error, refresh }`; `useActivityFeed(limit)` → `{ data: ActivityEntry[], loading, error, refresh }`; `formatCurrency(amount)`, `formatDate(iso)`.

- [ ] **Step 1: Create `src/hooks/useCustomerBalances.ts`**

```ts
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CustomerBalance } from '../types/db'

export function useCustomerBalances() {
  const [data, setData] = useState<CustomerBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('customer_balances')
      .select('*')
      .order('name', { ascending: true })
    if (error) setError(error.message)
    else setData(data as CustomerBalance[])
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
```

- [ ] **Step 2: Create `src/hooks/useCustomerBalance.ts`**

```ts
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CustomerBalance } from '../types/db'

export function useCustomerBalance(id: number) {
  const [data, setData] = useState<CustomerBalance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('customer_balances')
      .select('*')
      .eq('id', id)
      .single()
    if (error) setError(error.message)
    else setData(data as CustomerBalance)
    setLoading(false)
  }, [id])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
```

- [ ] **Step 3: Create `src/hooks/useTransactions.ts`**

```ts
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Transaction } from '../types/db'

export function useTransactions(customerId: number) {
  const [data, setData] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setData(data as Transaction[])
    setLoading(false)
  }, [customerId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
```

- [ ] **Step 4: Create `src/hooks/useActivityFeed.ts`**

```ts
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ActivityEntry } from '../types/db'

export function useActivityFeed(limit = 50) {
  const [data, setData] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('activity_feed').select('*').limit(limit)
    if (error) setError(error.message)
    else setData(data as ActivityEntry[])
    setLoading(false)
  }, [limit])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
```

- [ ] **Step 5: Create `src/utils/format.ts`**

```ts
export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
```

- [ ] **Step 6: Verify it compiles**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/hooks src/utils/format.ts
git commit -m "feat: add data hooks and format utilities"
```

---

## Task 9: Home dashboard

**Files:**
- Modify: `src/pages/Home.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 5), `useCustomerBalances()` (Task 8), `formatCurrency` (Task 8).

- [ ] **Step 1: Rewrite `src/pages/Home.tsx`**

```tsx
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { formatCurrency } from '../utils/format'

export function Home() {
  const { profile, signOut } = useAuth()
  const { data, loading, error } = useCustomerBalances()

  const totalDue = data.reduce((sum, c) => sum + c.amount_due, 0)
  const totalEmptiesOut = data.reduce((sum, c) => sum + c.empties_outstanding, 0)
  const customersWithDue = data.filter((c) => c.amount_due > 0).length

  return (
    <div className="p-4">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-ink/60">Welcome back</p>
          <h1 className="text-xl font-bold text-ink">{profile?.name ?? '…'}</h1>
        </div>
        <button onClick={signOut} className="text-sm text-accent">
          Log out
        </button>
      </div>

      {loading && <p className="text-ink/60">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs text-ink/60">Amount to collect</p>
            <p className="text-lg font-bold text-ink">{formatCurrency(totalDue)}</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs text-ink/60">Empties outstanding</p>
            <p className="text-lg font-bold text-ink">{totalEmptiesOut}</p>
          </div>
          <div className="col-span-2 rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs text-ink/60">Customers with dues</p>
            <p className="text-lg font-bold text-ink">{customersWithDue}</p>
          </div>
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <Link to="/customers" className="flex-1 rounded-lg bg-accent py-3 text-center font-semibold text-white">
          Customers
        </Link>
        <Link
          to="/activity"
          className="flex-1 rounded-lg border border-accent py-3 text-center font-semibold text-accent"
        >
          Activity
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify manually**

```bash
npm run dev
```

Log in and confirm the Home screen shows totals (all zero on an empty database), your logged-in name, and working "Customers"/"Activity" links.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Home.tsx
git commit -m "feat: implement home dashboard"
```

---

## Task 10: Customers list with add-customer form

**Files:**
- Modify: `src/pages/Customers.tsx`

**Interfaces:**
- Consumes: `useCustomerBalances()` (Task 8), `supabase` (Task 4), `formatCurrency` (Task 8).

- [ ] **Step 1: Rewrite `src/pages/Customers.tsx`**

```tsx
import { FormEvent, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { formatCurrency } from '../utils/format'

export function Customers() {
  const { data, loading, error, refresh } = useCustomerBalances()
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data
    return data.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q))
  }, [data, search])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    const { error } = await supabase.from('customers').insert({ name, phone, address })
    setSaving(false)
    if (error) {
      setFormError(error.message)
      return
    }
    setName('')
    setPhone('')
    setAddress('')
    setShowAdd(false)
    refresh()
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Customers</h1>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-4 space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <input
            required
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-ink/20 px-3 py-2"
          />
          <input
            placeholder="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-ink/20 px-3 py-2"
          />
          <input
            placeholder="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-lg border border-ink/20 px-3 py-2"
          />
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-accent py-2 font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save customer'}
          </button>
        </form>
      )}

      <input
        placeholder="Search by name or phone"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 w-full rounded-lg border border-ink/20 px-3 py-2"
      />

      {loading && <p className="text-ink/60">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      <ul className="space-y-2">
        {filtered.map((c) => (
          <li key={c.id}>
            <Link
              to={`/customers/${c.id}`}
              className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm"
            >
              <div>
                <p className="font-semibold text-ink">{c.name}</p>
                <p className="text-xs text-ink/60">{c.phone}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-accent">{formatCurrency(c.amount_due)}</p>
                <p className="text-xs text-ink/60">{c.empties_outstanding} empties out</p>
              </div>
            </Link>
          </li>
        ))}
        {!loading && filtered.length === 0 && <p className="text-ink/60">No customers found.</p>}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Verify manually**

```bash
npm run dev
```

Add a test customer via the form; confirm it appears in the list immediately, and that searching by part of the name or phone filters correctly.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Customers.tsx
git commit -m "feat: implement customers list and add-customer form"
```

---

## Task 11: Customer detail — balance, owner-only edit/delete, history

**Files:**
- Modify: `src/pages/CustomerDetail.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 5), `useCustomerBalance(id)`, `useTransactions(customerId)`, `formatCurrency`, `formatDate` (Task 8), `supabase` (Task 4).

- [ ] **Step 1: Rewrite `src/pages/CustomerDetail.tsx`**

```tsx
import { FormEvent, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalance } from '../hooks/useCustomerBalance'
import { useTransactions } from '../hooks/useTransactions'
import { formatCurrency, formatDate } from '../utils/format'

export function CustomerDetail() {
  const { id } = useParams()
  const customerId = Number(id)
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const { data: balance, loading, error, refresh: refreshBalance } = useCustomerBalance(customerId)
  const { data: transactions, refresh: refreshTx } = useTransactions(customerId)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)

  function startEdit() {
    if (!balance) return
    setName(balance.name)
    setPhone(balance.phone ?? '')
    setAddress(balance.address ?? '')
    setEditing(true)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('customers').update({ name, phone, address }).eq('id', customerId)
    setSaving(false)
    setEditing(false)
    refreshBalance()
  }

  async function handleDeleteCustomer() {
    if (!confirm('Delete this customer and all their transactions?')) return
    await supabase.from('customers').delete().eq('id', customerId)
    navigate('/customers')
  }

  async function handleDeleteTransaction(txId: number) {
    if (!confirm('Delete this entry?')) return
    await supabase.from('transactions').delete().eq('id', txId)
    refreshTx()
    refreshBalance()
  }

  if (loading) return <p className="p-4 text-ink/60">Loading…</p>
  if (error || !balance) return <p className="p-4 text-red-600">{error ?? 'Customer not found'}</p>

  return (
    <div className="p-4">
      {editing ? (
        <form onSubmit={handleSave} className="mb-4 space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-ink/20 px-3 py-2"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-ink/20 px-3 py-2"
          />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-lg border border-ink/20 px-3 py-2"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-accent py-2 font-semibold text-white">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 rounded-lg border border-ink/20 py-2 font-semibold text-ink"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-ink">{balance.name}</h1>
            <p className="text-sm text-ink/60">{balance.phone}</p>
            <p className="text-sm text-ink/60">{balance.address}</p>
          </div>
          {isOwner && (
            <div className="flex gap-3 text-sm">
              <button onClick={startEdit} className="text-accent">
                Edit
              </button>
              <button onClick={handleDeleteCustomer} className="text-red-600">
                Delete
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs text-ink/60">Amount due</p>
          <p className="text-lg font-bold text-ink">{formatCurrency(balance.amount_due)}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs text-ink/60">Empties outstanding</p>
          <p className="text-lg font-bold text-ink">{balance.empties_outstanding}</p>
        </div>
      </div>

      <div className="mb-6 flex gap-2">
        <Link
          to={`/customers/${customerId}/sale`}
          className="flex-1 rounded-lg bg-accent py-2 text-center text-sm font-semibold text-white"
        >
          New Sale
        </Link>
        <Link
          to={`/customers/${customerId}/return`}
          className="flex-1 rounded-lg border border-accent py-2 text-center text-sm font-semibold text-accent"
        >
          Log Return
        </Link>
        <Link
          to={`/customers/${customerId}/payment`}
          className="flex-1 rounded-lg border border-accent py-2 text-center text-sm font-semibold text-accent"
        >
          Payment
        </Link>
      </div>

      <h2 className="mb-2 font-semibold text-ink">History</h2>
      <ul className="space-y-2">
        {transactions.map((t) => (
          <li key={t.id} className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm">
            <div>
              <p className="text-sm font-semibold capitalize text-ink">{t.type}</p>
              <p className="text-xs text-ink/60">{formatDate(t.created_at)}</p>
            </div>
            <div className="text-right">
              {t.amount > 0 && <p className="text-sm font-semibold text-ink">{formatCurrency(t.amount)}</p>}
              {(t.qty > 0 || t.empties > 0) && (
                <p className="text-xs text-ink/60">
                  qty {t.qty} · empties {t.empties}
                </p>
              )}
            </div>
            {isOwner && (
              <button onClick={() => handleDeleteTransaction(t.id)} className="ml-3 text-xs text-red-600">
                Delete
              </button>
            )}
          </li>
        ))}
        {transactions.length === 0 && <p className="text-ink/60">No transactions yet.</p>}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Verify manually as owner**

Log in with the owner account, open the test customer from Task 10, and confirm the "Edit"/"Delete" links are visible, editing saves correctly, and the three action buttons navigate to their stub pages.

- [ ] **Step 3: Verify manually as staff**

Log out, log in with a staff account, open the same customer, and confirm "Edit"/"Delete" do **not** render.

- [ ] **Step 4: Verify RLS directly (not just the UI)**

While logged in as staff, open the browser console on the customer detail page and run:

```js
window.__test = await (await import('/src/lib/supabase.ts')).supabase.from('customers').update({ name: 'hacked' }).eq('id', 1)
console.log(window.__test)
```

Expected: `data` is an empty array (RLS silently filters out the row) and `error` is `null` — the update affects zero rows. Confirm in the Supabase dashboard that the customer's name did not change.

- [ ] **Step 5: Commit**

```bash
git add src/pages/CustomerDetail.tsx
git commit -m "feat: implement customer detail with owner-gated edit/delete"
```

---

## Task 12: New Sale form

**Files:**
- Modify: `src/pages/NewSale.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 5), `supabase` (Task 4).

- [ ] **Step 1: Rewrite `src/pages/NewSale.tsx`**

```tsx
import { FormEvent, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'

export function NewSale() {
  const { id } = useParams()
  const customerId = Number(id)
  const navigate = useNavigate()
  const { session } = useAuth()
  const [qty, setQty] = useState('1')
  const [empties, setEmpties] = useState('0')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const qtyNum = Number(qty)
    const emptiesNum = Number(empties)
    const amountNum = Number(amount)
    if (qtyNum <= 0 || amountNum <= 0) {
      setError('Quantity and amount must be greater than zero')
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('transactions').insert({
      customer_id: customerId,
      type: 'sale',
      qty: qtyNum,
      empties: emptiesNum,
      amount: amountNum,
      created_by: session?.user.id,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(`/customers/${customerId}`)
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold text-ink">New Sale</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm text-ink/60">
          Cylinders sold
          <input
            type="number"
            min="1"
            required
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink/20 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-ink/60">
          Empties collected
          <input
            type="number"
            min="0"
            value={empties}
            onChange={(e) => setEmpties(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink/20 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-ink/60">
          Amount charged
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink/20 px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-accent py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Record sale'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verify manually**

Log a sale of 2 cylinders, 1 empty collected, ₹1600. Confirm it redirects to the customer detail page and the balance card, empties-outstanding, and history all update correctly.

- [ ] **Step 3: Commit**

```bash
git add src/pages/NewSale.tsx
git commit -m "feat: implement new sale form"
```

---

## Task 13: Log Return form

**Files:**
- Modify: `src/pages/LogReturn.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 5), `supabase` (Task 4).

- [ ] **Step 1: Rewrite `src/pages/LogReturn.tsx`**

```tsx
import { FormEvent, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'

export function LogReturn() {
  const { id } = useParams()
  const customerId = Number(id)
  const navigate = useNavigate()
  const { session } = useAuth()
  const [qty, setQty] = useState('1')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const qtyNum = Number(qty)
    if (qtyNum <= 0) {
      setError('Quantity must be greater than zero')
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('transactions').insert({
      customer_id: customerId,
      type: 'return',
      qty: qtyNum,
      empties: 0,
      amount: 0,
      created_by: session?.user.id,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(`/customers/${customerId}`)
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold text-ink">Log Return</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm text-ink/60">
          Empties returned
          <input
            type="number"
            min="1"
            required
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink/20 px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-accent py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Record return'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verify manually**

Log a return of 1 empty for the same test customer. Confirm `empties_outstanding` on the customer detail page decreases by 1.

- [ ] **Step 3: Commit**

```bash
git add src/pages/LogReturn.tsx
git commit -m "feat: implement log return form"
```

---

## Task 14: Record Payment form

**Files:**
- Modify: `src/pages/RecordPayment.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 5), `supabase` (Task 4).

- [ ] **Step 1: Rewrite `src/pages/RecordPayment.tsx`**

```tsx
import { FormEvent, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'

export function RecordPayment() {
  const { id } = useParams()
  const customerId = Number(id)
  const navigate = useNavigate()
  const { session } = useAuth()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const amountNum = Number(amount)
    if (amountNum <= 0) {
      setError('Amount must be greater than zero')
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('transactions').insert({
      customer_id: customerId,
      type: 'payment',
      qty: 0,
      empties: 0,
      amount: amountNum,
      created_by: session?.user.id,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(`/customers/${customerId}`)
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold text-ink">Record Payment</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm text-ink/60">
          Amount received
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink/20 px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-accent py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Record payment'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verify manually**

Record a ₹1600 payment for the same test customer. Confirm `amount_due` drops to ₹0 on the customer detail page and in the Customers list.

- [ ] **Step 3: Commit**

```bash
git add src/pages/RecordPayment.tsx
git commit -m "feat: implement record payment form"
```

---

## Task 15: Activity feed

**Files:**
- Modify: `src/pages/ActivityFeed.tsx`

**Interfaces:**
- Consumes: `useActivityFeed(limit)`, `formatCurrency`, `formatDate` (Task 8).

- [ ] **Step 1: Rewrite `src/pages/ActivityFeed.tsx`**

```tsx
import { useActivityFeed } from '../hooks/useActivityFeed'
import { formatCurrency, formatDate } from '../utils/format'

export function ActivityFeed() {
  const { data, loading, error } = useActivityFeed(50)

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold text-ink">Activity</h1>
      {loading && <p className="text-ink/60">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}
      <ul className="space-y-2">
        {data.map((entry) => (
          <li key={entry.id} className="rounded-xl bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">{entry.customer_name}</p>
              <p className="text-xs text-ink/60">{formatDate(entry.created_at)}</p>
            </div>
            <p className="text-xs capitalize text-ink/60">
              {entry.type} {entry.amount > 0 && `· ${formatCurrency(entry.amount)}`}
            </p>
          </li>
        ))}
        {!loading && data.length === 0 && <p className="text-ink/60">No activity yet.</p>}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Verify manually**

Open the Activity tab and confirm the sale, return, and payment logged in Tasks 12–14 all appear, most recent first, with the customer's name.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ActivityFeed.tsx
git commit -m "feat: implement activity feed"
```

---

## Task 16: PWA manifest and icon

**Files:**
- Modify: `vite.config.ts`
- Create: `public/icon.svg`
- Modify: `index.html`

**Interfaces:**
- Produces: installable PWA manifest served by `vite-plugin-pwa`.

- [ ] **Step 1: Create `public/icon.svg`**

```svg
<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#DED6C9"/>
  <rect x="196" y="96" width="120" height="280" rx="34" fill="#211913"/>
  <rect x="222" y="70" width="68" height="40" rx="16" fill="#E4571B"/>
  <rect x="208" y="100" width="96" height="40" rx="20" fill="#E4571B"/>
  <rect x="200" y="140" width="112" height="200" rx="46" fill="#E4571B"/>
</svg>
```

- [ ] **Step 2: Rewrite `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Cylinder Tracker',
        short_name: 'Cylinders',
        description: 'Customer ledger for cylinder sales, returns, and payments',
        theme_color: '#E4571B',
        background_color: '#DED6C9',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
})
```

- [ ] **Step 3: Add icon links to `index.html`**

Add these two lines inside `<head>`, after the `theme-color` meta tag:

```html
<link rel="icon" href="/icon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/icon.svg" />
```

- [ ] **Step 4: Verify the PWA build**

```bash
npm run build
npm run preview
```

Open the preview URL in Chrome and confirm an install icon appears in the address bar. Note: if the owner's phone is iOS, Safari's "Add to Home Screen" icon rendering from SVG is less reliable than PNG — if the icon looks wrong on iOS after deployment, generate a proper set of PNG icons from `public/icon.svg` (e.g. via https://realfavicongenerator.net) and swap them into the `icons` array above.

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts public/icon.svg index.html
git commit -m "feat: add pwa manifest and icon"
```

---

## Task 17: Deploy to Cloudflare Pages

**Files:**
- None (infrastructure task)

**Interfaces:**
- Produces: a live app at `https://<project-name>.pages.dev`.

- [ ] **Step 1: Create a GitHub repository and push**

```bash
gh repo create cylinder-tracker --private --source=. --remote=origin --push
```

If `gh` isn't authenticated, create the repo manually at https://github.com/new, then run:

```bash
git remote add origin <your-repo-url>
git branch -M main
git push -u origin main
```

- [ ] **Step 2: Connect Cloudflare Pages**

In the Cloudflare dashboard, go to Workers & Pages → Create → Pages → Connect to Git, select the `cylinder-tracker` repo, and set:
- Build command: `npm run build`
- Build output directory: `dist`

- [ ] **Step 3: Add environment variables**

In the Pages project's Settings → Environment variables, add for both Production and Preview:
- `VITE_SUPABASE_URL` = the value from `.env.local`
- `VITE_SUPABASE_ANON_KEY` = the value from `.env.local`

- [ ] **Step 4: Deploy and verify**

Trigger the deploy (it runs automatically after connecting). Once live, open `https://<project-name>.pages.dev`, log in with the owner account, and confirm the full flow works: view customers, open a customer, log a sale/return/payment, and see it reflected in the Activity feed.

- [ ] **Step 5: Verify owner-only enforcement in production**

Log in as staff on the deployed URL and confirm edit/delete controls are hidden, matching Task 11's verification.

---

## Task 18: Daily Supabase backup via GitHub Action

**Files:**
- Create: `.github/workflows/backup.yml`

**Interfaces:**
- None (scheduled job, no app-code dependency).

- [ ] **Step 1: Get the database connection string**

In the Supabase dashboard, go to Settings → Database → Connection string (URI format, "Session pooler" or direct connection). Copy it — it includes the database password.

- [ ] **Step 2: Add it as a GitHub secret**

```bash
gh secret set SUPABASE_DB_URL --repo <your-github-username>/cylinder-tracker
```

Paste the connection string when prompted.

- [ ] **Step 3: Create `.github/workflows/backup.yml`**

```yaml
name: Daily Supabase Backup

on:
  schedule:
    - cron: '30 20 * * *'
  workflow_dispatch: {}

jobs:
  backup:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Install postgresql-client
        run: sudo apt-get update && sudo apt-get install -y postgresql-client

      - name: Dump database
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: |
          mkdir -p backups
          pg_dump "$SUPABASE_DB_URL" | gzip > "backups/$(date +%F).sql.gz"

      - name: Commit backup
        run: |
          git config user.name "backup-bot"
          git config user.email "backup-bot@users.noreply.github.com"
          git add backups/
          git commit -m "chore: daily backup $(date +%F)" || echo "No changes to commit"
          git push
```

- [ ] **Step 4: Commit and verify**

```bash
git add .github/workflows/backup.yml
git commit -m "chore: add daily supabase backup workflow"
git push
```

In the GitHub repo, go to Actions → "Daily Supabase Backup" → Run workflow (manual trigger via `workflow_dispatch`). Expected: the run succeeds and a new file appears under `backups/` in the repo.

---

## Post-plan notes

- The 20:30 UTC (02:00 IST) backup schedule assumes an India-based agency (consistent with the INR currency formatting) — adjust the cron expression if that's wrong.
- `supabase/schema.sql` is written to run once. If you need to change the schema later, write a new migration file rather than re-running or editing this one, so history stays accurate.
