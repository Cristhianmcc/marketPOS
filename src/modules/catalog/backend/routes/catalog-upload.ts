import { NextRequest } from 'next/server';

export async function parseCatalogUploadRequest(req: NextRequest): Promise<{
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}> {
  const contentType = req.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const body = await req.json();
    const imageBase64 = body?.imageBase64 as string | undefined;
    const mimeType = (body?.mimeType as string | undefined) ?? 'image/jpeg';

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      throw new Error('imageBase64 es obligatorio cuando Content-Type es application/json.');
    }

    const cleaned = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const buffer = Buffer.from(cleaned, 'base64');

    return {
      fileName: `${Date.now()}-catalog-image`,
      mimeType,
      buffer,
    };
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    throw new Error('No se recibio ningun archivo. Usa field "file".');
  }

  return {
    fileName: file.name || `${Date.now()}-catalog-image`,
    mimeType: file.type || 'image/jpeg',
    buffer: Buffer.from(await file.arrayBuffer()),
  };
}
