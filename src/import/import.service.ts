import { Injectable } from "@nestjs/common";
import { TmdbService } from "../tmdb/tmdb.service";
import { DatabaseService } from "../database/database.service";
import { Session } from "neo4j-driver";

@Injectable()
export class ImportService {
  private readonly recentMoviesBackfillStateKey = "recent-movies-backfill";

  constructor(
    private readonly tmdbService: TmdbService,
    private readonly neo4jService: DatabaseService,
  ) {}

  // Método para insertar o actualizar una película en Neo4j
  private async upsertMovie(
    session: Session,
    movie: any,
    movieDetails: any,
    genresParam: any[],
  ) {
    const cast =
      movieDetails.credits?.cast
        .filter((actor) => actor.order < 10)
        .map((actor) => actor.name) || []; // Asegura que cast sea un array

    const director =
      movieDetails.credits?.crew.find(
        (crewMember) => crewMember.job === "Director",
      )?.name || "Unknown";

    const trailer = movieDetails.videos?.results.find(
      (video) => video.type === "Trailer",
    )?.key;

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
        title: movie.title || "Unknown Title",
        overview: movie.overview || "No overview available",
        release_date: movie.release_date || "Unknown",
        duration: movieDetails.runtime || 0,
        director,
        cast,
        original_language: movieDetails.original_language || "Unknown",
        subtitles:
          movieDetails.spoken_languages?.map((lang) => lang.name) || [],
        age_rating:
          movieDetails.release_dates?.results[0]?.release_dates[0]
            ?.certification || "NR",
        score: movieDetails.vote_average || 0,
        cover_image: movieDetails.poster_path
          ? `https://image.tmdb.org/t/p/w500${movieDetails.poster_path}`
          : null,
        trailer_url: trailer
          ? `https://www.youtube.com/watch?v=${trailer}`
          : null,
        tags:
          movieDetails.keywords?.keywords.map((keyword) => keyword.name) || [],
        genres: genresParam,
      },
    );
  }

  // Método para importar géneros de TMDB
  async importGenres() {
    console.log("Starting to import genres...");
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

      console.log("Genres imported successfully");
    } catch (error) {
      console.error("Error importing genres:", error);
    } finally {
      await session.close();
    }
  }

  // Método para importar películas de TMDB (populares o todas)
  async importMovies(fetchAll: boolean = false) {
    console.log("Starting to import movies...");
    const session = await this.neo4jService.getSession();

    try {
      let movies;
      if (fetchAll) {
        movies = await this.tmdbService.getAllMovies();
      } else {
        movies = await this.tmdbService
          .getPopularMovies()
          .then((data) => data.results);
      }
      console.log(`Fetched ${movies.length} movies from TMDB`);

      const allGenres = await this.tmdbService.getGenres();
      const genreMap = new Map(
        allGenres.map((genre) => [genre.id, genre.name]),
      );

      for (const movie of movies) {
        console.log(`Importing movie: ${movie.title}`);

        const movieDetails = await this.tmdbService.getMovieDetails(movie.id);

        const genres = movie.genre_ids.map((id) => ({
          id,
          name: genreMap.get(id),
        }));

        const genresParam = genres.length > 0 ? genres : [];

        await this.upsertMovie(session, movie, movieDetails, genresParam);
      }

      console.log("Movies imported successfully");
    } catch (error) {
      console.error("Error importing movies:", error);
    } finally {
      await session.close();
    }
  }

  // Método para importar las últimas películas de TMDB
  async importLatestMovies() {
    console.log("Starting to import latest movies...");
    const session = await this.neo4jService.getSession();

    try {
      const latestMovies = await this.tmdbService.getLatestMovies();

      if (!latestMovies || latestMovies.length === 0) {
        console.error("No latest movies found or invalid response format");
        return;
      }

      console.log(`Fetched ${latestMovies.length} latest movies from TMDB`);

      const allGenres = await this.tmdbService.getGenres();
      const genreMap = new Map(
        allGenres.map((genre) => [genre.id, genre.name]),
      );

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

      console.log("Latest movies imported successfully");
    } catch (error) {
      console.error("Error importing latest movies:", error);
    } finally {
      await session.close();
    }
  }

  async refreshRecentMovies(pagesToRefresh: number = 2) {
    const safePagesToRefresh = Math.max(1, Math.min(pagesToRefresh, 10));
    const summary = await this.importDiscoverMoviesPages({
      startPage: 1,
      pagesToImport: safePagesToRefresh,
      mode: "refresh",
    });

    return summary;
  }

  async importRecentMoviesBackfillBatch(pagesToImport: number = 5) {
    const safePagesToImport = Math.max(1, Math.min(pagesToImport, 50));
    const session = await this.neo4jService.getSession();

    const summary = {
      mode: "backfill",
      requestedPages: safePagesToImport,
      startPage: 1,
      nextPage: 1,
      importedMovies: 0,
      skippedMovies: 0,
      failedMovies: 0,
      processedPages: 0,
    };

    try {
      await this.ensureMovieConstraints(session);

      const stateResult = await session.run(
        `
        MERGE (state:ImportState {key: $key})
        ON CREATE SET
          state.nextPage = 1,
          state.createdAt = datetime()
        SET state.lastStartedAt = datetime()
        RETURN state.nextPage AS nextPage
        `,
        { key: this.recentMoviesBackfillStateKey },
      );

      const startPage = Number(stateResult.records[0].get("nextPage") || 1);
      summary.startPage = startPage;
      const batchSummary = await this.importDiscoverMoviesPages({
        startPage,
        pagesToImport: safePagesToImport,
        mode: "backfill",
        session,
      });
      Object.assign(summary, batchSummary);

      await session.run(
        `
        MERGE (state:ImportState {key: $key})
        SET
          state.nextPage = $nextPage,
          state.lastFinishedAt = datetime(),
          state.lastImportedMovies = $importedMovies,
          state.lastFailedMovies = $failedMovies,
          state.lastProcessedPages = $processedPages
        `,
        {
          key: this.recentMoviesBackfillStateKey,
          nextPage: summary.nextPage,
          importedMovies: summary.importedMovies,
          failedMovies: summary.failedMovies,
          processedPages: summary.processedPages,
        },
      );

      console.log("Recent movies import finished:", summary);
      return summary;
    } finally {
      await session.close();
    }
  }

  async getRecentMoviesImportStatus() {
    const session = await this.neo4jService.getSession();

    try {
      const result = await session.run(
        `
        MATCH (state:ImportState {key: $key})
        RETURN state
        `,
        { key: this.recentMoviesBackfillStateKey },
      );

      if (result.records.length === 0) {
        return {
          key: this.recentMoviesBackfillStateKey,
          nextPage: 1,
          message: "Recent movies backfill has not started yet.",
        };
      }

      return result.records[0].get("state").properties;
    } finally {
      await session.close();
    }
  }

  async resetRecentMoviesImportProgress() {
    const session = await this.neo4jService.getSession();

    try {
      await session.run(
        `
        MERGE (state:ImportState {key: $key})
        SET
          state.nextPage = 1,
          state.resetAt = datetime()
        `,
        { key: this.recentMoviesBackfillStateKey },
      );

      return {
        key: this.recentMoviesBackfillStateKey,
        nextPage: 1,
        message: "Recent movies backfill progress reset.",
      };
    } finally {
      await session.close();
    }
  }

  private async ensureMovieConstraints(session: Session) {
    await session.run(
      "CREATE CONSTRAINT movie_id_unique IF NOT EXISTS FOR (m:Movie) REQUIRE m.id IS UNIQUE",
    );
    await session.run(
      "CREATE CONSTRAINT genre_id_unique IF NOT EXISTS FOR (g:Genre) REQUIRE g.id IS UNIQUE",
    );
    await session.run(
      "CREATE CONSTRAINT import_state_key_unique IF NOT EXISTS FOR (state:ImportState) REQUIRE state.key IS UNIQUE",
    );
  }

  private async importDiscoverMoviesPages({
    startPage,
    pagesToImport,
    mode,
    session: existingSession,
  }: {
    startPage: number;
    pagesToImport: number;
    mode: "refresh" | "backfill";
    session?: Session;
  }) {
    const session = existingSession || (await this.neo4jService.getSession());
    const shouldCloseSession = !existingSession;
    const summary = {
      mode,
      requestedPages: pagesToImport,
      startPage,
      nextPage: startPage,
      importedMovies: 0,
      skippedMovies: 0,
      failedMovies: 0,
      processedPages: 0,
    };

    try {
      await this.ensureMovieConstraints(session);

      const allGenres = await this.tmdbService.getGenres();
      const genreMap = new Map(
        allGenres.map((genre) => [genre.id, genre.name]),
      );

      for (let page = startPage; page < startPage + pagesToImport; page++) {
        const discoverResponse =
          await this.tmdbService.discoverMoviesByReleaseDate(page);
        const movies = discoverResponse.results || [];

        if (movies.length === 0) {
          break;
        }

        console.log(
          `Importing recent movies ${mode} page ${page}/${discoverResponse.total_pages}`,
        );

        for (const movie of movies) {
          try {
            const movieDetails = await this.tmdbService.getMovieDetails(
              movie.id,
            );
            const genres = Array.isArray(movie.genre_ids)
              ? movie.genre_ids.map((id) => ({
                  id,
                  name: genreMap.get(id) || "Unknown",
                }))
              : [];

            await this.upsertMovie(session, movie, movieDetails, genres);
            summary.importedMovies++;
          } catch (error) {
            summary.failedMovies++;
            console.error(
              `Failed to import movie ${movie.id} (${movie.title || "Unknown"}):`,
              error.message,
            );
          }
        }

        summary.processedPages++;
        summary.nextPage = page + 1;

        if (page >= discoverResponse.total_pages) {
          summary.nextPage = 1;
          break;
        }
      }

      return summary;
    } finally {
      if (shouldCloseSession) {
        await session.close();
      }
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
    console.log("Starting to import actors...");
    const session = await this.neo4jService.getSession();

    try {
      const movies = await this.tmdbService.getAllMovies();
      console.log(
        `Fetched ${movies.length} movies from TMDB to extract actors`,
      );

      const processedActors = new Set<number>();

      for (const movie of movies) {
        const movieDetails = await this.tmdbService.getMovieDetails(movie.id);
        const actors = movieDetails.credits.cast;

        for (const actor of actors) {
          if (!processedActors.has(actor.id)) {
            processedActors.add(actor.id);

            // Aquí se añade el log de progreso
            console.log(`Fetching actor details for: ${actor.name}`);

            const actorDetails = await this.tmdbService.getActorDetails(
              actor.id,
            );
            await this.upsertActor(session, actorDetails);

            // Log cuando se completa la inserción/actualización
            console.log(`Successfully fetched and upserted: ${actor.name}`);
          }
        }
      }

      console.log("Actors imported successfully");
    } catch (error) {
      console.error("Error importing actors:", error);
    } finally {
      await session.close();
    }
  }
}
