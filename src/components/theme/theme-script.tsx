/**
 * Theme handling
 * --------------
 * The server always renders `data-theme="dark"` (our default). This inline script
 * runs during HTML parsing, before first paint, and applies the user's saved
 * choice from localStorage so light-mode users never see a dark flash.
 *
 * It carries the per-request CSP nonce (see src/proxy.ts).
 */
export const THEME_STORAGE_KEY = "orb_theme";
export type Theme = "dark" | "light";

const script = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export function ThemeScript({ nonce }: { nonce?: string }) {
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: script }} />;
}
