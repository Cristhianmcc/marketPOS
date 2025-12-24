-- Corregir stock negativo del Arroz a Granel
-- Este script actualiza el stock a 0 para productos con stock negativo

UPDATE store_products 
SET stock = 0, updated_at = NOW()
WHERE stock < 0;

-- Ver productos afectados
SELECT 
  sp.id,
  pm.name,
  sp.stock,
  sp.price
FROM store_products sp
JOIN products_master pm ON sp.product_id = pm.id
WHERE sp.stock <= 0;
