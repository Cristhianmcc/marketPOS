-- Limpiar imageUrl incorrectas del catálogo global
-- Solo para productos que son isGlobal = true

UPDATE products_master 
SET image_url = NULL 
WHERE is_global = true 
AND image_url IS NOT NULL;
