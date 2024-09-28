import { Controller, Get } from '@nestjs/common';
import { ImportService } from './import.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('import')  // Categoriza los endpoints bajo la etiqueta "import"
@Controller('import')
export class MovieImportController {
  constructor(private readonly movieImportService: ImportService) {}

  @ApiOperation({
    summary: 'Import movies',
    description: 'Initiates the import of movies from TMDB. It can import either popular movies or all movies, depending on the parameter passed to the import service.',
  })
  @ApiResponse({
    status: 200,
    description: 'Movies import initiated successfully.',
    schema: {
      type: 'string',
      example: 'Movies import initiated!',
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Failed to initiate movies import.',
  })
  @Get('movies')
  async importMovies() {
    await this.movieImportService.importMovies(true);
    return 'Movies import initiated!';
  }

  @ApiOperation({
    summary: 'Import genres',
    description: 'Initiates the import of movie genres from TMDB and stores them in the Neo4j database.',
  })
  @ApiResponse({
    status: 200,
    description: 'Genres import initiated successfully.',
    schema: {
      type: 'string',
      example: 'Genres import initiated!',
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Failed to initiate genres import.',
  })
  @Get('genres')
  async importGenres() {
    await this.movieImportService.importGenres();
    return 'Genres import initiated!';
  }

  @ApiOperation({
    summary: 'Import all data',
    description: 'Initiates the import of all data, including genres and movies, from TMDB and stores it in the Neo4j database.',
  })
  @ApiResponse({
    status: 200,
    description: 'All data import initiated successfully.',
    schema: {
      type: 'string',
      example: 'All data import initiated!',
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Failed to initiate all data import.',
  })
  @Get('all')
  async importAll() {
    await this.importGenres();
    await this.importMovies();
    return 'All data import initiated!';
  }

  @ApiOperation({
    summary: 'Import latest movies',
    description: 'Initiates the import of the latest movies currently playing from TMDB and stores them in the Neo4j database.',
  })
  @ApiResponse({
    status: 200,
    description: 'Latest movies import initiated successfully.',
    schema: {
      type: 'string',
      example: 'Latest movies import initiated!',
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Failed to initiate latest movies import.',
  })
  @Get('latest')
  async importLatest() {
    await this.movieImportService.importLatestMovies();
    return 'Latest movies import initiated!';
  }

  @ApiOperation({
    summary: 'Import actors',
    description: 'Initiates the import of actors from all movies available in TMDB and stores their details in the Neo4j database.',
  })
  @ApiResponse({
    status: 200,
    description: 'Actors import initiated successfully.',
    schema: {
      type: 'string',
      example: 'Actors import initiated!',
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Failed to initiate actors import.',
  })
  @Get('actors')
  async importActors() {
    await this.movieImportService.importActors();
    return 'Actors import initiated!';
  }
}
