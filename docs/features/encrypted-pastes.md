# Zero-Knowledge Encrypted Pastes

## 1. What this is

Zero-Knowledge Encrypted Pastes provide client-side confidentiality for sensitive code, keys, and documents. When enabled, your web browser encrypts your text using the standard Web Crypto API (AES-256-GCM) before transmitting it across the network. The ExtraBin server acts solely as blind storage: it receives and stores encrypted ciphertext bytes, but never receives your secret decryption keys or readable content.

---

## 2. Live demo

Experience zero-knowledge encryption directly inside your browser below. You can toggle between Link Key, Passphrase, and Dual-Access modes, generate random ciphertexts, and verify decryption round-trips entirely on the client.

*(The interactive demo component is rendered above the fold in the ExtraBin web UI.)*

---

## 3. When to use it

### Recommended Use Cases
- **Secret Credentials**: Distributing API keys, database credentials, SSH private keys, and environment variables across teams.
- **Sensitive Configurations**: Sharing `.env` files, production tokens, or certificates where zero third-party visibility is mandatory.
- **Confidential Code & Logs**: Sharing proprietary code excerpts, stack traces containing customer data, or internal incident logs.
- **Regulatory Compliance**: Scenarios requiring cryptographic proof that cloud providers or hosting infrastructure operators cannot read data at rest.

### When not to use it
- **Public Syntax Highlighting**: Because content is encrypted client-side, server-side syntax analyzers and search indexers cannot parse or inspect the code.
- **Automated Ingestion via Typed API**: Encrypted pastes cannot be consumed via ExtraBin's typed suffix endpoints (`.json`, `.yaml`, `.csv`, etc.). Any attempt to request an encrypted paste via typed endpoints returns an HTTP 404 response by design.
- **Unreliable Link Transit**: If you choose Link Key mode and send the URL through chat platforms or email proxies that strip URL fragments (`#key=...`), recipients without dual-access protection will not be able to decrypt the content.

---

## 4. Step-by-step: how to create, how to open

### How to Create an Encrypted Paste
1. Navigate to the **Create Paste** screen in ExtraBin.
2. Enter your title, select the language syntax, and enter the file content.
3. In the right-hand options sidebar, scroll to the **End-to-End Encryption** section.
4. Check the **Enable E2E** checkbox (`id="e2e-encryption-toggle"`). The options panel will expand.
5. Under **Access Mode**, select your desired key distribution mechanism:
   - Click **🔗 Link Key** (`Key in URL fragment`) for zero-password link sharing.
   - Click **🔑 Passphrase** (`Password required`) to mandate passphrase entry.
6. If **🔗 Link Key** is selected and you want fallback protection, check **Wrap with passphrase (Dual Access)**.
7. Enter your secret passphrase (if using Passphrase or Dual Access mode).
8. Click **Create paste**. The browser generates random salts and keys, encrypts the payload, posts the ciphertext to `/api/v1/pastes/encrypted`, and opens the paste.

### How to Open an Encrypted Paste
- **Link Key Pastes (Automatic Decryption)**: The recipient opens the full link containing `#key=...`. The browser extracts the key from `window.location.hash`, decrypts the ciphertext locally via `crypto.subtle.decrypt()`, and renders the plaintext.
- **Passphrase Pastes (Manual Decryption)**: The recipient visits the paste URL, enters the secret passphrase into the unlock modal, and clicks **Decrypt Paste**. The browser derives the AES key via PBKDF2 (600,000 iterations) and decrypts the payload.

---

## 5. Learn more

### Access Modes Comparison (Canonical Specification)

ExtraBin supports two primary encryption modes (`LINK` and `PASSPHRASE`) and one hybrid variant (`LINK` with dual-access passphrase wrapping).

| Mode | Secret Location | Decryption Invariant | What Is Stored on Server | What You Share | If URL Leaks |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Link Key** | URL fragment (`#key=...`) | Key in `#key=` fragment decrypts payload directly | Encrypted ciphertext, nonce, auth tag, salt | Full URL with fragment | Anyone with full URL can view paste immediately |
| **Passphrase-Only** | User memory / offline channel | PBKDF2 derived key (600,000 iterations) required | Encrypted ciphertext, nonce, auth tag, salt | Base URL + passphrase via separate channel | Leaked URL reveals nothing; cannot open without passphrase |
| **Dual-Access** | URL fragment AND passphrase wrapping | Either link key OR derived passphrase unwraps payload | Ciphertext, nonce, auth tag, salt, wrapped key | Full URL with fragment + optional passphrase | Anyone with fragment can decrypt; if fragment stripped, passphrase decrypts |

> *Note on Dual-Access*: Dual-access provides transport resilience when chat apps or email clients strip URL fragments. It does not enforce two-factor authentication; possessing either valid link key fragment or passphrase is independently sufficient.

### Threat Model & Server Visibility
The ExtraBin server acts as a blind locker. It stores ciphertext bytes and nonces, but never sees:
- **Plaintext Content**: Plaintext never leaves your browser unencrypted.
- **Link Encryption Keys**: URL fragments (`#key=...`) are strictly client-side and never sent in HTTP headers or web server request logs.
- **Passphrases**: Passphrases are processed only by client-side PBKDF2 key derivation.

### Irreversible Data Loss Policy
Zero-knowledge architecture provides absolute privacy by eliminating administrative backdoors.

If you lose the link key or forget the passphrase, the paste cannot be recovered by anyone, including ExtraBin administrators; the data is permanently lost.

There are no password reset links, master recovery keys, administrative decryption utilities, or encrypted database escrow systems. If cryptographic credentials are lost, the stored ciphertexts remain cryptographically unrecoverable random noise.

### Burn-After-Reading Mechanics
When **Burn on read** is enabled on an encrypted paste, ExtraBin enforces single-read lifecycle destruction:
1. When any client fetches the paste payload from `/api/v1/pastes/{id}`, the backend database transaction marks the record as consumed and purges the ciphertext immediately.
2. The payload is delivered to the requesting browser for local decryption.
3. If the recipient enters an incorrect passphrase, or if their browser environment fails during decryption, the paste cannot be re-fetched. Any subsequent HTTP request returns HTTP 404 Problem Details.
