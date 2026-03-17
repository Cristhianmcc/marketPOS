import type {
  CatalogPublishPayload,
  CatalogPublishResponse,
  CatalogUploadMediaResponse,
  CatalogApiClientConfig,
} from '../domain/catalog.types';

const DEFAULT_TIMEOUT_MS = 30_000;

export class CatalogApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;

  constructor(config: CatalogApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  // ------------------------------------------------------------------
  // Internos
  // ------------------------------------------------------------------

  private authHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) headers['x-api-key'] = this.apiKey;
    return headers;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message =
        (body as { message?: string }).message ??
        `HTTP ${res.status}: ${res.statusText}`;
      throw new Error(message);
    }
    return body as T;
  }

  // ------------------------------------------------------------------
  // API methods
  // ------------------------------------------------------------------

  async ping(): Promise<boolean> {
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: this.authHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async publishCatalog(
    payload: CatalogPublishPayload,
  ): Promise<CatalogPublishResponse> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/catalog/publish`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(payload),
    });
    return this.handleResponse<CatalogPublishResponse>(res);
  }

  async unpublishCatalog(storeId: string): Promise<void> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/catalog/unpublish`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ storeId }),
    });
    await this.handleResponse<unknown>(res);
  }

  async uploadImage(
    _storeSlug: string,
    _productId: string,
    imageBase64: string,
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
  ): Promise<CatalogUploadMediaResponse> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/catalog/media/upload`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ imageBase64, mimeType }),
    });
    return this.handleResponse<CatalogUploadMediaResponse>(res);
  }
}
