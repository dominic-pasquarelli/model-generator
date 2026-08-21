import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/icons/Icon";
import { Button } from "@/components/ui/Button";
import { MAX_REF_SRC_BYTES } from "@/core/project/schema";
import { useStore } from "@/state/store";

const ACCEPT = "image/png,image/jpeg,image/svg+xml";
/** Raw image file cap. Base64 in a data URL adds ~33%, so keep the raw file below the stored-
 *  src limit with headroom. */
const MAX_IMAGE_FILE_BYTES = Math.floor(MAX_REF_SRC_BYTES * 0.7);
/** Largest side a rasterised SVG is scaled to, bounding the stored PNG's size. */
const MAX_RASTER_DIM = 4096;

/**
 * Empty designer drop zone. A reference is a picture, not a measurement — the note
 * makes the honesty rule explicit. Uploading reads the file locally (FileReader),
 * routes the reference through the store's canonical transaction (so it persists and
 * failures surface), and decodes intrinsic dimensions. Errors are reported, not swallowed.
 */
export function EmptyState() {
  const addSampleReference = useStore((s) => s.addSampleReference);
  const importReference = useStore((s) => s.importReference);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const onFiles = (files: FileList | null) => {
    setError(null);
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!/^image\/(png|jpeg|svg\+xml)$/.test(file.type)) {
      setError(`Unsupported file type "${file.type || file.name}". Use a PNG, JPEG, or SVG image.`);
      return;
    }
    // Reject by size before reading (reviewer #2), accounting for base64 expansion into the URL.
    if (file.size > MAX_IMAGE_FILE_BYTES) {
      setError(`This image is ${(file.size / 1_000_000).toFixed(1)} MB, larger than the ${(MAX_IMAGE_FILE_BYTES / 1_000_000).toFixed(0)} MB limit.`);
      return;
    }
    const isSvg = file.type === "image/svg+xml";
    const reader = new FileReader();
    reader.onerror = () => setError("Could not read the file. Try another image.");
    reader.onload = () => {
      const src = String(reader.result);
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) {
          setError("The image reported no intrinsic dimensions; it can't be calibrated.");
          return;
        }
        // SVG must be normalised into a RASTER asset before it enters the canonical project
        // (reviewer #2): raw SVG data URLs are rejected at the trust boundary (an XSS vector),
        // so the app must not store one it would later quarantine. Rasterising to PNG also
        // neutralises any embedded script and taints-out any external reference.
        let finalSrc = src;
        let fw = w;
        let fh = h;
        if (isSvg) {
          const scale = Math.min(1, MAX_RASTER_DIM / Math.max(w, h));
          fw = Math.max(1, Math.round(w * scale));
          fh = Math.max(1, Math.round(h * scale));
          const canvas = document.createElement("canvas");
          canvas.width = fw;
          canvas.height = fh;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            setError("Could not rasterise the SVG (canvas unavailable).");
            return;
          }
          ctx.drawImage(img, 0, 0, fw, fh);
          try {
            finalSrc = canvas.toDataURL("image/png");
          } catch {
            setError("This SVG references external resources and can't be safely imported. Export it as a PNG or JPEG first.");
            return;
          }
          if (finalSrc.length > MAX_REF_SRC_BYTES) {
            setError("The rasterised SVG is too large to store; simplify it or use a smaller image.");
            return;
          }
        }
        const res = importReference({
          assetName: file.name,
          src: finalSrc,
          widthPx: fw,
          heightPx: fh,
          captureLabel: isSvg ? "Uploaded SVG — rasterised, kept local" : "Uploaded image — kept local",
        });
        if (!res.ok) setError(`Reference added but not saved: ${res.error ?? "storage error"}.`);
      };
      img.onerror = () => setError("This image could not be decoded (PDFs and unsupported formats can't be rasterised here).");
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      className={cn("empty", dragOver && "is-dragover")}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        style={{ display: "none" }}
        onChange={(e) => onFiles(e.target.files)}
      />
      <div className="eicon">
        <Icon name="image" />
      </div>
      <h2>Add a board reference</h2>
      <p>
        Drop a photo or drawing of your board here, or browse for a file.
        <br />
        It stays on this device.
      </p>
      <div className="ebtns">
        <Button variant="primary" size="lg" icon="upload" onClick={() => fileInput.current?.click()}>
          Browse files
        </Button>
        <Button variant="dark" size="lg" icon="board" onClick={addSampleReference}>
          Use sample board
        </Button>
      </div>
      <div className="ehint">PNG · JPEG · SVG</div>
      {error ? (
        <div
          role="alert"
          style={{ marginTop: 12, fontSize: 11.5, color: "#ffb4a8", background: "#43231f", border: "1px solid #7a3830", borderRadius: 8, padding: "8px 10px", textAlign: "left" }}
        >
          {error}
        </div>
      ) : null}
      <div className="enote">
        <Icon name="info" />
        <div>
          A reference is a picture, not a measurement. Nothing gets a physical size until you calibrate it against a
          dimension you trust.
        </div>
      </div>
    </div>
  );
}
