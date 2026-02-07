// src/app/receipt/[id]/loading.tsx
// ✅ MÓDULO 18.2: Skeleton de carga para Ticket

export default function ReceiptLoading() {
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Action bar skeleton */}
      <div className="no-print bg-white border-b border-gray-200 py-4 px-6 flex items-center justify-between sticky top-0 z-10 animate-pulse">
        <div className="h-10 w-24 bg-gray-200 rounded-md" />
        <div className="flex gap-2">
          <div className="h-10 w-32 bg-gray-200 rounded-md" />
          <div className="h-10 w-28 bg-gray-200 rounded-md" />
        </div>
      </div>

      {/* Receipt skeleton */}
      <div className="flex justify-center py-8">
        <div className="bg-white shadow-lg rounded-lg w-80 p-6 animate-pulse">
          {/* Store name */}
          <div className="text-center mb-4">
            <div className="h-6 bg-gray-200 rounded w-3/4 mx-auto mb-2" />
            <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto mb-1" />
            <div className="h-4 bg-gray-200 rounded w-2/3 mx-auto" />
          </div>

          {/* Divider */}
          <div className="border-t border-dashed border-gray-300 my-4" />

          {/* Sale info */}
          <div className="space-y-2 mb-4">
            <div className="h-4 bg-gray-200 rounded w-1/2" />
            <div className="h-4 bg-gray-200 rounded w-2/3" />
            <div className="h-4 bg-gray-200 rounded w-1/3" />
          </div>

          {/* Divider */}
          <div className="border-t border-dashed border-gray-300 my-4" />

          {/* Items skeleton */}
          {[...Array(3)].map((_, i) => (
            <div key={i} className="mb-3">
              <div className="h-4 bg-gray-200 rounded w-full mb-1" />
              <div className="flex justify-between">
                <div className="h-3 bg-gray-200 rounded w-1/3" />
                <div className="h-3 bg-gray-200 rounded w-1/4" />
              </div>
            </div>
          ))}

          {/* Divider */}
          <div className="border-t border-dashed border-gray-300 my-4" />

          {/* Totals skeleton */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <div className="h-4 bg-gray-200 rounded w-1/4" />
              <div className="h-4 bg-gray-200 rounded w-1/4" />
            </div>
            <div className="flex justify-between">
              <div className="h-5 bg-gray-300 rounded w-1/3" />
              <div className="h-5 bg-gray-300 rounded w-1/3" />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-dashed border-gray-300 my-4" />

          {/* Footer */}
          <div className="text-center space-y-1">
            <div className="h-4 bg-gray-200 rounded w-2/3 mx-auto" />
            <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto" />
          </div>
        </div>
      </div>
    </div>
  );
}
