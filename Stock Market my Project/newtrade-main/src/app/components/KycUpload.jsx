/* ── KYC document capture ──────────────────────────────────────────────────────
   Replaces the old "paste a Google Drive link" fields. Documents are uploaded as
   real files to POST /kyc/upload, which returns a relative path such as
   /kyc/document/<user_id>/<uuid>.jpg. That path is what goes into the KYC form
   state and, on submit, into the *_url columns.

   Documents are identity papers, so they are never public: previews are fetched
   from the API with the JWT as a query param, because <img> cannot send an
   Authorization header.                                                        */

import { useState, useRef, useEffect, useCallback } from "react";
import { Camera, Upload, X, Check, Loader2, RefreshCw, AlertTriangle } from "lucide-react";

const API_BASE = "http://127.0.0.1:5050/v1";

const getToken = () => localStorage.getItem("access_token");

/* Mirrors the server's limits — catching these client-side saves a round trip
   with a 5 MB body just to be told no. The server still enforces both. */
const MAX_BYTES    = 5 * 1024 * 1024;
const ACCEPT_MIME  = ["image/png", "image/jpeg", "image/webp"];
const ACCEPT_ATTR  = "image/png,image/jpeg,image/webp";

/** Full URL for previewing an already-uploaded document. */
export const docPreviewUrl = (path) =>
  path ? `${API_BASE}${path}?token=${encodeURIComponent(getToken() || "")}` : "";

/** POST one file to /kyc/upload. Resolves to the stored path. */
async function uploadDocument(file) {
  const form = new FormData();
  form.append("file", file);
  // No Content-Type header — the browser must set the multipart boundary itself.
  const res  = await fetch(`${API_BASE}/kyc/upload`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body:    form,
  });
  const data = await res.json();
  if (!data?.bool) throw new Error(data?.response?.message || "Upload failed.");
  return data.response.url;
}

function validateFile(file) {
  if (!ACCEPT_MIME.includes(file.type)) return "Please choose a PNG, JPG or WEBP image.";
  if (file.size > MAX_BYTES)            return "Image is too large (max 5 MB).";
  if (file.size === 0)                  return "That file is empty.";
  return null;
}

/* ── A single document slot: pick a photo, see it, replace or remove it ─────── */
export function DocUpload({ label, field, value, onChange, hint }) {
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    const bad = validateFile(file);
    if (bad) { setError(bad); return; }
    setError("");
    setBusy(true);
    try {
      onChange(field, await uploadDocument(file));
    } catch (e) {
      setError(e.message || "Upload failed.");
    } finally {
      setBusy(false);
      // Let the same file be re-picked after a failure.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <label className="text-xs text-gray-500 mb-1.5 block">{label}</label>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {value ? (
        <div className="flex items-center gap-3 bg-[#141C30] border border-emerald-500/20 rounded-xl p-2">
          <img
            src={docPreviewUrl(value)}
            alt={label}
            className="w-12 h-12 rounded-lg object-cover bg-[#0C1220]"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <Check className="w-3.5 h-3.5" /> Uploaded
            </div>
            <div className="text-xs text-gray-600 mt-0.5">Ready to submit</div>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="p-1.5 text-gray-500 hover:text-cyan-400 transition-colors"
            title="Replace"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => { onChange(field, ""); setError(""); }}
            className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
            title="Remove"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 bg-[#141C30] border border-dashed border-white/12 hover:border-cyan-500/40 rounded-xl px-3 py-3.5 text-sm text-gray-400 hover:text-cyan-400 transition-colors disabled:opacity-60 cursor-pointer"
        >
          {busy
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
            : <><Upload className="w-4 h-4" /> Choose photo</>}
        </button>
      )}

      {hint  && !value && <p className="text-xs text-gray-600 mt-1.5">{hint}</p>}
      {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
    </div>
  );
}

/* ── Live selfie capture ────────────────────────────────────────────────────────
   getUserMedia needs a secure context: localhost counts, but on a LAN IP or plain
   HTTP the browser blocks the camera outright. The file-picker fallback below is
   what keeps KYC completable in that case (and on desktops with no webcam).    */
export function SelfieCapture({ field, value, onChange }) {
  const [open,  setOpen]  = useState(false);
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const fileRef   = useRef(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /* Release the camera if the user navigates away with the modal still open —
     without this the webcam light stays on until the tab closes. */
  useEffect(() => stopCamera, [stopCamera]);

  const openCamera = async () => {
    setError("");
    setOpen(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("no-api");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (e) {
      stopCamera();
      // Distinguish "you said no" from "there is no camera" — the fixes differ.
      const name = e?.name || e?.message;
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Camera permission was denied. Allow it in your browser, or upload a photo instead."
          : name === "NotFoundError" || name === "DevicesNotFoundError"
          ? "No camera found. Please upload a photo instead."
          : "Could not start the camera. Please upload a photo instead."
      );
    }
  };

  const closeCamera = () => { stopCamera(); setOpen(false); };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setBusy(true);
    setError("");
    try {
      // Square centre-crop so the selfie matches the preview the user framed.
      const size   = Math.min(video.videoWidth, video.videoHeight);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        video,
        (video.videoWidth - size) / 2, (video.videoHeight - size) / 2, size, size,
        0, 0, size, size
      );
      const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.9));
      if (!blob) throw new Error("Could not capture the photo.");
      const file = new File([blob], "selfie.jpg", { type: "image/jpeg" });
      const bad  = validateFile(file);
      if (bad) throw new Error(bad);
      onChange(field, await uploadDocument(file));
      closeCamera();
    } catch (e) {
      setError(e.message || "Capture failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleFallbackFile = async (file) => {
    if (!file) return;
    const bad = validateFile(file);
    if (bad) { setError(bad); return; }
    setBusy(true);
    setError("");
    try {
      onChange(field, await uploadDocument(file));
      closeCamera();
    } catch (e) {
      setError(e.message || "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <label className="text-xs text-gray-500 mb-1.5 block">Selfie</label>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => handleFallbackFile(e.target.files?.[0])}
      />

      {value ? (
        <div className="flex items-center gap-3 bg-[#141C30] border border-emerald-500/20 rounded-xl p-2">
          <img src={docPreviewUrl(value)} alt="Selfie" className="w-12 h-12 rounded-lg object-cover bg-[#0C1220]" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <Check className="w-3.5 h-3.5" /> Selfie captured
            </div>
            <div className="text-xs text-gray-600 mt-0.5">Ready to submit</div>
          </div>
          <button type="button" onClick={openCamera}
            className="p-1.5 text-gray-500 hover:text-cyan-400 transition-colors" title="Retake">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => onChange(field, "")}
            className="p-1.5 text-gray-500 hover:text-red-400 transition-colors" title="Remove">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={openCamera}
          className="w-full flex items-center justify-center gap-2 bg-[#141C30] border border-dashed border-white/12 hover:border-cyan-500/40 rounded-xl px-3 py-3.5 text-sm text-gray-400 hover:text-cyan-400 transition-colors cursor-pointer"
        >
          <Camera className="w-4 h-4" /> Take a selfie
        </button>
      )}

      {!value && !open && (
        <p className="text-xs text-gray-600 mt-1.5">Uses your camera — look straight ahead in good light.</p>
      )}

      {/* Camera modal */}
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm bg-[#0C1220] border border-white/10 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <span className="text-sm font-medium text-white">Take a selfie</span>
              <button type="button" onClick={closeCamera} className="text-gray-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative aspect-square bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                /* Mirrored so it reads like a mirror to the user; the captured
                   frame is drawn from the unmirrored source. */
                className="w-full h-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
              {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#0C1220]/95 px-6">
                  <div className="text-center">
                    <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                    <p className="text-xs text-gray-400">{error}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 px-4 py-3">
              <button
                type="button"
                onClick={capture}
                disabled={busy || !!error}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 cursor-pointer"
              >
                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Camera className="w-4 h-4" /> Capture</>}
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="px-4 py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-40 cursor-pointer"
              >
                Upload instead
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
