import { Injectable } from '@nestjs/common';
import { TmdbService } from '../tmdb/tmdb.service';
import { DatabaseService } from '../database/database.service';  
import { Session } from 'neo4j-driver';

@Injectable()
export class MovieService {
  constructor(
    private readonly tmdbService: TmdbService,
    private readonly databaseService: DatabaseService,  // Se Inyecta el servicio de Neo4j
  ) {}

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
