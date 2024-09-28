import { Injectable } from '@nestjs/common';
import { TmdbService } from '../tmdb/tmdb.service';
import { DatabaseService } from '../database/database.service';
import { Session } from 'neo4j-driver';

@Injectable()
export class ImportService {
  constructor(
    private readonly tmdbService: TmdbService,
    private readonly neo4jService: DatabaseService,
  ) {}

  // Método para insertar o actualizar una película en Neo4j
  private async upsertMovie(session: Session, movie: any, movieDetails: any, genresParam: any[]) {
    const cast = movieDetails.credits?.cast
      .filter((actor) => actor.order < 10)
      .map((actor) => actor.name) || []; // Asegura que cast sea un array
  
    const director = movieDetails.credits?.crew.find((crewMember) => crewMember.job === 'Director')?.name || 'Unknown';
  
    const trailer = movieDetails.videos?.results.find((video) => video.type === 'Trailer')?.key;
  
    await session.run(
      `
      MERGE (m:Movie {id: $id})
      ON CREATE SET 
        m.title = $title, 
        m.overview = $overview, 
        m.release_date = $release_date,
        m.duration = $duration,
        m.director = $director,
        m.cast = $cast,
        m.original_language = $original_language,
        m.subtitles = $subtitles,
        m.age_rating = $age_rating,
        m.score = $score,
        m.cover_image = $cover_image,
        m.trailer_url = $trailer_url,
        m.tags = $tags
      ON MATCH SET
        m.title = $title, 
        m.overview = $overview, 
        m.release_date = $release_date,
        m.duration = $duration,
        m.director = $director,
        m.cast = $cast,
        m.original_language = $original_language,
        m.subtitles = $subtitles,
        m.age_rating = $age_rating,
        m.score = $score,
        m.cover_image = $cover_image,
        m.trailer_url = $trailer_url,
        m.tags = $tags
      FOREACH (genre IN $genres |
        MERGE (g:Genre {id: genre.id})
        ON CREATE SET g.name = genre.name
        MERGE (m)-[:BELONGS_TO]->(g)
      )
      `,
      {
        id: movie.id,
        title: movie.title || 'Unknown Title',
        overview: movie.overview || 'No overview available',
        release_date: movie.release_date || 'Unknown',
        duration: movieDetails.runtime || 0,
        director,
        cast,
        original_language: movieDetails.original_language || 'Unknown',
        subtitles: movieDetails.spoken_languages?.map((lang) => lang.name) || [],
        age_rating: movieDetails.release_dates?.results[0]?.release_dates[0]?.certification || 'NR',
        score: movieDetails.vote_average || 0,
        cover_image: movieDetails.poster_path ? `https://image.tmdb.org/t/p/w500${movieDetails.poster_path}` : null,
        trailer_url: trailer ? `https://www.youtube.com/watch?v=${trailer}` : null,
        tags: movieDetails.keywords?.keywords.map((keyword) => keyword.name) || [],
        genres: genresParam,
      }
    );
  }
  
  // Método para importar géneros de TMDB
  async importGenres() {
    console.log('Starting to import genres...');
    const session = await this.neo4jService.getSession();

    try {
      const genres = await this.tmdbService.getGenres();
      console.log(`Fetched ${genres.length} genres from TMDB`);

      for (const genre of genres) {
        console.log(`Importing genre: ${genre.name}`);
        await session.run(
          `
          MERGE (g:Genre {id: $id})
          ON CREATE SET g.name = $name
          `,
          {
            id: genre.id,
            name: genre.name,
          },
        );
      }

      console.log('Genres imported successfully');
    } catch (error) {
      console.error('Error importing genres:', error);
    } finally {
      await session.close();
    }
  }

  // Método para importar películas de TMDB (populares o todas)
  async importMovies(fetchAll: boolean = false) {
    console.log('Starting to import movies...');
    const session = await this.neo4jService.getSession();
  
    try {
      let movies;
      if (fetchAll) {
        movies = await this.tmdbService.getAllMovies();
      } else {
        movies = await this.tmdbService.getPopularMovies().then(data => data.results);
      }
      console.log(`Fetched ${movies.length} movies from TMDB`);
  
      const allGenres = await this.tmdbService.getGenres();
      const genreMap = new Map(allGenres.map((genre) => [genre.id, genre.name]));
  
      for (const movie of movies) {
        console.log(`Importing movie: ${movie.title}`);
  
        const movieDetails = await this.tmdbService.getMovieDetails(movie.id);
  
        const genres = movie.genre_ids.map(id => ({
          id,
          name: genreMap.get(id),
        }));
  
        const genresParam = genres.length > 0 ? genres : [];
  
        await this.upsertMovie(session, movie, movieDetails, genresParam);
      }          
  
      console.log('Movies imported successfully');
    } catch (error) {
      console.error('Error importing movies:', error);
    } finally {
      await session.close();
    }
  }

  // Método para importar las últimas películas de TMDB
  async importLatestMovies() {
    console.log('Starting to import latest movies...');
    const session = await this.neo4jService.getSession();
  
    try {
      const latestMovies = await this.tmdbService.getLatestMovies();
  
      if (!latestMovies || latestMovies.length === 0) {
        console.error('No latest movies found or invalid response format');
        return;
      }
  
      console.log(`Fetched ${latestMovies.length} latest movies from TMDB`);
  
      const allGenres = await this.tmdbService.getGenres();
      const genreMap = new Map(allGenres.map((genre) => [genre.id, genre.name]));
  
      for (const movie of latestMovies) {
        console.log(`Importing latest movie: ${movie.title}`);
  
        const movieDetails = await this.tmdbService.getMovieDetails(movie.id);
  
        // Verificar si genre_ids existe y es un arreglo antes de usar map
        const genres = Array.isArray(movie.genre_ids)
          ? movie.genre_ids.map((id) => ({
              id,
              name: genreMap.get(id),
            }))
          : [];
  
        const genresParam = genres.length > 0 ? genres : [];
  
        await this.upsertMovie(session, movie, movieDetails, genresParam);
      }
  
      console.log('Latest movies imported successfully');
    } catch (error) {
      console.error('Error importing latest movies:', error);
    } finally {
      await session.close();
    }
  }
  


  private async upsertActor(session: Session, actor: any) {
    await session.run(
      `
      MERGE (a:Actor {id: $id})
      ON CREATE SET 
        a.name = $name,
        a.profilePath = $profilePath,
        a.biography = $biography,
        a.birthDate = $birthDate,
        a.birthPlace = $birthPlace,
        a.popularity = $popularity
      ON MATCH SET
        a.name = $name,
        a.profilePath = $profilePath,
        a.biography = $biography,
        a.birthDate = $birthDate,
        a.birthPlace = $birthPlace,
        a.popularity = $popularity
      `,
      {
        id: actor.id,
        name: actor.name,
        profilePath: actor.profilePath,
        biography: actor.biography,
        birthDate: actor.birthDate,
        birthPlace: actor.birthPlace,
        popularity: actor.popularity,
      },
    );
  }
  

  // Método para importar actores de todas las películas en TMDB
  async importActors() {
    console.log('Starting to import actors...');
    const session = await this.neo4jService.getSession();
  
    try {
      const movies = await this.tmdbService.getAllMovies();
      console.log(`Fetched ${movies.length} movies from TMDB to extract actors`);
  
      const processedActors = new Set<number>();
  
      for (const movie of movies) {
        const movieDetails = await this.tmdbService.getMovieDetails(movie.id);
        const actors = movieDetails.credits.cast;
  
        for (const actor of actors) {
          if (!processedActors.has(actor.id)) {
            processedActors.add(actor.id);
  
            // Aquí se añade el log de progreso
            console.log(`Fetching actor details for: ${actor.name}`);
  
            const actorDetails = await this.tmdbService.getActorDetails(actor.id);
            await this.upsertActor(session, actorDetails);
  
            // Log cuando se completa la inserción/actualización
            console.log(`Successfully fetched and upserted: ${actor.name}`);
          }
        }
      }
  
      console.log('Actors imported successfully');
    } catch (error) {
      console.error('Error importing actors:', error);
    } finally {
      await session.close();
    }
  }
  
}
