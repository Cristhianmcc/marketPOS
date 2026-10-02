export class SunatProcessor {
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(
    private readonly serverUrl: string,
    private readonly internalToken: string
  ) {}

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 10_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const response = await fetch(`${this.serverUrl}/api/sunat/jobs/process-pending`, {
        method: 'POST',
        headers: { 'x-desktop-internal-token': this.internalToken },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        const body = await response.text();
        console.warn(`[SUNAT] Processor HTTP ${response.status}: ${body.substring(0, 300)}`);
      }
    } catch (error) {
      console.warn('[SUNAT] Envío pendiente; se reintentará:', error instanceof Error ? error.message : error);
    } finally {
      this.processing = false;
    }
  }
}
