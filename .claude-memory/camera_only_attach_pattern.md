---
name: Camera-only photo attach (PWA)
description: Reusable widget for attaching photos to any DocType from the PWA. Hints back camera on mobile via capture=environment, downscales images client-side, defaults to private files. Wired on Expense Claim and DCR detail screens.
type: project
originSessionId: 01007c65-cab4-4925-b4e8-166fe811929a
---
**Date:** 2026-05-06. **Commit:** `ce7f9c0`.

**API:**
- `UI.attachPhotos({ doctype, docname, label, max })` — returns a DOM element. Renders thumbnail strip of existing image attachments + a "Take photo" button.
- `fieldAPI.uploadFile(file, doctype, docname, opts)` — POSTs to `/api/method/upload_file`. Auto-downscales images to 1600px / 0.85 JPEG before upload. Defaults `is_private=1`.

**File input markup:**
```html
<input type="file" accept="image/*" capture="environment" />
```
- `capture="environment"` is a **hint** to mobile browsers to open the back camera directly.
- On **iPhone Safari / Chrome / Brave / Android Chrome**, this opens the camera. On desktop browsers, it falls back to a normal file picker.
- **There is no web-platform way to STRICTLY block gallery access** — the spec leaves `capture` advisory. For the user's "camera only, not gallery" requirement, this is the closest. In practice, all field staff are on mobile PWAs where it works as expected.

**Privacy default:**
- `is_private=1` puts files at `/private/files/...` requiring authentication. Browser's session cookie covers `<img src="/private/files/...">` for the logged-in user. Override with `opts.is_private=0` if a file should be public-readable.

**Why downscaling:**
- Phone cameras produce 4–6 MB JPEGs. Frappe's `max_file_size` is configurable, but uploading 4 MB over Indian mobile networks is slow. 1600px / 0.85 JPEG is ~300–500 KB and visually identical for receipt / site documentation.
- The downscaling is OPT-OUT via `opts.optimize=false` if a caller needs the original.

**Wired in:**
- `vaishali/public/field/screens/expense.js` → expense detail screen, label "Receipt photos", attaches to `Expense Claim`.
- `vaishali/public/field/screens/visits.js` → visit detail screen, label "Site photos", attaches to `Daily Call Report`.

**How to apply:** To add photo attach to any other PWA screen:
```js
if (UI.attachPhotos) {
  appEl.appendChild(UI.attachPhotos({
    doctype: 'My DocType',
    docname: doc.name,
    label: 'Photos',
    max: 8
  }));
}
```
The widget loads existing image attachments from `/api/resource/File` filtered by `attached_to_doctype` + `attached_to_name`, filters to image extensions only (`jpe?g|png|gif|webp|heic|heif`), and renders thumbnails. Tap thumb to open full-size; tap × to delete (with confirm). New uploads append in real time.

**Don't:** call `fieldAPI.uploadFile` before the parent doc exists. The parent must have a `name` to attach to. For "during creation" UX, save the parent first (server returns name), then redirect to detail and show the camera widget.
