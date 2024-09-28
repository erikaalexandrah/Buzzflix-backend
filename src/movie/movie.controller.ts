import { Body, Controller, Get, Post, Query, UseGuards, Request, Param } from '@nestjs/common';
import { Movie, SearchMoviesResponse } from './entities/movie.entity';
import { MovieService } from './movie.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth, ApiBody, ApiParam } from '@nestjs/swagger';
import { Genre } from './entities/genre.entity';

@ApiTags('movie')
@Controller('movie')
export class MovieController {
  constructor(private readonly movieService: MovieService) {}

  // GET latest
  @ApiOperation({
    summary: 'Get the latest movies',
    description: 'Returns a list of the latest movies added to the database.',
    operationId: 'getLatestMovies',
    tags: ['Movies'],
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the latest movies.',
    type: Movie, 
    example: [
      {
        id: '1',
        title: 'Inception',
        description: 'A mind-bending thriller where dream invasion is possible.',
        releaseDate: '2010-07-16',
        rating: 8.8,
        cover: 'https://image.tmdb.org/t/p/w500/vpnVM9B6NMmQpWeZvzLvDESb2QY.jpg',
        genre: 'Sci-Fi',
        trailerUrl: 'https://www.youtube.com/watch?v=u69y5Ie519M',
        actors: ['Leonardo DiCaprio', 'Joseph Gordon-Levitt'],
        classification: 'PG-13',
        subtitles: 'English, Spanish',
      },
    ],
  })
  @ApiResponse({
    status: 404,
    description: 'No movies found.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  @Get('latest')
  async getLatestMovies() {
    return await this.movieService.getLatestMovies();
  }

  // GET movies by genre
  @ApiOperation({
    summary: 'Get movies by genre',
    description: 'Fetches a list of movies that belong to a specific genre. The genre is provided as a query parameter.',
  })
  @ApiQuery({
    name: 'genre',
    description: 'The genre of the movies to fetch.',
    required: true,
    enum: Genre,
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the movies by genre.',
    type: Movie,
    isArray: true,
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
  @ApiResponse({ status: 404, description: 'No movies found for the specified genre.' })
  @ApiResponse({ status: 500, description: 'Internal server error.' })

  @Get('by-genre')
  async getMoviesByGenre(@Query('genre') genre: string) {
    return await this.movieService.getMoviesByGenre(genre);
  }

 // GET Search movies by name
  @ApiOperation({
    summary: 'Search movies by name',
    description: 'Fetches a list of movies that match the search term and suggests additional movies featuring actors from the matched movies.',
  })
  @ApiQuery({
    name: 'name',
    description: 'The name or partial name of the movie to search for.',
    required: true,
    example: 'Inception'
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the movies by name and suggestions.',
    type: SearchMoviesResponse,
    example: {
      movies: [
        {
          id: '1',
          title: 'Inception',
          description: 'A mind-bending thriller where dream invasion is possible.',
          releaseDate: '2010-07-16',
          rating: 8.8,
          cover: 'https://image.tmdb.org/t/p/w500/inception-cover.jpg',
          genre: ['Sci-Fi', 'Action'],
          trailerUrl: 'https://youtube.com/inception-trailer',
          actors: ['Leonardo DiCaprio', 'Joseph Gordon-Levitt'],
          classification: 'PG-13',
          subtitles: ['English', 'Spanish'],
        },
      ],
      actorMovies: [
        {
          id: '2',
          title: 'The Dark Knight',
          description: 'When the menace known as the Joker emerges from his mysterious past, he wreaks havoc and chaos on the people of Gotham.',
          releaseDate: '2008-07-18',
          rating: 9.0,
          cover: 'https://image.tmdb.org/t/p/w500/dark-knight-cover.jpg',
          genre: ['Action', 'Crime', 'Drama'],
          trailerUrl: 'https://youtube.com/dark-knight-trailer',
          actors: ['Christian Bale', 'Heath Ledger'],
          classification: 'PG-13',
          subtitles: ['English'],
        },
      ]
    },
  })
  @ApiResponse({ status: 404, description: 'No movies found with the specified name.' })
  @ApiResponse({ status: 500, description: 'Internal server error.' })

  @Get('search')
  async searchMovies(@Query('name') name: string) {
    return await this.movieService.searchMoviesByName(name);
  }

  // POST favorite
  @ApiBearerAuth()  
  @ApiOperation({
    summary: 'Add movie to favorites',
    description: 'Allows authenticated users to add a movie to their list of favorites by providing the movie ID.',
  })
  @ApiBody({
    description: 'The ID of the movie to be added to favorites',
    required: true,
    schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          example: '123',
          description: 'The ID of the movie to add to favorites',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Movie successfully added to favorites.',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Movie added to favorites',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Movie or User not found.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Authentication token is missing or invalid.',
  })

  @UseGuards(AuthGuard('jwt'))
  @Post('favorite')
  async addMovieToFavorites(@Request() req, @Body('id') id: string) {
    const username = req.user.username; 
    return await this.movieService.addMovieToFavorites(username, id);
  }
  
  // POST unfavorite
  @ApiBearerAuth()  
  @ApiOperation({
    summary: 'Remove movie from favorites',
    description: 'Allows authenticated users to remove a movie from their list of favorites by providing the movie ID.',
  })
  @ApiBody({
    description: 'The ID of the movie to be removed from favorites',
    required: true,
    schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          example: '123',
          description: 'The ID of the movie to remove from favorites',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Movie successfully removed from favorites.',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Movie removed from favorites',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Authentication token is missing or invalid.',
  })
  @ApiResponse({
    status: 404,
    description: 'Movie or User not found.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })

  @UseGuards(AuthGuard('jwt'))
  @Post('unfavorite')
  async removeMovieFromFavorites(@Request() req, @Body('id') id: string) {
    const username = req.user.username; 
    return await this.movieService.removeMovieFromFavorites(username, id);
  }

  // GET check-favorite/:movieId
  @ApiBearerAuth()  
  @ApiOperation({
    summary: 'Check if movie is a favorite',
    description: 'Allows authenticated users to check if a specific movie is in their list of favorites by providing the movie ID.',
  })
  @ApiParam({
    name: 'movieId',
    description: 'The ID of the movie to check if it is a favorite',
    required: true,
    example: '123'
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully checked if the movie is a favorite.',
    schema: {
      type: 'object',
      properties: {
        isFavorite: {
          type: 'boolean',
          example: true,
          description: 'Indicates if the movie is in the user\'s list of favorites',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Authentication token is missing or invalid.',
  })
  @ApiResponse({
    status: 404,
    description: 'User or Movie not found.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })

  @UseGuards(AuthGuard('jwt'))
  @Get('check-favorite/:movieId')
  async checkIfFavorite(@Request() req, @Param('movieId') movieId: string) {
    const username = req.user.username;
    const isFavorite = await this.movieService.isMovieFavorite(username, movieId);
    return { isFavorite };
  }

  // GET favorites
  @ApiBearerAuth()  
  @ApiOperation({
    summary: 'Get user favorite movies',
    description: 'Allows authenticated users to retrieve their list of favorite movies.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the list of favorite movies.',
    isArray: true,
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '123' },
          title: { type: 'string', example: 'Inception' },
          description: { type: 'string', example: 'A mind-bending thriller where dream invasion is possible.' },
          releaseDate: { type: 'string', example: '2010-07-16' },
          rating: { type: 'number', example: 8.8 },
          cover: { type: 'string', example: 'https://image.tmdb.org/t/p/w500/inception-cover.jpg' },
          genre: { type: 'string', example: 'Sci-Fi, Action' },
          trailerUrl: { type: 'string', example: 'https://youtube.com/inception-trailer' },
          actors: {
            type: 'array',
            items: { type: 'string', example: 'Leonardo DiCaprio' },
          },
          classification: { type: 'string', example: 'PG-13' },
          subtitles: { type: 'string', example: 'English, Spanish' },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Authentication token is missing or invalid.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })

  @UseGuards(AuthGuard('jwt'))
  @Get('favorites')
  async getUserFavorites(@Request() req) {
    const username = req.user.username;
    return await this.movieService.getUserFavorites(username);
  }  
}
