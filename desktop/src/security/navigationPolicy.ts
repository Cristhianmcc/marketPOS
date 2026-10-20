export type WindowOpenDisposition = 'app' | 'external' | 'blocked';

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Only the HTTP(S) origin of the server started by this Electron process is
 * part of the desktop application. Hostname-only checks are insufficient
 * because the embedded server uses a dynamic port and 127.0.0.1.
 */
export function isAppServerUrl(candidateUrl: string, appServerUrl: string): boolean {
  const candidate = parseUrl(candidateUrl);
  const server = parseUrl(appServerUrl);

  if (!candidate || !server) return false;
  if (server.protocol !== 'http:' && server.protocol !== 'https:') return false;

  return candidate.origin === server.origin;
}

/**
 * Same-origin links may open inside Electron. Ordinary web and mail links are
 * delegated to the operating system. Everything else stays blocked.
 */
export function classifyWindowOpenUrl(
  candidateUrl: string,
  appServerUrl: string
): WindowOpenDisposition {
  if (isAppServerUrl(candidateUrl, appServerUrl)) return 'app';

  const candidate = parseUrl(candidateUrl);
  if (candidate && EXTERNAL_PROTOCOLS.has(candidate.protocol)) return 'external';

  return 'blocked';
}
