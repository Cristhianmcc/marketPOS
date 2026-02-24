/**
 * D6.2 - Raster Print: HTML to PNG Renderer
 * 
 * Uses Playwright headless Chromium to capture the receipt page
 * as a PNG image for ESC/POS raster printing.
 */

import { chromium, Browser, Page } from 'playwright';
import { RasterWidth } from '../escpos/types';

// ============== Types ==============

export interface RenderOptions {
  /** Receipt page URL (e.g., http://127.0.0.1:3000/receipt/xxx?print=1) */
  url: string;
  /** Image width in pixels (576 for 80mm @ 203dpi) */
  widthPx: RasterWidth;
  /** Top margin in pixels */
  marginTopPx?: number;
  /** Left margin in pixels */
  marginLeftPx?: number;
  /** Timeout waiting for page to be ready (ms) */
  timeout?: number;
}

export interface RenderResult {
  success: boolean;
  pngBuffer?: Buffer;
  width?: number;
  height?: number;
  error?: string;
}

// ============== Browser Singleton ==============

let browserInstance: Browser | null = null;

/**
 * Get or create Playwright browser instance.
 * Reuses browser for performance.
 */
async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
      ],
    });
  }
  return browserInstance;
}

/**
 * Close browser instance (call on app shutdown).
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

// ============== Main Render Function ==============

/**
 * Render a receipt URL to PNG buffer.
 * 
 * @param options - Render configuration
 * @returns PNG buffer and metadata
 */
export async function renderReceiptToPng(options: RenderOptions): Promise<RenderResult> {
  const {
    url,
    widthPx,
    marginTopPx = 0,
    marginLeftPx = 0,
    timeout = 15000,
  } = options;

  let page: Page | null = null;

  try {
    const browser = await getBrowser();
    
    // Create new page with specific viewport
    page = await browser.newPage();
    await page.setViewportSize({
      width: widthPx + marginLeftPx,
      height: 800, // Initial height, will capture full page
    });

    // Navigate to receipt URL
    console.log(`[Raster] Loading receipt: ${url}`);
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout,
    });

    // Wait for receipt to be ready (custom data attribute)
    try {
      await page.waitForSelector('[data-receipt-ready="true"]', {
        timeout: timeout / 2,
      });
      console.log('[Raster] Receipt ready flag detected');
    } catch {
      // Fallback: wait for main content
      console.log('[Raster] No ready flag, waiting for receipt container...');
      await page.waitForSelector('.receipt-container, #receipt, main', {
        timeout: timeout / 2,
      });
    }

    // Small delay for any final renders
    await page.waitForTimeout(300);

    // Take full page screenshot
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: true,
      omitBackground: false,
    });

    // Get actual dimensions (runs in browser context)
    const dimensions = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = (globalThis as any).document.body;
      return {
        width: body.scrollWidth as number,
        height: body.scrollHeight as number,
      };
    });

    console.log(`[Raster] Screenshot captured: ${dimensions.width}x${dimensions.height}px`);

    return {
      success: true,
      pngBuffer: screenshot,
      width: dimensions.width,
      height: dimensions.height,
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Raster] Render error:', message);
    return {
      success: false,
      error: `Error renderizando recibo: ${message}`,
    };

  } finally {
    // Close page but keep browser
    if (page) {
      await page.close().catch(() => {});
    }
  }
}

// ============== Helper Functions ==============

/**
 * Build receipt URL with print mode enabled.
 * 
 * @param baseUrl - Base URL of the Next.js app (e.g., http://127.0.0.1:3000)
 * @param saleId - Sale ID to print
 * @returns Full URL with print=1 query param
 */
export function buildReceiptUrl(baseUrl: string, saleId: string): string {
  const url = new URL(`/receipt/${saleId}`, baseUrl);
  url.searchParams.set('print', '1');
  return url.toString();
}

/**
 * Generate a simple test receipt PNG (for testing without actual sale).
 */
export async function renderTestReceipt(
  widthPx: RasterWidth = 576
): Promise<RenderResult> {
  let page: Page | null = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    
    await page.setViewportSize({ width: widthPx, height: 600 });

    // Create test receipt HTML directly
    const testHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Courier New', monospace;
            font-size: 14px;
            background: white;
            padding: 10px;
            width: ${widthPx}px;
          }
          .header { text-align: center; margin-bottom: 15px; }
          .title { font-size: 18px; font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 10px 0; }
          .line { display: flex; justify-content: space-between; }
          .total { font-weight: bold; font-size: 16px; }
          .footer { text-align: center; margin-top: 15px; font-size: 12px; }
        </style>
      </head>
      <body data-receipt-ready="true">
        <div class="header">
          <div class="title">PRUEBA RASTER</div>
          <div>Monterrial POS Desktop</div>
          <div>${new Date().toLocaleString('es-PE')}</div>
        </div>
        <div class="divider"></div>
        <div class="line"><span>Item de prueba x1</span><span>S/ 10.00</span></div>
        <div class="line"><span>Otro producto x2</span><span>S/ 25.00</span></div>
        <div class="divider"></div>
        <div class="line total"><span>TOTAL</span><span>S/ 35.00</span></div>
        <div class="divider"></div>
        <div class="footer">
          <div>*** IMPRESIÓN DE PRUEBA ***</div>
          <div>Modo: ESC/POS Raster</div>
          <div>Ancho: ${widthPx}px</div>
        </div>
      </body>
      </html>
    `;

    await page.setContent(testHtml, { waitUntil: 'load' });
    await page.waitForTimeout(200);

    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: true,
    });

    return {
      success: true,
      pngBuffer: screenshot,
      width: widthPx,
      height: 400,
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Error generando recibo de prueba: ${message}`,
    };

  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}
