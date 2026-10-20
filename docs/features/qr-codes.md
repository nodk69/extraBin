# Mobile QR Codes

## 1. What this is

Mobile QR Codes generate a scannable QR image for any paste's public URL, enabling quick handoff to phones and other devices. Point your phone camera at the code to open the paste instantly — no typing required. You can also download the QR image as a PNG for offline sharing.

---

## 2. Live demo

Generate a QR code below for a simulated paste URL. Adjust the input to see how the QR code updates, and explore the download workflow.

*(The interactive demo component is rendered above the fold in the ExtraBin web UI.)*

---

## 3. When to use it

### Recommended Use Cases
- **Multi-Device Handoff**: Quickly transferring a paste URL from your desktop to your phone without copying and pasting.
- **Presentation Demos**: Displaying a scannable code on a projector or shared screen so attendees can open the paste on their phones.
- **Offline Sharing**: Printing or saving the QR image for physical distribution (e.g., conference badges, handouts).

### When not to use it
- **Private or Encrypted Pastes**: The QR code encodes the standard public URL. For encrypted pastes with link keys, the URL fragment (`#key=...`) is included, but scanning may not work reliably across all QR readers that strip fragments.
- **Password-Protected Pastes**: The QR code encodes the base URL only — the recipient still needs the password entered manually.
- **Burn-After-Reading Pastes**: Scanning the QR code counts as a view and will consume the single-read lifecycle.

---

## 4. Step-by-step: how to create, how to open

### How to Generate a QR Code
1. Open any paste on the **View Paste** page.
2. Click the **QR Code** button (or QR icon) in the paste actions toolbar.
3. The QR modal opens showing a scannable code for the paste's canonical URL (`{origin}/p/{pasteId}`).
4. The URL is displayed in a read-only field below the QR image.

### How to Scan a QR Code
1. Open your phone's camera app or a QR scanner.
2. Point it at the displayed QR code.
3. Your phone opens the paste URL directly in the browser.

### How to Download the QR Image
1. In the QR modal, click the **Download PNG** button.
2. The QR image is saved as `{paste-title}-qrcode.png` (non-alphanumeric characters in the title are replaced with underscores).

### How to Copy the URL
1. In the QR modal, click the **Copy** button next to the URL field.
2. The canonical paste URL is copied to your clipboard.

---

## 5. Learn more

### Technical Details
- **Library**: QR codes are generated client-side using the `qrcode` npm package.
- **Error Correction**: Level M (medium) — can recover up to 15% of damaged data.
- **Dimensions**: 240×240 pixels with a 2-module quiet zone margin.
- **Colors**: Dark modules use ExtraBin's primary dark (`#17201d`), light modules use the cream background (`#faf8f2`).
- **No Backend Endpoint**: QR generation is entirely client-side. The QR encodes the standard public paste URL — no special API call is made.

### URL Format
The QR code encodes the canonical paste URL:
```
https://your-extrabin-instance/p/{pasteId}
```

For encrypted pastes with link keys, the full URL including the fragment is encoded:
```
https://your-extrabin-instance/p/{pasteId}#key={encryptionKey}
```

### Privacy Considerations
- The QR code contains only the paste URL. No authentication tokens, session cookies, or user identifiers are embedded.
- For unlisted pastes, anyone who scans the QR code can access the paste — treat the QR image with the same sensitivity as the URL itself.
