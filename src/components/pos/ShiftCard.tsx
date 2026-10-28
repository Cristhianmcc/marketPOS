// src/components/pos/ShiftCard.tsx
// Tarjeta de caja del POS (equivale al "Balance" de la referencia)
'use client';

import Link from 'next/link';
import { Wallet, ReceiptText } from 'lucide-react';

interface ShiftCardProps {
  openingCashLabel: string;
}

export function ShiftCard({ openingCashLabel }: ShiftCardProps) {
  const action = 'flex flex-col items-center gap-1 flex-shrink-0 group';
  const square = 'w-12 h-12 rounded-xl flex items-center justify-center text-monterrial-forest transition group-hover:brightness-95';

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-primary p-3 shadow-lg shadow-primary/20">
      <div className="flex-1 min-w-0 rounded-xl bg-monterrial-lavender px-3 py-2.5">
        <p className="text-xs font-medium text-text-main/70">Caja inicial</p>
        <p className="text-2xl font-extrabold tracking-tight text-text-main truncate">{openingCashLabel}</p>
      </div>
      <Link href="/shifts" className={action}>
        <span className={`${square} bg-monterrial-gold`}><Wallet className="w-5 h-5" /></span>
        <span className="text-[11px] font-semibold text-white">Turno</span>
      </Link>
      <Link href="/sales" className={action}>
        <span className={`${square} bg-monterrial-lime`}><ReceiptText className="w-5 h-5" /></span>
        <span className="text-[11px] font-semibold text-white">Ventas</span>
      </Link>
    </div>
  );
}
