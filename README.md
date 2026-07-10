# Buzzflix backend

## Desarrollo local

El backend usa una instancia local de Neo4j ejecutada con Docker Compose.

1. Copia `.env.example` como `.env` y completa `TMDB_API_KEY` y `JWT_SECRET`.
2. Arranca Neo4j y espera a que esté saludable:

   ```bash
   docker compose up -d --wait neo4j
   ```

3. Arranca el backend:

   ```bash
   npm run start:dev
   ```

Neo4j Browser queda disponible en <http://localhost:7474>. La conexión Bolt
del backend usa `bolt://localhost:7687`. Los datos se conservan en el volumen
Docker `buzzflix-backend_neo4j_data` aunque se detenga o recree el contenedor.

Para detener los servicios sin borrar los datos:

```bash
docker compose down
```

Para comprobar su estado:

```bash
docker compose ps
```

## Importar películas desde TMDB

El backend puede poblar Neo4j desde TMDB usando películas ordenadas por fecha de
estreno, desde las más recientes hacia las más antiguas.

Hay dos trabajos:

- `refresh`: revisa las primeras páginas todos los días para traer novedades.
- `backfill`: avanza por páginas guardando progreso para ir llenando películas
  cada vez más antiguas.

Refrescar manualmente las más nuevas:

```bash
curl "http://localhost:3000/import/movies/recent/refresh?pages=2"
```

Importar manualmente un batch histórico:

```bash
curl "http://localhost:3000/import/movies/recent/backfill?pages=5"
```

Consultar el progreso del backfill:

```bash
curl "http://localhost:3000/import/movies/recent/status"
```

Reiniciar el progreso para empezar otra vez desde las más recientes:

```bash
curl "http://localhost:3000/import/movies/recent/reset"
```

Además, el cron del backend ejecuta `refresh` todos los días a medianoche y
`backfill` cada 6 horas. Las cantidades se controlan con
`RECENT_MOVIES_REFRESH_PAGES` y `RECENT_MOVIES_BACKFILL_PAGES_PER_RUN`.
