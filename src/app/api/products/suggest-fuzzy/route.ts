// src/app/api/products/suggest-fuzzy/route.ts
// ✅ MÓDULO 18.2: Sugerencias fuzzy para dedupe asistido

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isSuperAdmin } from "@/lib/superadmin";
import { prisma } from "@/infra/db/prisma";

// ✅ NORMALIZACIÓN (igual que en seedCatalog.ts)
function normalize(text: string | null | undefined): string {
  if (!text) return "";
  
  return text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "");
}

// ✅ TOKENIZACIÓN: extraer palabras significativas
function tokenize(text: string): Set<string> {
  const normalized = normalize(text);
  const words = normalized.split(" ").filter((w) => w.length > 2); // palabras > 2 chars
  return new Set(words);
}

// ✅ SIMILITUD JACCARD: token overlap
function jaccardSimilarity(tokensA: Set<string>, tokensB: Set<string>): number {
  const intersection = new Set([...tokensA].filter((x) => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);
  
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

// ✅ BONUS SI EMPIEZA CON (startsWith)
function startsWithBonus(nameA: string, nameB: string): number {
  const normA = normalize(nameA);
  const normB = normalize(nameB);
  
  if (normA.startsWith(normB) || normB.startsWith(normA)) {
    return 0.2; // +20% bonus
  }
  return 0;
}

// ✅ LEVENSHTEIN SIMPLE (opcional, solo para top refinamiento)
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

// ✅ GET /api/products/suggest-fuzzy?q=inca%20kola&limit=10
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Solo OWNER o SUPERADMIN
    const isOwner = user.role === "OWNER";
    const isSuper = isSuperAdmin(user.email);
    
    if (!isOwner && !isSuper) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ error: "Query muy corta" }, { status: 400 });
    }

    // 1) Buscar candidatos en DB (isGlobal=true, normalizedName contiene tokens)
    const queryTokens = tokenize(query);
    const queryNormalized = normalize(query);

    // Buscar productos globales con nombre similar
    const candidates = await prisma.productMaster.findMany({
      where: {
        isGlobal: true,
        OR: [
          { normalizedName: { contains: queryNormalized, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        brand: true,
        content: true,
        category: true,
        barcode: true,
        normalizedName: true,
      },
      take: 50, // limitar candidatos
    });

    if (candidates.length === 0) {
      return NextResponse.json([]);
    }

    // 2) Scoring en memoria
    type ScoredCandidate = {
      id: string;
      name: string;
      brand: string | null;
      content: string | null;
      category: string;
      barcode: string | null;
      similarity: number;
    };

    const scored: ScoredCandidate[] = candidates.map((candidate: typeof candidates[0]) => {
      const candidateTokens = tokenize(candidate.name);
      
      // Jaccard similarity
      let score = jaccardSimilarity(queryTokens, candidateTokens);
      
      // Bonus si empieza con
      score += startsWithBonus(query, candidate.name);
      
      // Cap at 1.0
      score = Math.min(score, 1.0);
      
      return {
        id: candidate.id,
        name: candidate.name,
        brand: candidate.brand,
        content: candidate.content,
        category: candidate.category,
        barcode: candidate.barcode,
        similarity: score,
      };
    });

    // Ordenar por similarity DESC
    scored.sort((a, b) => b.similarity - a.similarity);

    // 3) Tomar top N
    let topN = scored.slice(0, Math.min(limit, 20));

    // 4) Refinar top 5 con Levenshtein (opcional)
    if (topN.length > 0) {
      const top5 = topN.slice(0, 5);
      
      for (const item of top5) {
        const levSim = levenshteinSimilarity(normalize(query), normalize(item.name));
        // Promedio con score anterior
        item.similarity = (item.similarity + levSim) / 2;
      }
      
      // Re-sort
      topN.sort((a, b) => b.similarity - a.similarity);
    }

    // Filtrar solo con similarity > 0.3 (threshold)
    const filtered = topN.filter((item) => item.similarity > 0.3);

    // Redondear similarity a 2 decimales
    const results = filtered.map((item) => ({
      ...item,
      similarity: Math.round(item.similarity * 100) / 100,
    }));

    return NextResponse.json(results);
  } catch (error) {
    console.error("❌ Error en suggest-fuzzy:", error);
    return NextResponse.json(
      { error: "Error al buscar sugerencias" },
      { status: 500 }
    );
  }
}
