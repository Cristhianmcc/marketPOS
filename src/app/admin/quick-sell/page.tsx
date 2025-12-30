// src/app/admin/quick-sell/page.tsx
// ✅ MÓDULO 17.2: Configuración de productos rápidos (Quick Sell)
'use client';

import { useState, useEffect } from 'react';
import AuthLayout from '@/components/AuthLayout';
import { toast } from 'sonner';
import { Loader2, ShoppingCart, Star, StarOff, GripVertical } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  isQuickSell: boolean;
  quickSellOrder: number | null;
  totalSold: number;
}

export default function QuickSellAdminPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maxQuickSell, setMaxQuickSell] = useState(8);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/quick-sell');
      if (!response.ok) throw new Error('Error al cargar productos');
      
      const data = await response.json();
      setProducts(data.products);
    } catch (error) {
      toast.error('Error al cargar productos');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const toggleQuickSell = async (productId: string, currentValue: boolean) => {
    const quickSellCount = products.filter(p => p.isQuickSell).length;
    
    // Validar límite máximo
    if (!currentValue && quickSellCount >= maxQuickSell) {
      toast.error(`Límite alcanzado: máximo ${maxQuickSell} productos rápidos`);
      return;
    }

    try {
      setSaving(true);
      const response = await fetch('/api/admin/quick-sell', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          isQuickSell: !currentValue,
        }),
      });

      if (!response.ok) throw new Error('Error al actualizar');

      // Actualizar estado local
      setProducts(prevProducts => 
        prevProducts.map(p => 
          p.id === productId 
            ? { ...p, isQuickSell: !currentValue }
            : p
        )
      );

      toast.success(!currentValue ? 'Producto agregado a Quick Sell' : 'Producto removido de Quick Sell');
    } catch (error) {
      toast.error('Error al actualizar producto');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleDragEnd = async (result: any) => {
    if (!result.destination) return;

    const reorderedProducts = Array.from(products.filter(p => p.isQuickSell));
    const [movedProduct] = reorderedProducts.splice(result.source.index, 1);
    reorderedProducts.splice(result.destination.index, 0, movedProduct);

    // Actualizar orden local inmediatamente (optimistic update)
    const updatedProducts = reorderedProducts.map((p, index) => ({
      ...p,
      quickSellOrder: index + 1,
    }));

    setProducts(prevProducts => {
      const nonQuickSell = prevProducts.filter(p => !p.isQuickSell);
      return [...updatedProducts, ...nonQuickSell];
    });

    // Guardar en backend
    try {
      setSaving(true);
      const response = await fetch('/api/admin/quick-sell/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order: updatedProducts.map(p => ({ id: p.id, order: p.quickSellOrder })),
        }),
      });

      if (!response.ok) throw new Error('Error al actualizar orden');
      toast.success('Orden actualizado correctamente');
    } catch (error) {
      toast.error('Error al actualizar orden');
      console.error(error);
      // Recargar para sincronizar con backend
      loadProducts();
    } finally {
      setSaving(false);
    }
  };

  const quickSellProducts = products.filter(p => p.isQuickSell).sort((a, b) => {
    if (a.quickSellOrder === null) return 1;
    if (b.quickSellOrder === null) return -1;
    return a.quickSellOrder - b.quickSellOrder;
  });

  const otherProducts = products.filter(p => !p.isQuickSell).sort((a, b) => b.totalSold - a.totalSold);

  if (loading) {
    return (
      <AuthLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-green-600" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <ShoppingCart className="w-6 h-6 text-green-600" />
              <h1 className="text-2xl font-bold text-gray-900">Productos Rápidos (Quick Sell)</h1>
            </div>
            <p className="text-gray-600">
              Configura los productos que aparecerán como botones rápidos en el POS.
              Máximo {maxQuickSell} productos.
            </p>
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <span className="font-semibold">Tip:</span> Arrastra los productos marcados para cambiar el orden.
                Los productos más vendidos se sugieren automáticamente.
              </p>
            </div>
          </div>

          {/* Productos Quick Sell (Ordenables) */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Productos Rápidos ({quickSellProducts.length}/{maxQuickSell})
              </h2>
              {saving && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando...</span>
                </div>
              )}
            </div>

            {quickSellProducts.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <StarOff className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>No hay productos marcados como rápidos</p>
                <p className="text-sm mt-1">Marca productos desde la lista de abajo</p>
              </div>
            ) : (
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="quick-sell">
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="space-y-2"
                    >
                      {quickSellProducts.map((product, index) => (
                        <Draggable key={product.id} draggableId={product.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`
                                flex items-center gap-4 p-4 rounded-lg border-2 transition-all
                                ${snapshot.isDragging 
                                  ? 'border-green-500 bg-green-50 shadow-lg' 
                                  : 'border-gray-200 bg-white hover:border-gray-300'
                                }
                              `}
                            >
                              {/* Drag Handle */}
                              <div {...provided.dragHandleProps}>
                                <GripVertical className="w-5 h-5 text-gray-400 cursor-grab active:cursor-grabbing" />
                              </div>

                              {/* Orden */}
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 text-green-700 font-bold flex items-center justify-center text-sm">
                                {index + 1}
                              </div>

                              {/* Info */}
                              <div className="flex-1">
                                <p className="font-semibold text-gray-900">{product.name}</p>
                                <p className="text-sm text-gray-600">
                                  S/ {Number(product.price).toFixed(2)} • {product.category} • {product.totalSold} ventas
                                </p>
                              </div>

                              {/* Toggle */}
                              <button
                                onClick={() => toggleQuickSell(product.id, true)}
                                disabled={saving}
                                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                              >
                                <StarOff className="w-4 h-4" />
                                <span className="text-sm font-medium">Remover</span>
                              </button>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </div>

          {/* Otros Productos (Disponibles para agregar) */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Productos Disponibles
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Ordenados por cantidad de ventas. Los más vendidos están primero.
            </p>

            {otherProducts.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>Todos los productos están marcados como rápidos</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {otherProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center gap-4 p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-all"
                  >
                    {/* Info */}
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-600">
                        S/ {Number(product.price).toFixed(2)} • {product.category} • {product.totalSold} ventas
                      </p>
                    </div>

                    {/* Toggle */}
                    <button
                      onClick={() => toggleQuickSell(product.id, false)}
                      disabled={saving || quickSellProducts.length >= maxQuickSell}
                      className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Star className="w-4 h-4" />
                      <span className="text-sm font-medium">Marcar</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
