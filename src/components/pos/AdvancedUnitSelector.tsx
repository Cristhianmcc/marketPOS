/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F1 — ADVANCED UNIT SELECTOR PARA POS
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Selector de unidades para productos con conversiones.
 * Solo se renderiza si ENABLE_ADVANCED_UNITS está ON.
 * 
 * Features:
 * - Dropdown de unidades alternativas (BOX, PACK, CM, etc.)
 * - Input con validación entero/decimal en tiempo real
 * - Muestra equivalencia en unidad base
 * - Atajo Ctrl+U para abrir selector
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Scale, AlertCircle, Check } from 'lucide-react';

export interface UnitInfo {
  id: string;
  code: string;
  name: string;
  symbol: string;
  factor?: number;
  allowsDecimals?: boolean;
}

export interface ProductUnitsData {
  enabled: boolean;
  baseUnit: UnitInfo | null;
  availableUnits: UnitInfo[];
  allowsDecimals: boolean;
}

interface AdvancedUnitSelectorProps {
  productMasterId: string;
  productName: string;
  quantity: number;
  onQuantityChange: (quantity: number, unitId: string, quantityBase: number, factor: number) => void;
  selectedUnitId?: string;
  disabled?: boolean;
  compact?: boolean;
}

export default function AdvancedUnitSelector({
  productMasterId,
  productName,
  quantity,
  onQuantityChange,
  selectedUnitId,
  disabled = false,
  compact = false,
}: AdvancedUnitSelectorProps) {
  const [unitsData, setUnitsData] = useState<ProductUnitsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [inputValue, setInputValue] = useState(quantity.toString());
  const [validationError, setValidationError] = useState<string | null>(null);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Unidad actualmente seleccionada
  const currentUnit = unitsData?.baseUnit && !selectedUnitId 
    ? unitsData.baseUnit
    : unitsData?.availableUnits.find(u => u.id === selectedUnitId) || unitsData?.baseUnit;

  // Cargar datos de unidades
  useEffect(() => {
    const fetchUnits = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/pos/units?productMasterId=${productMasterId}`);
        if (!res.ok) throw new Error('Error al cargar unidades');
        const data = await res.json();
        setUnitsData(data);
        setError(null);
      } catch (err) {
        setError('No se pudieron cargar las unidades');
        setUnitsData({ enabled: false, baseUnit: null, availableUnits: [], allowsDecimals: false });
      } finally {
        setLoading(false);
      }
    };

    fetchUnits();
  }, [productMasterId]);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Validar y actualizar cantidad
  const validateAndUpdate = useCallback((value: string, unit: UnitInfo | null | undefined) => {
    if (!unit) return;
    
    const numValue = parseFloat(value);
    
    if (isNaN(numValue) || numValue <= 0) {
      setValidationError('Cantidad inválida');
      return;
    }

    // Validar enteros vs decimales
    const allowsDecimals = unit.allowsDecimals ?? unitsData?.allowsDecimals ?? false;
    if (!allowsDecimals && !Number.isInteger(numValue)) {
      setValidationError(`${unit.name} solo acepta números enteros`);
      return;
    }

    setValidationError(null);

    // Calcular cantidad base
    const factor = unit.factor ?? 1;
    const quantityBase = numValue * factor;

    onQuantityChange(numValue, unit.id, quantityBase, factor);
  }, [unitsData, onQuantityChange]);

  // Manejar cambio de unidad
  const handleUnitChange = (unit: UnitInfo) => {
    setShowDropdown(false);
    validateAndUpdate(inputValue, unit);
  };

  // Manejar cambio de input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    
    // Validar en tiempo real
    if (value && currentUnit) {
      const numValue = parseFloat(value);
      const allowsDecimals = currentUnit.allowsDecimals ?? unitsData?.allowsDecimals ?? false;
      
      if (!allowsDecimals && value.includes('.')) {
        setValidationError(`Solo números enteros`);
      } else if (isNaN(numValue) || numValue <= 0) {
        setValidationError('Cantidad inválida');
      } else {
        setValidationError(null);
      }
    }
  };

  // Manejar blur (confirmar cambio)
  const handleInputBlur = () => {
    validateAndUpdate(inputValue, currentUnit);
  };

  // Manejar Enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      validateAndUpdate(inputValue, currentUnit);
      inputRef.current?.blur();
    }
  };

  // Sincronizar inputValue con quantity prop
  useEffect(() => {
    setInputValue(quantity.toString());
  }, [quantity]);

  // Si está deshabilitado o cargando, no mostrar
  if (loading) {
    return (
      <div className="flex items-center gap-1 text-xs text-gray-400">
        <Scale className="w-3 h-3 animate-pulse" />
        <span>Cargando...</span>
      </div>
    );
  }

  // Si no está habilitado, no mostrar nada
  if (!unitsData?.enabled || !unitsData?.baseUnit) {
    return null;
  }

  // Si no hay unidades alternativas, mostrar solo la unidad base
  const hasAlternatives = unitsData.availableUnits.length > 0;

  // Calcular equivalencia
  const factor = currentUnit?.factor ?? 1;
  const quantityBase = parseFloat(inputValue) * factor || 0;
  const showEquivalence = factor !== 1 && quantityBase > 0;

  if (compact) {
    // Versión compacta para lista de carrito
    return (
      <div className="flex items-center gap-2">
        {/* Input cantidad */}
        <input
          ref={inputRef}
          type="text"
          inputMode={currentUnit?.allowsDecimals ? 'decimal' : 'numeric'}
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={`w-16 px-2 py-1 text-sm text-center border rounded-lg 
            ${validationError ? 'border-red-500 bg-red-50' : 'border-gray-300'}
            ${disabled ? 'bg-gray-100' : 'bg-white'}
            focus:outline-none focus:ring-2 focus:ring-blue-500`}
        />

        {/* Selector de unidad */}
        {hasAlternatives ? (
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => !disabled && setShowDropdown(!showDropdown)}
              disabled={disabled}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 
                         rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              <span>{currentUnit?.symbol || currentUnit?.code}</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {showDropdown && (
              <div className="absolute z-50 mt-1 right-0 w-40 bg-white border border-gray-200 
                              rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {/* Unidad base */}
                <button
                  type="button"
                  onClick={() => handleUnitChange(unitsData.baseUnit!)}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex items-center justify-between
                    ${!selectedUnitId || selectedUnitId === unitsData.baseUnit?.id ? 'bg-blue-50 text-blue-700' : ''}`}
                >
                  <span>{unitsData.baseUnit?.name} ({unitsData.baseUnit?.symbol})</span>
                  {(!selectedUnitId || selectedUnitId === unitsData.baseUnit?.id) && (
                    <Check className="w-4 h-4 text-blue-600" />
                  )}
                </button>

                {/* Unidades alternativas */}
                {unitsData.availableUnits.map((unit) => (
                  <button
                    key={unit.id}
                    type="button"
                    onClick={() => handleUnitChange(unit)}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex items-center justify-between
                      ${selectedUnitId === unit.id ? 'bg-blue-50 text-blue-700' : ''}`}
                  >
                    <div>
                      <span>{unit.name} ({unit.symbol})</span>
                      {unit.factor && (
                        <span className="text-xs text-gray-500 ml-1">
                          = {unit.factor} {unitsData.baseUnit?.symbol}
                        </span>
                      )}
                    </div>
                    {selectedUnitId === unit.id && (
                      <Check className="w-4 h-4 text-blue-600" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-500">{currentUnit?.symbol}</span>
        )}

        {/* Equivalencia */}
        {showEquivalence && (
          <span className="text-xs text-gray-500">
            = {quantityBase.toFixed(2)} {unitsData.baseUnit?.symbol}
          </span>
        )}

        {/* Error */}
        {validationError && (
          <span title={validationError}>
            <AlertCircle className="w-4 h-4 text-red-500" />
          </span>
        )}
      </div>
    );
  }

  // Versión completa para modal o panel
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {/* Input cantidad */}
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Cantidad</label>
          <input
            ref={inputRef}
            type="text"
            inputMode={currentUnit?.allowsDecimals ? 'decimal' : 'numeric'}
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className={`w-full px-3 py-2 text-lg font-medium text-center border rounded-lg 
              ${validationError ? 'border-red-500 bg-red-50' : 'border-gray-300'}
              ${disabled ? 'bg-gray-100' : 'bg-white'}
              focus:outline-none focus:ring-2 focus:ring-blue-500`}
          />
        </div>

        {/* Selector de unidad */}
        <div className="w-32" ref={dropdownRef}>
          <label className="block text-xs text-gray-500 mb-1">Unidad</label>
          {hasAlternatives ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => !disabled && setShowDropdown(!showDropdown)}
                disabled={disabled}
                className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium 
                           text-gray-700 bg-white border border-gray-300 rounded-lg 
                           hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <span>{currentUnit?.symbol || currentUnit?.code}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showDropdown && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 
                                rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {/* Unidad base */}
                  <button
                    type="button"
                    onClick={() => handleUnitChange(unitsData.baseUnit!)}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex items-center justify-between
                      ${!selectedUnitId || selectedUnitId === unitsData.baseUnit?.id ? 'bg-blue-50 text-blue-700' : ''}`}
                  >
                    <span>{unitsData.baseUnit?.name}</span>
                    {(!selectedUnitId || selectedUnitId === unitsData.baseUnit?.id) && (
                      <Check className="w-4 h-4 text-blue-600" />
                    )}
                  </button>

                  {/* Unidades alternativas */}
                  {unitsData.availableUnits.map((unit) => (
                    <button
                      key={unit.id}
                      type="button"
                      onClick={() => handleUnitChange(unit)}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-blue-50
                        ${selectedUnitId === unit.id ? 'bg-blue-50 text-blue-700' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{unit.name}</span>
                        {selectedUnitId === unit.id && (
                          <Check className="w-4 h-4 text-blue-600" />
                        )}
                      </div>
                      {unit.factor && (
                        <div className="text-xs text-gray-500">
                          1 {unit.symbol} = {unit.factor} {unitsData.baseUnit?.symbol}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-lg">
              {currentUnit?.symbol || currentUnit?.name}
            </div>
          )}
        </div>
      </div>

      {/* Equivalencia y errores */}
      <div className="flex items-center justify-between text-sm">
        {showEquivalence ? (
          <div className="flex items-center gap-1 text-blue-600">
            <Scale className="w-4 h-4" />
            <span>Equivale a: <strong>{quantityBase.toFixed(3)}</strong> {unitsData.baseUnit?.name}</span>
          </div>
        ) : (
          <div />
        )}

        {validationError && (
          <div className="flex items-center gap-1 text-red-600">
            <AlertCircle className="w-4 h-4" />
            <span>{validationError}</span>
          </div>
        )}
      </div>
    </div>
  );
}
