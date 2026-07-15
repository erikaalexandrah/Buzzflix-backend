import { Injectable } from '@nestjs/common';
import { TmdbService } from '../tmdb/tmdb.service';
import { DatabaseService } from '../database/database.service';  
import neo4j, { Session } from 'neo4j-driver';
import { Genre } from './entities/genre.entity';
import { LANDING_DEFAULT_LIMIT } from './dto/landing-query.dto';

// Se sobre-consulta por género para que, tras deduplicar globalmente,
// cada rail conserve hasta `limit` películas sin quedar vacío.
const LANDING_CANDIDATE_MULTIPLIER = 4;

// Tamaño de póster para los thumbnails del landing (más liviano que w500).
const LANDING_COVER_SIZE = 'w185';

// Cuántos favoritos se usan como "semilla" para generar rails del tipo
// "Porque te gustó X".
const LANDING_SUGGESTION_SEEDS = 3;

// Cada cuántos rails de género se intercala uno de sugerencias.
const LANDING_INTERLEAVE_EVERY = 2;

type LandingMovie = {
  id: number;
  title: string;
  description: string;
  releaseDate: string;
  rating: number;
  voteCount: number;
  cover: string;
  genre: string;
  trailerUrl: string;
  actors: string[];
  classification: string;
  subtitles: string;
};

type LandingRail = {
  name: string;
  type: 'genre' | 'suggestion';
  movies: LandingMovie[];
};

type LandingResponse = {
  latest: LandingMovie[];
  genres: LandingRail[];
};

@Injectable()
export class MovieService {
  private readonly landingCache = new Map<
    string,
    { expiresAt: number; value: LandingResponse }
  >();
  private readonly landingCacheTtlMs = 5 * 60 * 1000;

  constructor(
    private readonly tmdbService: TmdbService,
    private readonly databaseService: DatabaseService,  // Se Inyecta el servicio de Neo4j
  ) {}

  async getLanding(
    requestedGenres: string[] = Object.values(Genre),
    limit = LANDING_DEFAULT_LIMIT,
    username?: string,
  ): Promise<LandingResponse> {
    const genres = requestedGenres ?? Object.values(Genre);
    // El caché se segmenta por usuario: los usuarios anónimos comparten
    // entrada, cada usuario autenticado tiene la suya con sus sugerencias.
    const cacheKey = JSON.stringify({ genres, limit, user: username ?? null });
    const today = new Date().toISOString().slice(0, 10);
    const startedAt = performance.now();
    const cached = this.landingCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      this.logLandingMetrics(startedAt, 0, performance.now() - startedAt, true);
      return cached.value;
    }
    if (cached) this.landingCache.delete(cacheKey);

    const session: Session = await this.databaseService.getSession();
    const neo4jStartedAt = performance.now();
    let neo4jMs = 0;

    try {
      const result = await session.run(
        `CALL {
           MATCH (m:Movie)
           WHERE m.release_date >= '1900-01-01'
             AND m.release_date <= $today
             AND m.cover_image IS NOT NULL
           WITH m
           ORDER BY CASE
             WHEN coalesce(m.vote_count, 0) >= 50 AND coalesce(m.score, 0) >= 6 THEN 0
             WHEN coalesce(m.vote_count, 0) >= 10 AND coalesce(m.score, 0) >= 5 THEN 1
             WHEN m.vote_count IS NULL
               AND coalesce(m.score, 0) >= 6
               AND coalesce(m.popularity, 0) >= 10 THEN 1
             ELSE 2
           END,
           m.release_date DESC,
           coalesce(m.popularity, 0) DESC,
           coalesce(m.score, 0) DESC
           LIMIT $limit
           OPTIONAL MATCH (m)-[:BELONGS_TO]->(latestGenre:Genre)
           WITH m, collect(latestGenre.name) AS genres
           RETURN collect({ movie: m, genres: genres }) AS latest
         }
         CALL {
           UNWIND range(0, size($genres) - 1) AS genreIndex
           WITH genreIndex, $genres[genreIndex] AS genreName
           OPTIONAL MATCH (genre:Genre {name: genreName})<-[:BELONGS_TO]-(m:Movie)
           WHERE m IS NULL OR (
             m.release_date >= '1900-01-01'
             AND m.release_date <= $today
             AND m.cover_image IS NOT NULL
           )
           WITH genreIndex, genreName, m
           ORDER BY CASE
             WHEN coalesce(m.vote_count, 0) >= 50 AND coalesce(m.score, 0) >= 6 THEN 0
             WHEN coalesce(m.vote_count, 0) >= 10 AND coalesce(m.score, 0) >= 5 THEN 1
             WHEN m.vote_count IS NULL
               AND coalesce(m.score, 0) >= 6
               AND coalesce(m.popularity, 0) >= 10 THEN 1
             ELSE 2
           END,
           m.release_date DESC,
           coalesce(m.popularity, 0) DESC,
           coalesce(m.score, 0) DESC
           WITH genreIndex, genreName, collect(m)[..$candidateLimit] AS selectedMovies
           UNWIND CASE WHEN size(selectedMovies) = 0 THEN [null] ELSE selectedMovies END AS movie
           OPTIONAL MATCH (movie)-[:BELONGS_TO]->(movieGenre:Genre)
           WITH genreIndex, genreName, movie, collect(movieGenre.name) AS movieGenres
           WITH genreIndex, genreName,
             collect({ movie: movie, genres: movieGenres }) AS movieEntries
           ORDER BY genreIndex
           RETURN collect({
             name: genreName,
             movies: CASE WHEN movieEntries[0].movie IS NULL THEN [] ELSE movieEntries END
           }) AS genreGroups
         }
         RETURN latest, genreGroups`,
        {
          genres,
          limit: neo4j.int(limit),
          candidateLimit: neo4j.int(limit * LANDING_CANDIDATE_MULTIPLIER),
          today,
        },
      );
      neo4jMs = performance.now() - neo4jStartedAt;

      const transformStartedAt = performance.now();
      const record = result.records[0];

      // Deduplicación global: cada película aparece una sola vez en todo el
      // landing. `latest` tiene prioridad; luego cada película se queda en el
      // primer género donde aparezca, recortando cada rail a `limit`.
      const seen = new Set<LandingMovie['id']>();

      const latest = (record?.get('latest') || [])
        .map((entry) => this.toLandingMovie(entry.movie.properties, entry.genres))
        .filter((movie) => {
          if (seen.has(movie.id)) return false;
          seen.add(movie.id);
          return true;
        });

      const genreGroups = (record?.get('genreGroups') || []).map((group) => {
        const movies: LandingMovie[] = [];
        for (const entry of group.movies) {
          if (movies.length >= limit) break;
          const movie = this.toLandingMovie(entry.movie.properties, entry.genres);
          if (seen.has(movie.id)) continue;
          seen.add(movie.id);
          movies.push(movie);
        }
        return { name: group.name, type: 'genre' as const, movies };
      });

      // Sugerencias personalizadas: solo para usuarios autenticados que tengan
      // favoritos. Se deduplican contra lo ya mostrado y se intercalan entre
      // los rails de género.
      const suggestionRails = username
        ? await this.buildSuggestionRails(session, username, limit, today, seen)
        : [];
      const rails = this.interleaveRails(genreGroups, suggestionRails);

      const response: LandingResponse = { latest, genres: rails };
      JSON.stringify(response);
      const transformMs = performance.now() - transformStartedAt;

      this.landingCache.set(cacheKey, {
        expiresAt: Date.now() + this.landingCacheTtlMs,
        value: response,
      });
      this.logLandingMetrics(startedAt, neo4jMs, transformMs, false);
      return response;
    } catch (error) {
      neo4jMs = performance.now() - neo4jStartedAt;
      this.logLandingMetrics(startedAt, neo4jMs, 0, false);
      console.error('Error fetching landing movies:', error);
      throw new Error('Failed to fetch landing movies');
    } finally {
      await session.close();
    }
  }

  private toLandingMovie(movie: any, genres: string[]): LandingMovie {
    return {
      id: movie.id,
      title: movie.title,
      description: movie.overview,
      releaseDate: movie.release_date,
      rating: movie.score,
      voteCount: movie.vote_count || 0,
      cover: this.toLandingCover(movie.cover_image),
      genre: (genres || []).join(', '),
      trailerUrl: movie.trailer_url || '',
      actors: movie.cast || [],
      classification: movie.age_rating,
      subtitles: Array.isArray(movie.subtitles)
        ? movie.subtitles.join(', ')
        : movie.subtitles || '',
    };
  }

  // Las portadas se guardan como URL fija en w500. Para los thumbnails del
  // landing reescribimos el segmento de tamaño a uno más liviano (w185),
  // sin necesidad de migrar los datos existentes.
  private toLandingCover(coverImage: string | null | undefined): string {
    if (!coverImage) return '';
    return coverImage.replace('/w500/', `/${LANDING_COVER_SIZE}/`);
  }

  // Construye los rails de sugerencias para un usuario autenticado:
  //  - "Porque te gustó X": por cada favorito semilla, películas que comparten
  //    actores/género con él (priorizando actores compartidos).
  //  - "Otros usuarios también disfrutaron": filtrado colaborativo simple sobre
  //    quienes comparten favoritos con el usuario.
  // Devuelve [] si el usuario no tiene favoritos. Deduplica contra `seen` (lo
  // ya mostrado en latest/géneros) y entre los propios rails de sugerencias.
  private async buildSuggestionRails(
    session: Session,
    username: string,
    limit: number,
    today: string,
    seen: Set<LandingMovie['id']>,
  ): Promise<LandingRail[]> {
    const params = {
      username,
      today,
      seedCount: neo4j.int(LANDING_SUGGESTION_SEEDS),
      candidateLimit: neo4j.int(limit * LANDING_CANDIDATE_MULTIPLIER),
    };

    const [becauseYouLiked, collaborative] = await Promise.all([
      session.run(
        `MATCH (u:User {username: $username})-[:FAVORITES]->(fav:Movie)
         WITH u, fav
         ORDER BY coalesce(fav.popularity, 0) DESC, coalesce(fav.score, 0) DESC
         LIMIT $seedCount
         CALL {
           WITH u, fav
           MATCH (fav)-[:BELONGS_TO]->(:Genre)<-[:BELONGS_TO]-(rec:Movie)
           WHERE rec.id <> fav.id
             AND rec.cover_image IS NOT NULL
             AND rec.release_date <= $today
             AND NOT EXISTS { (u)-[:FAVORITES]->(rec) }
           OPTIONAL MATCH (fav)<-[:APPEARS_IN]-(a:Actor)-[:APPEARS_IN]->(rec)
           WITH rec, count(DISTINCT a) AS sharedActors
           ORDER BY sharedActors DESC,
             coalesce(rec.score, 0) DESC,
             coalesce(rec.popularity, 0) DESC
           LIMIT $candidateLimit
           RETURN collect({
             movie: rec,
             genres: [(rec)-[:BELONGS_TO]->(g:Genre) | g.name]
           }) AS movies
         }
         RETURN fav.title AS seedTitle, movies`,
        params,
      ),
      session.run(
        `MATCH (u:User {username: $username})-[:FAVORITES]->(:Movie)<-[:FAVORITES]-(other:User)
         WHERE other <> u
         MATCH (other)-[:FAVORITES]->(rec:Movie)
         WHERE rec.cover_image IS NOT NULL
           AND rec.release_date <= $today
           AND NOT EXISTS { (u)-[:FAVORITES]->(rec) }
         WITH rec, count(DISTINCT other) AS overlap
         ORDER BY overlap DESC,
           coalesce(rec.score, 0) DESC,
           coalesce(rec.popularity, 0) DESC
         LIMIT $candidateLimit
         RETURN collect({
           movie: rec,
           genres: [(rec)-[:BELONGS_TO]->(g:Genre) | g.name]
         }) AS movies`,
        params,
      ),
    ]);

    const rails: LandingRail[] = [];

    for (const record of becauseYouLiked.records) {
      rails.push({
        name: `Porque te gustó ${record.get('seedTitle')}`,
        type: 'suggestion',
        movies: this.dedupeRailMovies(record.get('movies'), limit, seen),
      });
    }

    const collaborativeMovies = this.dedupeRailMovies(
      collaborative.records[0]?.get('movies') || [],
      limit,
      seen,
    );
    if (collaborativeMovies.length > 0) {
      rails.push({
        name: 'Otros usuarios también disfrutaron',
        type: 'suggestion',
        movies: collaborativeMovies,
      });
    }

    // Descartamos rails que quedaron vacíos tras deduplicar.
    return rails.filter((rail) => rail.movies.length > 0);
  }

  // Mapea las entradas de un rail a LandingMovie, deduplicando contra `seen`
  // (mutándolo) y recortando a `limit`.
  private dedupeRailMovies(
    entries: Array<{ movie: any; genres: string[] }>,
    limit: number,
    seen: Set<LandingMovie['id']>,
  ): LandingMovie[] {
    const movies: LandingMovie[] = [];
    for (const entry of entries) {
      if (movies.length >= limit) break;
      if (!entry?.movie) continue;
      const movie = this.toLandingMovie(entry.movie.properties, entry.genres);
      if (seen.has(movie.id)) continue;
      seen.add(movie.id);
      movies.push(movie);
    }
    return movies;
  }

  // Intercala los rails de sugerencias entre los de género: uno de sugerencias
  // cada LANDING_INTERLEAVE_EVERY rails de género. Las sugerencias sobrantes se
  // añaden al final.
  private interleaveRails(
    genreRails: LandingRail[],
    suggestionRails: LandingRail[],
  ): LandingRail[] {
    if (suggestionRails.length === 0) return genreRails;

    const result: LandingRail[] = [];
    const pending = [...suggestionRails];
    genreRails.forEach((rail, index) => {
      result.push(rail);
      if ((index + 1) % LANDING_INTERLEAVE_EVERY === 0 && pending.length > 0) {
        result.push(pending.shift());
      }
    });
    result.push(...pending);
    return result;
  }

  private logLandingMetrics(
    startedAt: number,
    neo4jMs: number,
    transformMs: number,
    cacheHit: boolean,
  ) {
    console.log(
      JSON.stringify({
        event: 'movie.landing.performance',
        totalMs: Number((performance.now() - startedAt).toFixed(2)),
        neo4jMs: Number(neo4jMs.toFixed(2)),
        transformAndSerializationMs: Number(transformMs.toFixed(2)),
        cache: cacheHit ? 'hit' : 'miss',
      }),
    );
  }

  async getLatestMovies() {
    try {
      const latestMovies = await this.tmdbService.getLatestMovies();
      return latestMovies.map(movie => ({
        id: movie.id,
        title: movie.title,
        description: movie.description,
        releaseDate: movie.releaseDate,
        rating: movie.rating,
        cover: movie.cover,
        genre: movie.genre,
        trailerUrl: movie.trailerUrl,
        actors: movie.actors,
        classification: movie.classification,
        subtitles: movie.subtitles,
      }));
    } catch (error) {
      console.error('Error in movieService.getLatestMovies:', error.message);
      throw new Error('Failed to fetch latest movies');
    }
  }
  

  // Devuelve la película más popular (por popularity, con score como
  // desempate) leyendo SOLO de Neo4j, sin llamar a TMDB. Ideal para el
  // banner/hero de portada.
  async getFeaturedMovie() {
    const session: Session = await this.databaseService.getSession();
    try {
      const result = await session.run(
        `MATCH (m:Movie)
         OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
         WITH m, collect(g.name) AS genres
         RETURN m, genres
         ORDER BY coalesce(m.popularity, 0) DESC, coalesce(m.score, 0) DESC
         LIMIT 1`,
      );

      if (result.records.length === 0) {
        return null;
      }

      const movie = result.records[0].get('m').properties;
      const genres: string[] = result.records[0].get('genres') || [];

      return {
        id: movie.id,
        title: movie.title,
        description: movie.overview,
        releaseDate: movie.release_date,
        rating: movie.score,
        cover: movie.cover_image,
        genre: genres.join(', '),
        trailerUrl: movie.trailer_url,
        actors: movie.cast || [],
        classification: movie.age_rating,
        subtitles: Array.isArray(movie.subtitles)
          ? movie.subtitles.join(', ')
          : movie.subtitles || '',
      };
    } catch (error) {
      console.error('Error fetching featured movie:', error);
      throw new Error('Failed to fetch featured movie');
    } finally {
      await session.close();
    }
  }

  async getMoviesByGenre(genre: string) {
    const session: Session = await this.databaseService.getSession();
    try {
      const result = await session.run(
        `MATCH (m:Movie)-[:BELONGS_TO]->(g:Genre {name: $genre})
         RETURN m
         LIMIT 30`,
        { genre }
      );

      // Obtener los detalles completos de cada película desde TMDB
      const movies = await Promise.all(result.records.map(async record => {
        const movie = record.get('m').properties;
        // Suponiendo que `movie.id` es el ID de la película en TMDB
        const movieDetails = await this.tmdbService.getMovieDetails(movie.id);

        return {
          id: movieDetails.id,  
          title: movieDetails.title,
          description: movieDetails.overview,
          releaseDate: movieDetails.release_date,
          rating: movieDetails.vote_average,
          cover: `https://image.tmdb.org/t/p/w500${movieDetails.poster_path}`,
          genre: movieDetails.genres.map((g: any) => g.name).join(', '),
          trailerUrl: movieDetails.videos.results.find((video: any) => video.type === 'Trailer')?.key || '',
          actors: movieDetails.credits.cast.slice(0, 10).map((actor: any) => actor.name),
          classification: movieDetails.release_dates.results.find((releaseDate: any) => releaseDate.iso_3166_1 === 'US')?.release_dates[0]?.certification || 'NR',
          subtitles: movieDetails.spoken_languages.map((lang: any) => lang.name).join(', '),
        };
      }));

      return movies;
    } catch (error) {
      console.error('Error fetching movies by genre:', error);
      throw new Error('Failed to fetch movies by genre');
    } finally {
      await session.close();  
    }
  }


  async searchMoviesByName(name: string) {
    const session: Session = await this.databaseService.getSession();
    try {
      // Buscar películas por nombre
      const result = await session.run(
        `MATCH (m:Movie)
         WHERE toLower(m.title) CONTAINS toLower($name)
         RETURN m
         LIMIT 30`,
        { name }
      );
  
      const movies = result.records.map(record => {
        const movie = record.get('m').properties;
        return {
          id: movie.id,
          title: movie.title,
          description: movie.overview,
          releaseDate: movie.release_date,
          rating: movie.score,
          cover: movie.cover_image,
          genre: movie.tags || [],
          trailerUrl: movie.trailer_url || '',
          actors: movie.cast || [], 
          classification: movie.age_rating,
          subtitles: movie.subtitles || [],
        };
      });
  
      // Obtener los dos primeros actores de cada película para buscar sugerencias
      const movieIds = movies.map(movie => movie.id);
      const actorResult = await session.run(
        `MATCH (a:Actor)-[:APPEARS_IN]->(m:Movie)
         WHERE m.id IN $movieIds
         WITH m.id AS movieId, a.name AS actorName
         ORDER BY movieId, actorName
         WITH movieId, COLLECT(actorName)[..2] AS topActors
         RETURN movieId, topActors`,
        { movieIds }
      );
  
      // Mapear los dos primeros actores para sugerencias
      const actorMap = new Map<string, string[]>();
      actorResult.records.forEach(record => {
        const movieId = record.get('movieId');
        const topActors = record.get('topActors');
        actorMap.set(movieId, topActors);
      });
  
      // Buscar películas adicionales de los dos primeros actores de cada película
      const uniqueActors = Array.from(new Set(actorResult.records.flatMap(record => record.get('topActors'))));
      const additionalMoviesResult = await session.run(
        `MATCH (a:Actor)-[:APPEARS_IN]->(m:Movie)
         WHERE a.name IN $uniqueActors AND NOT m.id IN $movieIds
         RETURN DISTINCT m LIMIT 30`,
        { uniqueActors, movieIds }
      );
  
      const additionalMovies = additionalMoviesResult.records.map(record => {
        const movie = record.get('m').properties;
        return {
          id: movie.id,
          title: movie.title,
          description: movie.overview,
          releaseDate: movie.release_date,
          rating: movie.score,
          cover: movie.cover_image,
          genre: movie.tags || [],
          trailerUrl: movie.trailer_url || '',
          actors: movie.cast || [], 
          classification: movie.age_rating,
          subtitles: movie.subtitles || [],
        };
      });
  
      return {
        movies,          // Coincidencias de título con todos los actores
        actorMovies: additionalMovies,  // Películas sugeridas basadas en actores
      };
    } catch (error) {
      console.error('Error searching movies by name:', error);
      throw new Error('Failed to search movies by name');
    } finally {
      await session.close(); 
    }
  }  
  

  async addMovieToFavorites(username: string, id: string) {
    const session: Session = await this.databaseService.getSession();
    try {
      const idFloat = parseFloat(id);
  
      const result = await session.run(
        `MATCH (u:User {username: $username}), (m:Movie {id: $id})
         MERGE (u)-[:FAVORITES]->(m)
         RETURN m`,
        { username, id: idFloat }
      );
  
      if (result.records.length === 0) {
        throw new Error('Movie or User not found');
      }
  
      return { message: 'Movie added to favorites' };
    } catch (error) {
      console.error('Error adding movie to favorites:', error);
      throw new Error('Failed to add movie to favorites');
    } finally {
      await session.close();
    }
  }
  
  
  async removeMovieFromFavorites(username: string, movieId: string) {
    const session: Session = await this.databaseService.getSession();
    try {
      const movieIdFloat = parseFloat(movieId);  // Convierte el movieId a float
      const result = await session.run(
        `MATCH (u:User {username: $username})-[r:FAVORITES]->(m:Movie {id: $movieId})
         DELETE r
         RETURN m`,
        { username, movieId: movieIdFloat }  // Usa el valor convertido
      );
  
      if (result.records.length === 0) {
        throw new Error('Movie or User not found');
      }
  
      return { message: 'Movie removed from favorites' };
    } catch (error) {
      console.error('Error removing movie from favorites:', error);
      throw new Error('Failed to remove movie from favorites');
    } finally {
      await session.close();
    }
  }

  async isMovieFavorite(username: string, movieId: string): Promise<boolean> {
    const session: Session = await this.databaseService.getSession();
    try {
      const movieIdNumber = parseFloat(movieId);
      const result = await session.run(
        `MATCH (u:User {username: $username})-[:FAVORITES]->(m:Movie)
         WHERE m.id = $movieId
         RETURN m`,
        { username, movieId: movieIdNumber }
      );
      return result.records.length > 0;  // Si hay registros, la película es favorita
    } catch (error) {
      console.error('Error checking if movie is favorite:', error);
      throw new Error('Failed to check if movie is favorite');
    } finally {
      await session.close();
    }
  }
  
  async getUserFavorites(username: string) {
    const session: Session = await this.databaseService.getSession();
    try {
      const result = await session.run(
        `MATCH (u:User {username: $username})-[:FAVORITES]->(m:Movie)
         RETURN m`,
        { username }
      );
  
      // Obtener los detalles completos de cada película desde TMDB
      const favoriteMovies = await Promise.all(result.records.map(async record => {
        const movie = record.get('m').properties;
        // Suponiendo que `movie.id` es el ID de la película en TMDB
        const movieDetails = await this.tmdbService.getMovieDetails(movie.id);
  
        return {
          id: movieDetails.id,  // Incluir el `id`
          title: movieDetails.title,
          description: movieDetails.overview,
          releaseDate: movieDetails.release_date,
          rating: movieDetails.vote_average,
          cover: `https://image.tmdb.org/t/p/w500${movieDetails.poster_path}`,
          genre: movieDetails.genres.map((g: any) => g.name).join(', '),
          trailerUrl: movieDetails.videos.results.find((video: any) => video.type === 'Trailer')?.key || '',
          actors: movieDetails.credits.cast.slice(0, 10).map((actor: any) => actor.name),
          classification: movieDetails.release_dates.results.find((releaseDate: any) => releaseDate.iso_3166_1 === 'US')?.release_dates[0]?.certification || 'NR',
          subtitles: movieDetails.spoken_languages.map((lang: any) => lang.name).join(', '),
        };
      }));
  
      return favoriteMovies;
    } catch (error) {
      console.error('Error fetching user favorites:', error);
      throw new Error('Failed to fetch user favorites');
    } finally {
      await session.close();
    }
  }
}
