/**
 * Abre un enlace externo (WhatsApp, catálogo web). En el escritorio usa el
 * puente del sistema operativo; en la web, una pestaña nueva. Si no se puede
 * abrir, copia el enlace para pegarlo a mano.
 */
type DesktopBridge = { desktop?: { isDesktop?: boolean; openExternal?: (url: string) => Promise<{ ok: boolean; error?: string }> } };

export async function openExternalLink(url: string): Promise<{ ok: boolean; copied?: boolean; error?: string }> {
  const desktop = (window as unknown as DesktopBridge).desktop;
  if (desktop?.isDesktop && desktop.openExternal) {
    const result = await desktop.openExternal(url).catch((error: unknown) => ({ ok: false, error: String(error) }));
    if (result.ok) return { ok: true };
    try {
      await navigator.clipboard.writeText(url);
      return { ok: false, copied: true, error: result.error };
    } catch {
      return { ok: false, error: result.error };
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
  return { ok: true };
}
