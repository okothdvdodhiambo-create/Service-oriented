import { useEffect, useRef } from "react";
import type { Html5Qrcode } from "html5-qrcode";

export function Scanner({ onScan, onDenied }: { onScan: (value: string) => void; onDenied: () => void }) {
  const id = useRef(`qr-reader-${Math.random().toString(36).slice(2)}`);
  useEffect(() => {
    let active = true;
    let scanner: Html5Qrcode | null = null;
    void import("html5-qrcode").then(async ({ Html5Qrcode: ScannerLibrary }) => {
      if (!active) return;
      scanner = new ScannerLibrary(id.current);
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 8, qrbox: { width: 240, height: 240 } },
          (value) => { if (active) onScan(value); },
          () => undefined
        );
        if (!active && scanner.isScanning) await scanner.stop();
      } catch {
        if (active) onDenied();
      }
    }).catch(() => { if (active) onDenied(); });
    return () => {
      active = false;
      if (scanner?.isScanning) void scanner.stop().catch(() => undefined);
    };
  }, [onDenied, onScan]);
  return <div id={id.current} className="scanner" aria-label="QR code camera scanner" />;
}
