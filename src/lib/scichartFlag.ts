/**
 * SciChart rollout flag. OFF by default so the (commercial, watermark-until-licensed) SciChart
 * charts never ship live before a license key is in place. Flip on per-device for verification
 * via localStorage, or globally once a key is configured.
 *
 *   localStorage.setItem('slayer.scichart', '1')   // enable on this device
 *   localStorage.removeItem('slayer.scichart')      // back to three.js/echarts
 */
export function sciChartEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if ((window as any).__SLAYER_SCICHART__ === true) return true;
    return localStorage.getItem('slayer.scichart') === '1';
  } catch {
    return false;
  }
}
