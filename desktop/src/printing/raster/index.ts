/**
 * D6.2 - Raster Print Module
 * 
 * HTML → PNG → ESC/POS bitmap printing for exact CSS reproduction.
 * Supports USB and Network transports.
 */

import { EscposConfig, PrintResult } from '../escpos/types';
import {
  renderReceiptToPng,
  renderTestReceipt,
  buildReceiptUrl,
  closeBrowser,
  RenderResult,
} from './renderReceiptToPng';
import {
  printRasterImage,
  buildRasterOptions,
  RasterPrintResult,
} from './printRaster';
import { validateTransportConfig, buildTransportConfig } from './transport';

// ============== Main Raster Print Manager ==============

export class RasterPrintManager {
  private config: EscposConfig;
  private baseUrl: string;

  constructor(config: EscposConfig, baseUrl: string = 'http://127.0.0.1:3000') {
    this.config = config;
    this.baseUrl = baseUrl;
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<EscposConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Update base URL (Next.js server).
   */
  updateBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  /**
   * Get current config.
   */
  getConfig(): EscposConfig {
    return this.config;
  }

  /**
   * Validate raster transport configuration.
   */
  validateConfig(): string | null {
    const transportConfig = buildTransportConfig(this.config);
    return validateTransportConfig(transportConfig);
  }

  // ============== Print Methods ==============

  /**
   * Print a test receipt (generates test HTML, not a real sale).
   */
  async testPrint(): Promise<RasterPrintResult> {
    console.log('[RasterManager] Test print starting...');

    // Validate config
    const validationError = this.validateConfig();
    if (validationError) {
      return { success: false, error: validationError, fallbackToHtml: true };
    }

    // Render test receipt
    const renderResult = await renderTestReceipt(this.config.rasterWidthPx);
    if (!renderResult.success || !renderResult.pngBuffer) {
      return {
        success: false,
        error: renderResult.error || 'Error generando imagen de prueba',
        fallbackToHtml: true,
      };
    }

    // Print
    const options = buildRasterOptions(renderResult.pngBuffer, this.config);
    return await printRasterImage(options, this.config);
  }

  /**
   * Print a sale receipt.
   * 
   * @param saleId - Sale ID to print
   */
  async printSale(saleId: string): Promise<RasterPrintResult> {
    console.log(`[RasterManager] Printing sale: ${saleId}`);

    // Validate config
    const validationError = this.validateConfig();
    if (validationError) {
      return { success: false, error: validationError, fallbackToHtml: true };
    }

    // Build receipt URL with print mode
    const url = buildReceiptUrl(this.baseUrl, saleId);
    console.log(`[RasterManager] Receipt URL: ${url}`);

    // Render receipt to PNG
    const renderResult = await renderReceiptToPng({
      url,
      widthPx: this.config.rasterWidthPx,
      marginTopPx: this.config.rasterMarginTopPx,
      marginLeftPx: this.config.rasterMarginLeftPx,
      timeout: 20000,
    });

    if (!renderResult.success || !renderResult.pngBuffer) {
      return {
        success: false,
        error: renderResult.error || 'Error capturando recibo',
        fallbackToHtml: true,
      };
    }

    console.log(`[RasterManager] Image captured: ${renderResult.width}x${renderResult.height}px`);

    // Print
    const options = buildRasterOptions(renderResult.pngBuffer, this.config);
    return await printRasterImage(options, this.config);
  }

  /**
   * Cleanup (close browser).
   */
  async cleanup(): Promise<void> {
    await closeBrowser();
  }
}

// ============== Exports ==============

export {
  renderReceiptToPng,
  renderTestReceipt,
  buildReceiptUrl,
  closeBrowser,
  RenderResult,
} from './renderReceiptToPng';

export {
  printRasterImage,
  buildRasterOptions,
  RasterPrintResult,
  RasterPrintOptions,
} from './printRaster';

export {
  sendViaTrasport,
  validateTransportConfig,
  buildTransportConfig,
  TransportConfig,
  TransportResult,
} from './transport';
