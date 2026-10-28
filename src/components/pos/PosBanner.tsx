// src/components/pos/PosBanner.tsx
// Banner del POS con foto. Por ahora es publicidad de Monterrial; luego la tienda podrá subir el suyo.
'use client';

export function PosBanner() {
  return (
    <div className="relative h-36 md:h-40 overflow-hidden rounded-3xl bg-[#023d25] shadow-medium">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/bg-mercado.jpg"
        alt=""
        className="absolute inset-y-0 right-0 h-full w-[62%] object-cover"
      />
      {/* Degradado que funde la foto con el verde del texto */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#023d25] from-40% via-[#023d25]/70 via-55% to-transparent" />
      <div className="relative h-full flex flex-col justify-center px-7 md:px-9 max-w-[58%]">
        <span className="self-start -rotate-2 bg-[#ff7a1a] px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white shadow">
          Monterrial POS
        </span>
        <h2 className="mt-3 text-2xl md:text-[34px] font-black uppercase leading-[0.95] tracking-tight text-white">
          Vende más <span className="block text-monterrial-gold">cada día</span>
        </h2>
        <p className="mt-2 text-[11px] md:text-xs font-semibold uppercase tracking-[0.2em] text-white/85">
          Boletas y facturas SUNAT desde tu caja
        </p>
      </div>
    </div>
  );
}
