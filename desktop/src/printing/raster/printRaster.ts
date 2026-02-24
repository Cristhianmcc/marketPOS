/**
 * D6.2 - Raster Print: PNG to ESC/POS Bitmap Conversion and Printing
 * 
 * Converts PNG images to ESC/POS raster format and sends to printer.
 */

import sharp from 'sharp';
import { sendViaTrasport, TransportConfig, TransportResult } from './transport';
import { EscposConfig, RasterWidth } from '../escpos/types';
import { buildTransportConfig } from './transport';

// ============== Types ==============

export interface RasterPrintOptions {
  pngBuffer: Buffer;
  width: RasterWidth;
  dither: boolean;
  cut: boolean;
  openDrawer: boolean;
  marginTopPx: number;
  marginLeftPx: number;
}

export interface RasterPrintResult {
  success: boolean;
  error?: string;
  fallbackToHtml?: boolean;
}

// ============== ESC/POS Commands ==============

const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

// Initialize printer
const CMD_INIT = Buffer.from([ESC, 0x40]); // ESC @

// Line feed
const CMD_LF = Buffer.from([LF]);

// Cut paper (full cut)
const CMD_CUT_FULL = Buffer.from([GS, 0x56, 0x00]); // GS V 0

// Cut paper (partial cut)
const CMD_CUT_PARTIAL = Buffer.from([GS, 0x56, 0x01]); // GS V 1

// Open cash drawer (pulse on pin 2)
const CMD_CASH_DRAWER = Buffer.from([ESC, 0x70, 0x00, 0x19, 0xFA]); // ESC p 0 25 250

// Feed and cut
const CMD_FEED_CUT = Buffer.from([ESC, 0x64, 0x03, GS, 0x56, 0x42, 0x00]); // ESC d 3, GS V B 0

// ============== Image Processing ==============

/**
 * Process PNG to 1-bit bitmap for thermal printing.
 * 
 * @param pngBuffer - Original PNG buffer
 * @param targetWidth - Target width in pixels (must be multiple of 8)
 * @param dither - Apply dithering for better gradients
 * @returns Processed image data as 1-bit bitmap
 */
async function processImageToBitmap(
  pngBuffer: Buffer,
  targetWidth: RasterWidth,
  dither: boolean
): Promise<{ data: Buffer; width: number; height: number }> {
  // Ensure width is multiple of 8 for ESC/POS bitmap
  const alignedWidth = Math.ceil(targetWidth / 8) * 8;

  // Process with sharp
  let pipeline = sharp(pngBuffer)
    .resize(alignedWidth, null, {
      fit: 'inside',
      withoutEnlargement: false,
    })
    .grayscale();

  // Apply threshold (dithering or hard threshold)
  if (dither) {
    // For dithering, use a threshold with some tolerance
    // Sharp doesn't have built-in dithering, so we use threshold
    pipeline = pipeline.threshold(128);
  } else {
    // Hard threshold
    pipeline = pipeline.threshold(160);
  }

  // Negate so black prints (thermal printers print where bit=1)
  pipeline = pipeline.negate();

  // Get raw pixel data
  const { data, info } = await pipeline
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const bytesPerRow = Math.ceil(width / 8);

  // Convert to 1-bit bitmap
  const bitmapData = Buffer.alloc(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = y * width + x;
      const byteIndex = y * bytesPerRow + Math.floor(x / 8);
      const bitPosition = 7 - (x % 8);

      // If pixel is white (255 after negate = originally black), set bit
      if (data[pixelIndex] > 127) {
        bitmapData[byteIndex] |= (1 << bitPosition);
      }
    }
  }

  return { data: bitmapData, width, height };
}

/**
 * Create ESC/POS raster image command (GS v 0).
 * 
 * GS v 0 m xL xH yL yH d1...dk
 * - m: mode (0 = normal, 1 = double width, 2 = double height, 3 = quadruple)
 * - xL xH: horizontal size in bytes (width / 8)
 * - yL yH: vertical size in dots (height)
 * - d1...dk: bitmap data
 */
function createRasterCommand(
  bitmapData: Buffer,
  width: number,
  height: number
): Buffer {
  const bytesPerRow = Math.ceil(width / 8);

  // GS v 0 m xL xH yL yH
  const header = Buffer.from([
    GS, 0x76, 0x30,
    0x00, // m = normal mode
    bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF, // xL xH
    height & 0xFF, (height >> 8) & 0xFF, // yL yH
  ]);

  return Buffer.concat([header, bitmapData]);
}

/**
 * Alternative: Line-by-line bit image (ESC * mode).
 * Better compatibility with some printers.
 */
function createBitImageCommand(
  bitmapData: Buffer,
  width: number,
  height: number
): Buffer {
  const bytesPerRow = Math.ceil(width / 8);
  const chunks: Buffer[] = [];

  // Set line spacing to 24 dots
  chunks.push(Buffer.from([ESC, 0x33, 24])); // ESC 3 n

  // Process 24 rows at a time (for 24-dot density)
  for (let y = 0; y < height; y += 24) {
    const rowsInChunk = Math.min(24, height - y);

    // ESC * m nL nH d1...dk
    // m = 33 (24-dot double density)
    // nL nH = number of columns (width)
    const lineData = Buffer.alloc(bytesPerRow * 3);
    
    for (let col = 0; col < width; col++) {
      for (let row = 0; row < rowsInChunk && row < 24; row++) {
        const srcRow = y + row;
        if (srcRow < height) {
          const byteIndex = srcRow * bytesPerRow + Math.floor(col / 8);
          const bitPosition = 7 - (col % 8);
          
          if (bitmapData[byteIndex] & (1 << bitPosition)) {
            const targetByte = Math.floor(row / 8);
            const targetBit = 7 - (row % 8);
            const targetIndex = col * 3 + targetByte;
            if (targetIndex < lineData.length) {
              lineData[targetIndex] |= (1 << targetBit);
            }
          }
        }
      }
    }

    // Command: ESC * 33 nL nH d...
    const cmd = Buffer.from([
      ESC, 0x2A, 33,
      width & 0xFF, (width >> 8) & 0xFF,
    ]);

    chunks.push(Buffer.concat([cmd, lineData.slice(0, width * 3)]));
    chunks.push(CMD_LF);
  }

  // Reset line spacing
  chunks.push(Buffer.from([ESC, 0x32])); // ESC 2

  return Buffer.concat(chunks);
}

// ============== Main Print Function ==============

/**
 * Print PNG image as raster to ESC/POS printer.
 * 
 * @param options - Raster print options
 * @param config - ESC/POS configuration
 * @returns Print result
 */
export async function printRasterImage(
  options: RasterPrintOptions,
  config: EscposConfig
): Promise<RasterPrintResult> {
  const {
    pngBuffer,
    width,
    dither,
    cut,
    openDrawer,
    marginTopPx,
  } = options;

  try {
    // 1. Process image to 1-bit bitmap
    console.log('[Raster] Processing image...');
    const bitmap = await processImageToBitmap(pngBuffer, width, dither);
    console.log(`[Raster] Bitmap: ${bitmap.width}x${bitmap.height}px`);

    // 2. Build ESC/POS command buffer
    const chunks: Buffer[] = [];

    // Initialize printer
    chunks.push(CMD_INIT);

    // Top margin (feed lines)
    if (marginTopPx > 0) {
      const feedLines = Math.ceil(marginTopPx / 8);
      for (let i = 0; i < feedLines; i++) {
        chunks.push(CMD_LF);
      }
    }

    // Print image using raster command
    const rasterCmd = createRasterCommand(bitmap.data, bitmap.width, bitmap.height);
    chunks.push(rasterCmd);

    // Feed some lines before cut
    chunks.push(Buffer.from([ESC, 0x64, 0x04])); // ESC d 4 (feed 4 lines)

    // Cut paper if enabled
    if (cut) {
      chunks.push(CMD_CUT_PARTIAL);
    }

    // Open cash drawer if enabled
    if (openDrawer) {
      chunks.push(CMD_CASH_DRAWER);
    }

    // Combine all commands
    const printData = Buffer.concat(chunks);
    console.log(`[Raster] ESC/POS data size: ${printData.length} bytes`);

    // 3. Send to printer via transport
    const transportConfig = buildTransportConfig(config);
    const result = await sendViaTrasport(transportConfig, printData);

    if (result.success) {
      console.log('[Raster] Print successful');
      return { success: true };
    } else {
      console.error('[Raster] Print failed:', result.error);
      return {
        success: false,
        error: result.error,
        fallbackToHtml: true,
      };
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Raster] Error:', message);
    return {
      success: false,
      error: `Error en impresión raster: ${message}`,
      fallbackToHtml: true,
    };
  }
}

/**
 * Build print options from config.
 */
export function buildRasterOptions(
  pngBuffer: Buffer,
  config: EscposConfig
): RasterPrintOptions {
  return {
    pngBuffer,
    width: config.rasterWidthPx,
    dither: config.rasterDither,
    cut: config.rasterCut,
    openDrawer: config.rasterOpenDrawer,
    marginTopPx: config.rasterMarginTopPx,
    marginLeftPx: config.rasterMarginLeftPx,
  };
}
