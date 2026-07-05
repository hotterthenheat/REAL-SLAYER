/**
 * SciChart bootstrap — isolated, lazy, and license-aware.
 *
 * Per the terminal directive, SciChart is kept out of the main bundle: this module is only
 * imported by the lazy SciChart chart components, so the ~1.3MB WASM never loads on pages that
 * don't use it. WASM is served locally from /public/scichart (the CDN is blocked by our CSP),
 * so it works offline and behind the proxy.
 *
 * LICENSE: SciChart is commercial. Without a runtime key it renders a "SciChart Trial"
 * watermark. Supply a key via VITE_SCICHART_LICENSE (build-time) or window.__SCICHART_LICENSE__
 * (runtime) and it goes watermark-free. We never hard-code a key.
 */
let configured = false;

export async function initSciChart(): Promise<void> {
  if (configured) return;
  configured = true;
  const { SciChartSurface, SciChart3DSurface } = await import('scichart');

  // Local WASM — bundled data (v5 folds the .data into the .wasm).
  SciChartSurface.configure({ wasmUrl: '/scichart/scichart2d.wasm' });
  SciChart3DSurface.configure({ wasmUrl: '/scichart/scichart3d.wasm' });

  // Apply a runtime license key if the deployment provides one. Community or paid — the key
  // is the operator's to obtain; absent it, SciChart still renders (with its trial watermark).
  const key =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SCICHART_LICENSE) ||
    (typeof window !== 'undefined' && (window as any).__SCICHART_LICENSE__) ||
    '';
  if (key) {
    try { SciChartSurface.setRuntimeLicenseKey(key); } catch { /* invalid key → falls back to trial/community */ }
  } else {
    // No paid key configured → run Community Edition (renders watermark-free, but its EULA is
    // non-commercial and time-limited per release). This is why the SciChart rollout ships
    // feature-flagged OFF: a production/commercial deployment must set VITE_SCICHART_LICENSE
    // with a paid key. UseCommunityLicense() just formalizes the mode + silences the probe.
    try { (SciChartSurface as any).UseCommunityLicense?.(); } catch { /* older builds: no-op */ }
  }
}
