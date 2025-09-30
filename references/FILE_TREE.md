# Orbit Repository Structure

```
orbit/
├─ apps/
│  ├─ backend/
│  │  ├─ app/
│  │  │  ├─ __init__.py
│  │  │  ├─ config.py
│  │  │  ├─ extensions.py
│  │  │  ├─ logging.py
│  │  │  ├─ models.py
│  │  │  ├─ auth/
│  │  │  │  └─ routes.py
│  │  │  ├─ api/
│  │  │  │  ├─ __init__.py
│  │  │  │  ├─ utils.py
│  │  │  │  └─ resources/
│  │  │  │     ├─ compliance.py
│  │  │  │     ├─ credential_profiles.py
│  │  │  │     ├─ devices.py
│  │  │  │     ├─ eox_hardware.py
│  │  │  │     ├─ eox_queries.py
│  │  │  │     ├─ eox_software.py
│  │  │  │     ├─ interfaces.py
│  │  │  │     ├─ inventory_groups.py
│  │  │  │     ├─ ip_addresses.py
│  │  │  │     ├─ logs.py
│  │  │  │     ├─ operations.py
│  │  │  │     ├─ platform_operation_templates.py
│  │  │  │     └─ snapshots.py
│  │  │  ├─ services/
│  │  │  │  └─ operations.py
│  │  │  └─ utils/
│  │  │     └─ mailer.py
│  │  ├─ docker/
│  │  │  └─ gunicorn.conf.py
│  │  ├─ tests/
│  │  │  ├─ conftest.py
│  │  │  ├─ test_auth.py
│  │  │  ├─ test_devices.py
│  │  │  └─ test_eox.py
│  │  ├─ requirements.txt
│  │  ├─ wsgi.py
│  │  ├─ manage.py
│  │  ├─ .env.dev.example
│  │  ├─ .env.stage.example
│  │  └─ .env.prod.example
│  └─ frontend/
│     ├─ index.html
│     ├─ package.json
│     ├─ tsconfig.json
│     ├─ tsconfig.node.json
│     ├─ vite.config.ts
│     ├─ tailwind.config.ts
│     ├─ postcss.config.cjs
│     ├─ .eslintrc.cjs
│     ├─ .prettierrc
│     ├─ public/
│     │  └─ favicon.svg
│     └─ src/
│        ├─ main.tsx
│        ├─ App.tsx
│        ├─ app/
│        │  ├─ AppProviders.tsx
│        │  ├─ routes.tsx
│        │  └─ store/
│        │     └─ index.ts
│        ├─ components/
│        │  ├─ ui/
│        │  │  ├─ Button.tsx
│        │  │  ├─ Icon.tsx
│        │  │  ├─ Input.tsx
│        │  │  ├─ LoadingOverlay.tsx
│        │  │  ├─ Modal.tsx
│        │  │  └─ Toggle.tsx
│        │  └─ layout/
│        │     ├─ Header.tsx
│        │     ├─ Page.tsx
│        │     └─ ThemeToggle.tsx
│        ├─ features/
│        │  ├─ auth/
│        │  │  ├─ api/
│        │  │  │  └─ auth.api.ts
│        │  │  ├─ components/
│        │  │  │  ├─ LoginForm.tsx
│        │  │  │  └─ ProtectedRoute.tsx
│        │  │  └─ pages/
│        │  │     └─ LoginPage.tsx
│        │  └─ devices/
│        │     ├─ api/
│        │     │  └─ devices.api.ts
│        │     ├─ components/
│        │     │  └─ DeviceTable.tsx
│        │     └─ pages/
│        │        └─ DevicesListPage.tsx
│        ├─ pages/
│        │  ├─ Home.tsx
│        │  └─ NotFound.tsx
│        ├─ hooks/
│        │  ├─ useAuth.ts
│        │  ├─ useCookies.ts
│        │  ├─ useLocalStorage.ts
│        │  └─ useTheme.ts
│        ├─ contexts/
│        │  └─ ThemeContext.tsx
│        ├─ lib/
│        │  ├─ apiClient.ts
│        │  ├─ constants.ts
│        │  ├─ cookies.ts
│        │  └─ types/
│        │     └─ index.ts
│        ├─ styles/
│        │  ├─ index.css
│        │  └─ theme.css
│        ├─ assets/
│        │  ├─ icons/
│        │  │  ├─ moon.svg
│        │  │  └─ sun.svg
│        │  └─ logos/
│        │     ├─ orbit_dark_animated_full.svg
│        │     ├─ orbit_dark_animated_icon.svg
│        │     ├─ orbit_dark_still_full.svg
│        │     ├─ orbit_dark_still_icon.svg
│        │     ├─ orbit_light_animated_full.svg
│        │     ├─ orbit_light_animated_icon.svg
│        │     ├─ orbit_light_still_full.svg
│        │     └─ orbit_light_still_icon.svg
│        ├─ tests/
│        │  └─ setup.ts
│        └─ vite-env.d.ts
├─ packages/
│  └─ shared/
│     ├─ python/
│     │  └─ .gitkeep
│     └─ ts/
│        └─ .gitkeep
├─ docker/
│  ├─ Dockerfile.backend
│  └─ Dockerfile.frontend
├─ infra/
│  └─ nginx/
│     └─ .gitkeep
├─ references/
│  ├─ FILE_TREE.md
│  ├─ frontend_guidelines.txt
│  └─ .gitkeep
├─ .vscode/
│  ├─ extensions.json
│  ├─ launch.json
│  ├─ settings.json
│  └─ tasks.json
├─ compose.yml
├─ compose.dev.debug.yml
├─ .gitignore
├─ README.md
└─ Makefile
```
