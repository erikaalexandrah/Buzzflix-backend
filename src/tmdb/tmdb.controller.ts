import { Controller, Get, Param, Query } from '@nestjs/common';
import { TmdbService } from './tmdb.service';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';

@ApiTags('tmdb')  
@Controller('tmdb')
export class TmdbController {
  constructor(private readonly tmdbService: TmdbService) {}

  //GET Popular movies
  @ApiOperation({
    summary: 'Get popular movies',
    description: 'Fetches a list of the current popular movies from TMDB.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved popular movies.',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          adult: { type: 'boolean', example: false },
          backdrop_path: { type: 'string', example: '/yDHYTfA3R0jFYba16jBB1ef8oIt.jpg' },
          genre_ids: {
            type: 'array',
            items: { type: 'number', example: 28 },
          },
          id: { type: 'number', example: 533535 },
          original_language: { type: 'string', example: 'en' },
          original_title: { type: 'string', example: 'Deadpool & Wolverine' },
          overview: {
            type: 'string',
            example: 'A listless Wade Wilson toils away in civilian life with his days as the morally flexible mercenary, Deadpool, behind him.',
          },
          popularity: { type: 'number', example: 5382.642 },
          poster_path: { type: 'string', example: '/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg' },
          release_date: { type: 'string', format: 'date', example: '2024-07-24' },
          title: { type: 'string', example: 'Deadpool & Wolverine' },
          video: { type: 'boolean', example: false },
          vote_average: { type: 'number', example: 7.756 },
          vote_count: { type: 'number', example: 2240 },
        },
      },
    },
  })
  @ApiResponse({ status: 500, description: 'Failed to fetch popular movies.' })
  @Get('popular')
  async getPopularMovies() {
    return await this.tmdbService.getPopularMovies();
  }

  //GET Search movies by title
  @ApiOperation({
    summary: 'Search movies by title',
    description: 'Searches for movies on TMDB based on a query string.',
  })
  @ApiQuery({
    name: 'query',
    description: 'The query string to search for movies by title.',
    example: 'Inception',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved search results.',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          adult: { type: 'boolean', example: false },
          backdrop_path: { type: 'string', example: '/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg' },
          genre_ids: {
            type: 'array',
            items: { type: 'number', example: 28 },
          },
          id: { type: 'number', example: 27205 },
          original_language: { type: 'string', example: 'en' },
          original_title: { type: 'string', example: 'Inception' },
          overview: {
            type: 'string',
            example: 'Cobb, a skilled thief who commits corporate espionage by infiltrating the subconscious of his targets is offered a chance ',
          },
          popularity: { type: 'number', example: 100.397 },
          poster_path: { type: 'string', example: '/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg' },
          release_date: { type: 'string', format: 'date', example: '2010-07-15' },
          title: { type: 'string', example: 'Inception' },
          video: { type: 'boolean', example: false },
          vote_average: { type: 'number', example: 8.369 },
          vote_count: { type: 'number', example: 36167 },
        },
      },
    },
  })
  @ApiResponse({ status: 500, description: 'Failed to search movies.' })
  @Get('search')
  async searchMovies(@Query('query') query: string) {
    return await this.tmdbService.searchMovies(query);
  }

  //GET Actor details by ID
  @ApiOperation({
    summary: 'Get actor details TO FIX IN CONSTRUCTION DONT USE',
    description: 'Fetches details of an actor by their ID from TMDB.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the actor to fetch details for.',
    example: 1,
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved actor details.',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'number', example: 1 },
        name: { type: 'string', example: 'George Lucas' },
        profilePath: { type: 'string', example: 'https://image.tmdb.org/t/p/w500/WCSZzWdtPmdRxH9LUCVi2JPCSJ.jpg' },
        biography: {
          type: 'string',
          example: 'George Lucas is an American filmmaker known for creating the Star Wars and Indiana Jones franchises.',
        },
        birthDate: { type: 'string', format: 'date', example: '1944-05-14' },
        birthPlace: { type: 'string', example: 'Modesto, California, USA' },
        popularity: { type: 'number', example: 65.335 },
        movieCredits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', example: 'Star Wars: Episode IV - A New Hope' },
              character: { type: 'string', example: 'Director' },
              releaseDate: { type: 'string', format: 'date', example: '1977-05-25' },
              poster: { type: 'string', example: 'https://image.tmdb.org/t/p/w500/poster.jpg' },
            },
          },
        },
        tvCredits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', example: 'The Mandalorian' },
              character: { type: 'string', example: 'Creator' },
              firstAirDate: { type: 'string', format: 'date', example: '2019-11-12' },
              poster: { type: 'string', example: 'https://image.tmdb.org/t/p/w500/tvposter.jpg' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 500, description: 'Failed to fetch actor details.' })
  @Get('actor/:id')
  async getActorDetails(@Param('id') id: number) {
    return await this.tmdbService.getActorDetails(id);
  }

  @ApiOperation({
    summary: 'Get all actors from popular movies',
    description: 'Fetches details of all actors who have appeared in popular movies from TMDB.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved all actors.',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number', example: 123 },
          name: { type: 'string', example: 'Leonardo DiCaprio' },
          biography: { type: 'string', example: 'Leonardo Wilhelm DiCaprio is an American actor and producer.' },
          birthDate: { type: 'string', example: '1974-11-11' },
          popularity: { type: 'number', example: 8.5 },
        },
      },
    },
  })
  @ApiResponse({ status: 500, description: 'Failed to fetch actors.' })
  @Get('actors/all')
  async getAllActors() {
    return await this.tmdbService.getActorsFromAllMovies();
  }
}
