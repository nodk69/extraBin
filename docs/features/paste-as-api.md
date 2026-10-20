# Paste as API: Typed Endpoints, ETags, and Cache Control

## 1. What this is

Paste as API turns any unencrypted ExtraBin snippet into a live programmatic endpoint. By appending an extension suffix (`.json`, `.yaml`, `.md`, `.txt`, `.csv`, `.xml`) to the paste URL, developers, automation scripts, and CI/CD runners can ingest raw text formatted with standard MIME headers, deterministic SHA-256 ETags for caching, and HTTP 304 conditional revalidation.

---

## 2. Live demo

Inspect interactive API endpoints, test format suffix switching, and review simulated `curl` requests with HTTP response headers directly in the interactive demo below.

*(The interactive demo component is rendered above the fold in the ExtraBin web UI.)*

---

## 3. When to use it

### Recommended Use Cases
- **Automated Configuration Ingestion**: Microservices, Docker initialization scripts, and Kubernetes containers fetching live JSON or YAML configurations.
- **CI/CD Pipeline Automation**: Continuous integration runners fetching shell provisioning scripts or test fixtures during build jobs.
- **Markdown Documentation Syndication**: Remote documentation portals and static site generators embedding live READMEs or architectural guides.
- **Data Pipeline Ingestion & Testing**: Automated test suites consuming sample CSV or XML datasets.

### When not to use it
- **End-to-End Encrypted Pastes**: Encrypted pastes contain ciphertexts and cannot be ingested via typed suffix routes (returns HTTP 404 by design).
- **Binary Media Files**: Typed endpoints serve text content and structured formats; binary blobs or executables are rejected.
- **High-Frequency Realtime Streams**: ExtraBin is designed for static and versioned snippet sharing, not real-time event pub/sub.

---

## 4. Step-by-step: how to create, how to open

### How to Create an API-Ready Paste
1. Create a standard paste with code, JSON, YAML, Markdown, or raw text.
2. Ensure **End-to-End Encryption** is unchecked (typed endpoints serve readable formats).
3. Set your visibility: **Public** for CDN-cached access, **Unlisted** for direct link access, or enter a **Password** if you wish to restrict API access.
4. Save the paste to obtain your paste ID (e.g., `Y5voMx29AT`).

### How to Fetch via Typed API
1. Append the desired format suffix to the paste endpoint route:
   ```bash
   curl -s https://bin.example.com/api/v1/pastes/Y5voMx29AT.json
   ```
2. For password-protected pastes, provide the `X-Paste-Password` header:
   ```bash
   curl -s -H "X-Paste-Password: SecretPassphrase" https://bin.example.com/api/v1/pastes/TYkOHHF68A.json
   ```
3. Use `If-None-Match` with the received ETag to receive fast `304 Not Modified` responses when content has not changed.

---

## 5. Learn more

### Supported Endpoints & Content Types

ExtraBin maps six literal typed suffix routes to ensure correct HTTP response headers:

| Suffix | Endpoint Route | MIME Content-Type | Typical Use Case |
| :--- | :--- | :--- | :--- |
| `.json` | `/api/v1/pastes/{id}.json` | `application/json` | Configurations, API payloads, data fixtures |
| `.yaml` | `/api/v1/pastes/{id}.yaml` | `application/yaml` | Kubernetes manifests, Docker Compose, CI workflows |
| `.md` | `/api/v1/pastes/{id}.md` | `text/markdown` | Documentation, release notes, engineering specs |
| `.txt` | `/api/v1/pastes/{id}.txt` | `text/plain` | Plain text logs, shell scripts, raw notes |
| `.csv` | `/api/v1/pastes/{id}.csv` | `text/csv` | Tabular data exports, test tables |
| `.xml` | `/api/v1/pastes/{id}.xml` | `application/xml` | SOAP messages, RSS feeds, legacy payloads |

### Caching Architecture & Deterministic ETags
- **ETag Generation**: Computed deterministically as the SHA-256 digest of the raw UTF-8 content bytes, base64url-encoded without padding. Identical content produces identical ETags across all suffix routes.
- **Cache-Control Headers**:
  - *Public*: `public, max-age=300, must-revalidate` (CDN and browser cacheable for 5 minutes).
  - *Unlisted*: `private, no-cache` (browser revalidates before serving).
  - *Private*: `private, no-store` (never written to disk or shared caches).
  - *Burn-After-Reading*: `private, no-cache, no-store, must-revalidate`.

### What You Cannot Fetch via Typed Endpoints

| Scenario | HTTP Status | Response Reason |
| :--- | :--- | :--- |
| **End-to-End Encrypted Pastes** | `404 Not Found` | Encrypted pastes contain ciphertexts; rejected to eliminate data confusion. |
| **Burn-After-Reading (Second Fetch)** | `404 Not Found` | Content is atomically purged upon initial retrieval. |
| **Expired Pastes** | `404 Not Found` | Expired records are treated as deleted. |
| **Non-Existent Paste ID** | `404 Not Found` | Identical response to expired and burned pastes to eliminate timing oracles. |
| **Unsupported File Suffix** | `404 Not Found` | Requests for `.exe`, `.html`, etc., return 404. |

### Known Limitation: Password-Protected Pastes
A 401 response confirms that the paste exists and is password-protected. If you need to probe paste IDs without revealing which ones are password-protected, this endpoint will not help you — the 404-versus-401 distinction is itself information. This is the current contract, consistent with the /raw and /download endpoints. A future ADR-004 will move to returning 404 for the no-password case; until then, 401 is what the server returns.
