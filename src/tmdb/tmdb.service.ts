import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class TmdbService {
  private readonly tmdbBaseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.tmdbBaseUrl = this.configService.get<string>('tmdbapi.baseUrl');
    this.apiKey = this.configService.get<string>('tmdbapi.apiKey');
  }

  async getPopularMovies() {
    try {
      const url = `${this.tmdbBaseUrl}/movie/popular?api_key=${this.apiKey}`;
      const response = await firstValueFrom(this.httpService.get(url));
      return response.data;
    } catch (error) {
      console.error('Error fetching popular movies:', error.response?.data || error.message);
      throw new Error('Failed to fetch popular movies');
    }
  }
  
  async searchMovies(query: string) {
    try {
      const url = `${this.tmdbBaseUrl}/search/movie?api_key=${this.apiKey}&query=${query}`;
      const response = await firstValueFrom(this.httpService.get(url));
      return response.data;
    } catch (error) {
      console.error('Error searching movies:', error.response?.data || error.message);
      throw new Error('Failed to search movies');
    }
  }

  async getMovieDetails(movieId: number) {
    try {
      const url = `${this.tmdbBaseUrl}/movie/${movieId}?api_key=${this.apiKey}&append_to_response=credits,images,videos,release_dates`;
      const response = await firstValueFrom(this.httpService.get(url));
      return response.data;
    } catch (error) {
      console.error('Error fetching movie details:', error.response?.data || error.message);
      throw new Error('Failed to fetch movie details');
    }
  }  

   async getGenres() {
    try {
      const url = `${this.tmdbBaseUrl}/genre/movie/list?api_key=${this.apiKey}`;
      const response = await firstValueFrom(this.httpService.get(url));
      return response.data.genres;  // Devuelve solo la lista de géneros
    } catch (error) {
      console.error('Error fetching genres:', error.response?.data || error.message);
      throw new Error('Failed to fetch genres');
    }
  }

  async getGenreName(id: number): Promise<string> {
    const genres = await this.getGenres();
    const genre = genres.find((genre) => genre.id === id);
    return genre ? genre.name : 'Unknown';
  }

  async getAllMovies() {
    const allMovies = [];
    let page = 1;
    const maxPages = 500; // Límite de la API de TMDB
  
    while (page <= maxPages) {
      try {
        const url = `${this.tmdbBaseUrl}/movie/popular?api_key=${this.apiKey}&page=${page}`;
        const response = await firstValueFrom(this.httpService.get(url));
        allMovies.push(...response.data.results);
  
        // Si llegamos a la última página o el número máximo de páginas, salimos del loop
        if (page >= response.data.total_pages || page >= maxPages) {
          break;
        }
  
        page++;
      } catch (error) {
        console.error(`Error fetching movies from page ${page}:`, error.response?.data || error.message);
        throw new Error(`Failed to fetch movies from page ${page}`);
      }
    }
  
    console.log(`Fetched ${allMovies.length} movies from TMDB`);
    return allMovies;
  }  

  async getLatestMovies() {
    try {
      const url = `${this.tmdbBaseUrl}/movie/now_playing?api_key=${this.apiKey}`;
      const response = await firstValueFrom(this.httpService.get(url));
  
      if (!response.data || !response.data.results) {
        console.error('Unexpected response format:', response.data);
        throw new Error('Failed to fetch latest movies - invalid response format');
      }
  
      const movies = await Promise.all(response.data.results.map(async (movie: any) => {
        try {
          const movieDetails = await this.getMovieDetails(movie.id);
  
          const director = movieDetails.credits.crew.find((crewMember: any) => crewMember.job === 'Director')?.name || 'Unknown';
          const cast = movieDetails.credits.cast.slice(0, 10).map((actor: any) => actor.name);
          const trailer = movieDetails.videos.results.find((video: any) => video.type === 'Trailer')?.key || '';
          const ageRating = movieDetails.release_dates.results.find((releaseDate: any) => releaseDate.iso_3166_1 === 'US')?.release_dates[0]?.certification || 'NR';
          const subtitles = movieDetails.spoken_languages.map((lang: any) => lang.name).join(', ');
  
          return {
            id: movie.id,
            cover: `https://image.tmdb.org/t/p/w500${movieDetails.poster_path}`,
            title: movieDetails.title || movieDetails.original_title,
            trailerUrl: trailer ? `https://www.youtube.com/watch?v=${trailer}` : '',
            description: movieDetails.overview || 'No description available',
            originalLanguage: movieDetails.original_language || 'Unknown',
            actors: cast,
            releaseDate: movieDetails.release_date || 'Unknown',
            subtitles: subtitles,
            rating: movieDetails.vote_average || 0,
            classification: ageRating,
            genre: movieDetails.genres.map((genre: any) => genre.name).join(', '),
          };
        } catch (movieDetailsError) {
          console.error(`Failed to fetch details for movie ID ${movie.id}:`, movieDetailsError);
          return null;  // Evita que un error en un solo elemento cause el fallo total
        }
      }));
  
      return movies.filter(Boolean);  // Filtra cualquier resultado nulo
    } catch (error) {
      console.error('Error fetching latest movies:', error.response?.data || error.message);
      throw new Error('Failed to fetch latest movies');
    }
  }  

   // Método para obtener información de un actor por ID
   async getActorDetails(actorId: number) {
    try {
      const url = `${this.tmdbBaseUrl}/person/${actorId}?api_key=${this.apiKey}&append_to_response=movie_credits,tv_credits`;
      const response = await firstValueFrom(this.httpService.get(url));
      const actor = response.data;
      
      // Estructura los datos del actor
      return {
        id: actor.id, // Añadir el ID si es necesario para la operación `MERGE`
        name: actor.name,
        profilePath: `https://image.tmdb.org/t/p/w500${actor.profile_path}`,
        biography: actor.biography,
        birthDate: actor.birthday,
        birthPlace: actor.place_of_birth,
        popularity: actor.popularity,
        movieCredits: actor.movie_credits.cast.map((movie: any) => ({
          title: movie.title,
          character: movie.character,
          releaseDate: movie.release_date,
          poster: `https://image.tmdb.org/t/p/w500${movie.poster_path}`,
        })),
        tvCredits: actor.tv_credits.cast.map((tvShow: any) => ({
          title: tvShow.name,
          character: tvShow.character,
          firstAirDate: tvShow.first_air_date,
          poster: `https://image.tmdb.org/t/p/w500${tvShow.poster_path}`,
        })),
      };
    } catch (error) {
      console.error('Error fetching actor details:', error.response?.data || error.message);
      throw new Error('Failed to fetch actor details');
    }
  }
  

  async getActorsFromAllMovies() {
    const allActors = new Set<number>();  // Utilizamos un Set para evitar duplicados
    let page = 1;
    const maxPages = 500; // Límite de la API de TMDB

    while (page <= maxPages) {
      try {
        const url = `${this.tmdbBaseUrl}/movie/popular?api_key=${this.apiKey}&page=${page}`;
        const response = await firstValueFrom(this.httpService.get(url));
        const movies = response.data.results;

        for (const movie of movies) {
          const movieDetails = await this.getMovieDetails(movie.id);
          movieDetails.actors.forEach((actorId: number) => allActors.add(actorId));
        }

        // Si llegamos a la última página o el número máximo de páginas, salimos del loop
        if (page >= response.data.total_pages || page >= maxPages) {
          break;
        }

        page++;
      } catch (error) {
        console.error(`Error fetching movies from page ${page}:`, error.response?.data || error.message);
        throw new Error(`Failed to fetch movies from page ${page}`);
      }
    }

    // Ahora que tenemos todos los IDs de los actores, obtenemos sus detalles
    const actorDetails = [];
    for (const actorId of allActors) {
      const details = await this.getActorDetails(actorId);
      actorDetails.push(details);
    }

    return actorDetails;
  }
}

