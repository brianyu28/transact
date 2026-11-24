/**
 * iOS zooms the page in when a text field smaller than 16px is focused, and the app's
 * compact inputs are 12–13px. `maximum-scale=1` stops that zoom. iOS still allows
 * pinch-zoom regardless (it ignores zoom limits for accessibility), but other platforms
 * honor the limit, so it's applied on iOS only.
 */
export function preventInputZoomOnIOS() {
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac.
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (!ios) return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (meta && !meta.content.includes('maximum-scale')) meta.content += ', maximum-scale=1';
}
