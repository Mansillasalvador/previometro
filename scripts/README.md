# Actualizar precios

Requiere Python 3 (solo librería estándar). Desde la raíz del proyecto:

```bash
python scripts/actualizar_precios.py
```

- Baja el paquete SEPA más reciente (~320 MB, unos 5 minutos) a una carpeta temporal que se borra sola.
- Filtra sucursales de CABA y los EAN de `data/ingredientes.json`, y escribe la mediana en `data/precios.json`.
- Si hoy falta un producto, deja el último precio conocido con `"desactualizado": true`.
- Si la descarga falla 2 veces, frena y no toca `precios.json`.

En GitHub corre solo todos los días a las 18:00 de Argentina (`.github/workflows/precios.yml`).
Para correrlo a mano: pestaña Actions, "Actualizar precios", Run workflow.
