import { ApiProperty } from '@nestjs/swagger';

export class Movie {
  @ApiProperty({
    description: 'The unique identifier of the movie',
    example: '1',
  })
  id: string;

  @ApiProperty({
    description: 'The title of the movie',
    example: 'Inception',
  })
  title: string;

  @ApiProperty({
    description: 'A brief description or overview of the movie',
    example: 'A mind-bending thriller where dream invasion is possible.',
  })
  description: string;

  @ApiProperty({
    description: 'The release date of the movie',
    example: '2010-07-16',
    type: String, 
    format: 'date', 
  })
  releaseDate: Date;

  @ApiProperty({
    description: 'The rating of the movie',
    example: 8.8,
  })
  rating: number;

  @ApiProperty({
    description: 'URL to the cover image of the movie',
    example: 'https://image.tmdb.org/t/p/w500/inception-cover.jpg',
  })
  cover: string;

  @ApiProperty({
    description: 'The genre or genres of the movie',
    example: 'Sci-Fi, Action',
  })
  genre: string;

  @ApiProperty({
    description: 'URL to the trailer of the movie',
    example: 'https://youtube.com/inception-trailer',
  })
  trailerUrl: string;

  @ApiProperty({
    description: 'List of main actors in the movie',
    example: ['Leonardo DiCaprio', 'Joseph Gordon-Levitt'],
  })
  actors: string[];

  @ApiProperty({
    description: 'Movie classification or age rating',
    example: 'PG-13',
  })
  classification: string;

  @ApiProperty({
    description: 'Languages available for subtitles',
    example: 'English, Spanish',
  })
  subtitles: string;
}


export class SearchMoviesResponse {
    @ApiProperty({
      description: 'List of movies that match the search criteria',
      type: [Movie], // Specify that this is an array of `Movie` objects
      example: [
        {
          id: '1',
          title: 'Inception',
          description: 'A mind-bending thriller where dream invasion is possible.',
          releaseDate: '2010-07-16',
          rating: 8.8,
          cover: 'https://image.tmdb.org/t/p/w500/inception-cover.jpg',
          genre: 'Sci-Fi, Action',
          trailerUrl: 'https://youtube.com/inception-trailer',
          actors: ['Leonardo DiCaprio', 'Joseph Gordon-Levitt'],
          classification: 'PG-13',
          subtitles: 'English, Spanish',
        },
      ],
    })
    movies: Movie[];
  
    @ApiProperty({
      description: 'List of additional movies suggested based on actors from the matched movies',
      type: [Movie],
      example: [
        {
          id: '2',
          title: 'The Dark Knight',
          description: 'When the menace known as the Joker emerges from his mysterious past, he wreaks havoc and chaos on the people of Gotham.',
          releaseDate: '2008-07-18',
          rating: 9.0,
          cover: 'https://image.tmdb.org/t/p/w500/dark-knight-cover.jpg',
          genre: 'Action, Crime, Drama',
          trailerUrl: 'https://youtube.com/dark-knight-trailer',
          actors: ['Christian Bale', 'Heath Ledger'],
          classification: 'PG-13',
          subtitles: 'English',
        },
      ],
    })
    actorMovies: Movie[];
  }
  