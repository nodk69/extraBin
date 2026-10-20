# Burn-After-Reading Pastes

## 1. What this is

Burn-After-Reading guarantees that a paste can only be viewed a single time. As soon as the payload is requested and delivered to the recipient's browser, the server atomically and permanently deletes the record from database storage. Any subsequent attempt to open or fetch the paste immediately returns a uniform 404 Not Found error.

---

## 2. Live demo

Test the atomic single-view lifecycle below. Click the simulated view button to inspect the burn animation and observe subsequent access attempts turning into 404 responses.

*(The interactive demo component is rendered above the fold in the ExtraBin web UI.)*

---

## 3. When to use it

### Recommended Use Cases
- **One-Time Passwords & Tokens**: Handing off temporary database passwords or one-time enrollment links.
- **Secret Zero Keys**: Distributing bootstrapping credentials that must not linger in chat histories or email archives.
- **High-Risk Disclosures**: Sensitive logs or private keys that must be discarded immediately upon receipt.

### When not to use it
- **Team Code Reviews**: Scenarios requiring multiple engineers to view or review the same snippet.
- **Reference Documentation**: Persistent guides or configuration manifests.
- **Unstable Network Conditions**: If a network failure occurs after download starts, the content cannot be retrieved again.

---

## 4. Step-by-step: how to create, how to open

### How to Create a Burn-After-Reading Paste
1. On the **Create Paste** page, write or paste your code snippet.
2. In the options sidebar under **Expiration**, select **Burn on read (View Once)**, or toggle the **Burn on read** switch.
3. Submit the paste to receive your single-use share link.

### How to Open a Burn-After-Reading Paste
1. Open the share link in a browser or fetch it via an API tool.
2. ExtraBin delivers the content once and immediately executes an atomic database delete.
3. Refreshing the browser or requesting the URL a second time returns an HTTP 404 response.

---

## 5. Learn more

<a id="mechanics"></a>
### Mechanics & Server Destruction Lifecycle

When a client initiates a request to `/api/v1/pastes/{id}` for a burn-on-read paste, ExtraBin executes the deletion within an isolated database transaction:
1. The paste row is retrieved and marked as consumed.
2. The payload bytes are queued into the HTTP streaming response.
3. The database record and any associated ciphertext blobs are permanently purged.
4. Cache headers are set to `Cache-Control: private, no-cache, no-store, must-revalidate` to prevent intermediate proxy retention.
5. All subsequent requests return indistinguishable 404 Problem Details responses.
