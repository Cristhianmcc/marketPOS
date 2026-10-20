import crypto from 'crypto';

export const DESKTOP_INTERNAL_TOKEN_HEADER = 'x-desktop-internal-token';

type RequestWithHeaders = Pick<Request, 'headers'>;

/**
 * Valida llamadas entre el proceso principal de Electron y el servidor local.
 * El token se genera al iniciar cada servidor y nunca se expone al renderer.
 */
export function hasValidDesktopInternalToken(request: RequestWithHeaders): boolean {
  const expected = process.env.DESKTOP_INTERNAL_TOKEN;
  const received = request.headers.get(DESKTOP_INTERNAL_TOKEN_HEADER);

  if (!expected || expected.length < 32 || !received) return false;

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(received, 'utf8');
  return expectedBuffer.length === receivedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}
