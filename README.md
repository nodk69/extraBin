# ExtraBin

A modern, high-performance, developer-first code and text sharing platform built with **Spring Boot 3.3**, **PostgreSQL**, **Flyway**, **React 18**, **TypeScript**, and **Tailwind CSS**.

ExtraBin combines zero-knowledge client-side encryption, granular lifecycle controls, programmatic API endpoints, multi-file code snippets, interactive revision history, and a developer discovery feed into a cohesive experience.

---

## Key Features

### 1. Zero-Knowledge Cryptographic Privacy
- **Client-Side AES-256-GCM**: End-to-end encryption in the browser using the Web Crypto API.
- **Passphrase & Direct Link Keys**: Paste keys never reach the server; decryption keys are embedded solely in URL hash fragments (`#key=...`) or derived via PBKDF2 with client-generated salts.
- **Blind Storage**: The server acts strictly as an untrusted ciphertext broker.

### 2. Multi-File Workspaces & Snippets
- **Multi-Tab Code Editing**: Group manifests, configuration files, and multiple code assets in a single paste.
- **Language & Technology Detection**: Syntax highlighting and automated language recognition with Shiki.
- **Multi-File Versioning**: Every revision snapshots primary and supporting files with unified diff navigators.

### 3. Developer Discovery & Community Network
- **Trending Snippets**: Time-windowed algorithm ranking trending code snippets with discussion weightings.
- **Public Author Profiles**: Attributed developer snippets, social profiles, aggregated public save metrics, and follow feeds.
- **Discussion Threads**: Nested replies, comment threads, vote mechanics, and real-time activity events.

### 4. Granular Sharing & Security Controls
- **Burn-After-Reading**: Atomic single-view retrieval; content is automatically purged immediately upon display.
- **Password Protection**: BCrypt-hashed password verification for restricted-access pastes.
- **Programmatic API Surfaces**: Fetch raw paste bodies or typed endpoints directly (`.json`, `.yaml`, `.txt`, `.csv`, `.md`, `.xml`) with SHA-256 ETags and HTTP caching.
- **Sandboxed Responsive Embeds & QR Codes**: Fast embed generation for blogs and documentation, plus scannable QR codes for mobile transfer.
- **CSRF & Cookie Protection**: Strict SameSite cookie enforcement, custom header authentication, and CSRF token binding.

---

## Architecture & Tech Stack

```
PasteBin/
├── backend/                  # Java 21 / Spring Boot 3.3 REST API
│   ├── src/main/java/        # Domain-driven architecture (paste, identity, discovery, notification)
│   ├── src/main/resources/   # Application configuration & Flyway migrations (V1 - V22)
│   └── pom.xml               # Maven project specification
├── frontend/                 # React 18 / TypeScript / Vite Single Page Application
│   ├── src/features/         # Feature-based modular architecture (pastes, authors, discovery, auth, dashboard)
│   ├── src/components/       # Reusable UI system (dropdowns, skeletons, badges, modals)
│   ├── src/styles/           # Design system tokens and styling
│   └── package.json          # Node dependencies & scripts
└── infra/                    # Deployment configurations & Prometheus alerting
    └── compose/              # Docker compose orchestration
```

### Technology Highlights
- **Backend**: Java 21, Spring Boot 3.3, Spring Security, Spring Data JPA / Hibernate, Flyway, PostgreSQL.
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide React, Shiki.
- **Security**: Web Crypto API (AES-GCM, PBKDF2), BCrypt password hashing, session cookies with Lax/Strict policies, CSRF protection.

---

## Getting Started

### Prerequisites
- **Java**: OpenJDK 21 or higher
- **Node.js**: Node 18+ (Node 20+ recommended) and npm
- **Database**: PostgreSQL 15+

---

### Backend Setup

1. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Configure Environment Variables**:
   Copy or configure your local database connection:
   ```bash
   # Linux / macOS
   export SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5432/pastebin"
   export SPRING_DATASOURCE_USERNAME="postgres"
   export SPRING_DATASOURCE_PASSWORD="password"

   # Windows (PowerShell)
   $env:SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5432/pastebin"
   $env:SPRING_DATASOURCE_USERNAME="postgres"
   $env:SPRING_DATASOURCE_PASSWORD="password"
   ```

3. **Run Database Migrations & Start the Server**:
   ```bash
   # Windows
   .\mvnw.cmd spring-boot:run

   # Linux / macOS
   ./mvnw spring-boot:run
   ```

   The backend API will start on `http://localhost:8080`.
   - **Swagger / OpenAPI Documentation**: `http://localhost:8080/swagger-ui.html`
   - **API Docs Spec**: `http://localhost:8080/v3/api-docs`

---

### Frontend Setup

1. **Navigate to the frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Start the Development Server**:
   ```bash
   npm run dev
   ```

   The SPA will be available at `http://localhost:5173`.

---

## Configuration Reference

Key application properties configurable via environment variables:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `SERVER_PORT` | `8080` | Port for the backend service |
| `APP_CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Allowed CORS origins |
| `APP_MAX_PASTE_BYTES` | `1048576` (1MB) | Maximum payload size per paste |
| `PASTEBIN_SHARE_PUBLIC_BASE_URL`| `http://localhost:5173` | Public URL prefix for shareable links |
| `SPRING_DATASOURCE_URL` | — | PostgreSQL JDBC connection string |
| `SUPABASE_URL` | — | (Optional) Supabase auth provider URL |
| `SUPABASE_ANON_KEY` | — | (Optional) Supabase anonymous public key |
| `SENTRY_DSN` | — | (Optional) Error monitoring DSN |

---

## Production Deployment (Docker Compose)

For a full containerized deployment:

```bash
cd infra/compose
docker compose up -d --build
```

This brings up:
- ExtraBin Spring Boot API backend
- ExtraBin React SPA served via Nginx reverse proxy
- PostgreSQL persistent database
- Optional Prometheus metrics scrapers & monitoring

---

## License

This project is licensed under the MIT License.
