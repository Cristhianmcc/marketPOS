// src/app/pos/loading.tsx
// ✅ MÓDULO 18.2: Skeleton de carga para POS - mejora percepción de velocidad

export default function POSLoading() {
  return (
    <div className="min-h-screen bg-gray-50 p-4 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-48 bg-gray-200 rounded-lg" />
        <div className="flex gap-2">
          <div className="h-10 w-10 bg-gray-200 rounded-lg" />
          <div className="h-10 w-10 bg-gray-200 rounded-lg" />
        </div>
      </div>

      <div className="flex gap-6 h-[calc(100vh-120px)]">
        {/* Left: Products grid skeleton */}
        <div className="flex-1 space-y-4">
          {/* Search bar skeleton */}
          <div className="h-12 bg-gray-200 rounded-xl" />
          
          {/* Quick sell skeleton */}
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="h-6 w-40 bg-gray-200 rounded mb-4" />
            <div className="grid grid-cols-4 gap-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-100 rounded-lg" />
              ))}
            </div>
          </div>

          {/* Products grid skeleton */}
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {[...Array(15)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-24 bg-gray-100 rounded-lg" />
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Cart skeleton */}
        <div className="w-96 bg-white rounded-xl border border-gray-200 p-4 flex flex-col">
          {/* Cart header */}
          <div className="flex items-center justify-between mb-4">
            <div className="h-6 w-32 bg-gray-200 rounded" />
            <div className="h-6 w-6 bg-gray-200 rounded" />
          </div>

          {/* Cart items skeleton */}
          <div className="flex-1 space-y-3 mb-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-12 h-12 bg-gray-200 rounded" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
                <div className="h-8 w-16 bg-gray-200 rounded" />
              </div>
            ))}
          </div>

          {/* Total skeleton */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex justify-between">
              <div className="h-5 w-20 bg-gray-200 rounded" />
              <div className="h-5 w-24 bg-gray-200 rounded" />
            </div>
            <div className="flex justify-between">
              <div className="h-6 w-24 bg-gray-300 rounded" />
              <div className="h-6 w-28 bg-gray-300 rounded" />
            </div>
            <div className="h-12 bg-green-200 rounded-xl mt-4" />
          </div>
        </div>
      </div>
    </div>
  );
}
