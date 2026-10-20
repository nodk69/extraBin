# Password-Protected Pastes

## 1. What this is

Password-Protected Pastes restrict access to your snippets using server-side passcode hashing. Recipients must enter the correct password before the server releases the paste content. This is ideal for controlled team sharing when zero-knowledge end-to-end encryption is not required but unauthorized link viewing must be prevented.

---

## 2. Live demo

Test password verification simulation below. Enter test passwords to observe authentication barriers and credential validation feedback.

*(The interactive demo component is rendered above the fold in the ExtraBin web UI.)*

---

## 3. When to use it

### Recommended Use Cases
- **Team Code Snippets**: Sharing internal scripts with colleagues over open channels.
- **Controlled API Endpoints**: Requiring `X-Paste-Password` headers on typed suffix endpoints.
- **Accidental Click Protection**: Preventing automated bots, crawler indexing, or accidental link clicks from viewing snippets.

### When not to use it
- **Zero-Knowledge Secrecy**: Unlike end-to-end encryption, the server stores and verifies hashes and delivers readable text upon successful authentication. For complete server blindness, use [Zero-Knowledge Encrypted Pastes](encrypted-pastes.md).
- **Public Open-Source Snippets**: Unrestricted community snippets should be shared as unlisted or public pastes.

---

## 4. Step-by-step: how to create, how to open

### How to Create a Password-Protected Paste
1. Create a paste with code or text on the ExtraBin creation workbench.
2. In the sidebar under **Access Controls**, check **Password Protect**.
3. Type your chosen password into the password field.
4. Click **Create paste** to receive your shareable link.

### How to Open a Password-Protected Paste
1. Navigate to the paste link.
2. When the password prompt appears, type the passcode and click **Unlock**.
3. For automated requests, supply the password header: `X-Paste-Password: <passcode>`.

---

## 5. Learn more

### Cryptographic Security Model
ExtraBin hashes paste passcodes using standard BCrypt algorithms with a salt generated per record. When fetching via typed API endpoints, credentials are evaluated before cache validation, ensuring unauthorized requests receive HTTP 401 Unauthorized responses.
