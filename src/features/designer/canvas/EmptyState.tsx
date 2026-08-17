import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/icons/Icon";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/state/store";

/**
 * Empty designer drop zone. A reference is a picture, not a measurement — the note
 * makes the honesty rule explicit. Uploading reads the file locally (FileReader) and
 * never leaves the device.
 */
export function EmptyState() {
  const addSampleReference = useStore((s) => s.addSampleReference);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const onFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // A real local upload path: read the image, measure its intrinsic px, keep it local.
    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      const img = new Image();
      img.onload = () => {
        useStore.getState().current &&
          useStore.setState((s) => {
            const current = s.current!;
            const next = {
              ...current,
              reference: {
                id: `ref_${Math.random().toString(36).slice(2, 10)}`,
                assetName: file.name,
                src,
                widthPx: img.naturalWidth || 1000,
                heightPx: img.naturalHeight || 660,
                rotationDeg: 0,
                capture: { label: "Uploaded image — kept local", kind: "photo" as const },
                addedAt: Date.now(),
              },
              version: current.version + 1,
              updatedAt: Date.now(),
            };
            return { current: next, projects: s.projects.map((p) => (p.id === next.id ? next : p)) };
          });
      };
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
        accept="image/png,image/jpeg,image/svg+xml,application/pdf"
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
      <div className="ehint">PNG · JPEG · SVG · PDF drawing</div>
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
