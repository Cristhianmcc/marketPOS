import { promises as fs } from 'node:fs';
import path from 'node:path';
import { memoryPages, validateXML, type XMLFileInfo } from 'xmllint-wasm';

export type XsdSunatDocType =
  | 'FACTURA'
  | 'BOLETA'
  | 'NOTA_CREDITO'
  | 'NOTA_DEBITO'
  | 'SUMMARY'
  | 'VOIDED';

export interface SunatXsdValidationResult {
  valid: boolean;
  code?: 'XSD_VALIDATION_ERROR' | 'XSD_VALIDATOR_ERROR';
  message?: string;
  errors: string[];
}

const MAIN_SCHEMAS: Record<XsdSunatDocType, string> = {
  FACTURA: '2.1/maindoc/UBL-Invoice-2.1.xsd',
  BOLETA: '2.1/maindoc/UBL-Invoice-2.1.xsd',
  NOTA_CREDITO: '2.1/maindoc/UBL-CreditNote-2.1.xsd',
  NOTA_DEBITO: '2.1/maindoc/UBL-DebitNote-2.1.xsd',
  SUMMARY: '2.0/maindoc/UBLPE-SummaryDocuments-1.0.xsd',
  VOIDED: '2.0/maindoc/UBLPE-VoidedDocuments-1.0.xsd',
};

const schemaCache = new Map<string, Promise<Map<string, string>>>();

function schemaRootCandidates(): string[] {
  return [
    path.join(process.cwd(), 'src', 'lib', 'sunat', 'xsd'),
    path.join(process.cwd(), 'sunat', 'xsd'),
  ];
}

async function findSchemaRoot(): Promise<string> {
  for (const candidate of schemaRootCandidates()) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch {
      // Try the next development or packaged runtime path.
    }
  }
  throw new Error('No se encontró el directorio local de esquemas XSD SUNAT');
}

async function collectXsdFiles(root: string, relativeDir: string, output: Map<string, string>): Promise<void> {
  const absoluteDir = path.join(root, ...relativeDir.split('/'));
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      await collectXsdFiles(root, relativePath, output);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.xsd')) {
      output.set(relativePath, await fs.readFile(path.join(root, ...relativePath.split('/')), 'utf8'));
    }
  }
}

async function loadSchemaSet(version: string): Promise<Map<string, string>> {
  let cached = schemaCache.get(version);
  if (!cached) {
    cached = (async () => {
      const root = await findSchemaRoot();
      const schemas = new Map<string, string>();
      await collectXsdFiles(root, version, schemas);
      if (schemas.size === 0) throw new Error(`No se encontraron esquemas XSD ${version}`);
      return schemas;
    })();
    schemaCache.set(version, cached);
  }
  return cached;
}

function flattenSchema(fileName: string, contents: string): XMLFileInfo {
  // xmllint-wasm writes every preload directly into its in-memory root and
  // does not create nested directories. UBL file names are unique per version,
  // so imports can be resolved safely by their basename.
  return {
    fileName: path.posix.basename(fileName),
    contents: contents.replace(
      /schemaLocation="([^"]+)"/g,
      (_match, location: string) => `schemaLocation="${path.posix.basename(location.replace(/\\/g, '/'))}"`,
    ),
  };
}

function conciseErrors(messages: readonly string[]): string[] {
  return messages
    .map((message) => message.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 5);
}

export async function validateSunatXml(
  docType: XsdSunatDocType,
  xml: string,
): Promise<SunatXsdValidationResult> {
  try {
    const mainSchema = MAIN_SCHEMAS[docType];
    if (!mainSchema) throw new Error(`Tipo de documento SUNAT no soportado: ${String(docType)}`);
    const version = mainSchema.split('/')[0];
    const schemas = await loadSchemaSet(version);
    const mainContents = schemas.get(mainSchema);
    if (!mainContents) throw new Error(`No se encontró el esquema principal ${mainSchema}`);

    const main = flattenSchema(mainSchema, mainContents);
    const preload: XMLFileInfo[] = Array.from(schemas.entries())
      .filter(([fileName]) => fileName !== mainSchema)
      .map(([fileName, contents]) => flattenSchema(fileName, contents));
    const result = await validateXML({
      xml: [{ fileName: 'document.xml', contents: xml }],
      schema: [main],
      preload,
      initialMemoryPages: 512,
      maxMemoryPages: 256 * memoryPages.MiB,
    });

    if (result.valid) return { valid: true, errors: [] };
    const errors = conciseErrors(result.errors.map((error) => error.message));
    return {
      valid: false,
      code: 'XSD_VALIDATION_ERROR',
      message: `El XML ${docType} no cumple el XSD: ${errors.join(' | ') || 'estructura inválida'}`,
      errors,
    };
  } catch (error) {
    const detail = error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : JSON.stringify(error) || 'error desconocido';
    return {
      valid: false,
      code: 'XSD_VALIDATOR_ERROR',
      message: `No se pudo ejecutar la validación XSD: ${detail}`,
      errors: [detail],
    };
  }
}
