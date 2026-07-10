import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
} from "@nestjs/common";
import { ImportService } from "./import.service";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";

@ApiTags("import") // Categoriza los endpoints bajo la etiqueta "import"
@Controller("import")
export class MovieImportController {
  constructor(private readonly movieImportService: ImportService) {}

  @ApiOperation({
    summary: "Import movies",
    description:
      "Initiates the import of movies from TMDB. It can import either popular movies or all movies, depending on the parameter passed to the import service.",
  })
  @ApiResponse({
    status: 200,
    description: "Movies import initiated successfully.",
    schema: {
      type: "string",
      example: "Movies import initiated!",
    },
  })
  @ApiResponse({
    status: 500,
    description: "Failed to initiate movies import.",
  })
  @Get("movies")
  async importMovies() {
    await this.movieImportService.importMovies(true);
    return "Movies import initiated!";
  }

  @ApiOperation({
    summary: "Import genres",
    description:
      "Initiates the import of movie genres from TMDB and stores them in the Neo4j database.",
  })
  @ApiResponse({
    status: 200,
    description: "Genres import initiated successfully.",
    schema: {
      type: "string",
      example: "Genres import initiated!",
    },
  })
  @ApiResponse({
    status: 500,
    description: "Failed to initiate genres import.",
  })
  @Get("genres")
  async importGenres() {
    await this.movieImportService.importGenres();
    return "Genres import initiated!";
  }

  @ApiOperation({
    summary: "Import all data",
    description:
      "Initiates the import of all data, including genres and movies, from TMDB and stores it in the Neo4j database.",
  })
  @ApiResponse({
    status: 200,
    description: "All data import initiated successfully.",
    schema: {
      type: "string",
      example: "All data import initiated!",
    },
  })
  @ApiResponse({
    status: 500,
    description: "Failed to initiate all data import.",
  })
  @Get("all")
  async importAll() {
    await this.importGenres();
    await this.importMovies();
    return "All data import initiated!";
  }

  @ApiOperation({
    summary: "Import latest movies",
    description:
      "Initiates the import of the latest movies currently playing from TMDB and stores them in the Neo4j database.",
  })
  @ApiResponse({
    status: 200,
    description: "Latest movies import initiated successfully.",
    schema: {
      type: "string",
      example: "Latest movies import initiated!",
    },
  })
  @ApiResponse({
    status: 500,
    description: "Failed to initiate latest movies import.",
  })
  @Get("latest")
  async importLatest() {
    await this.movieImportService.importLatestMovies();
    return "Latest movies import initiated!";
  }

  @ApiOperation({
    summary: "Refresh newest movies",
    description:
      "Checks the first TMDB discover pages ordered by release date descending and upserts them in Neo4j without duplicates.",
  })
  @ApiResponse({
    status: 200,
    description: "Newest movies refreshed successfully.",
  })
  @Get("movies/recent/refresh")
  async refreshRecentMovies(
    @Query("pages", new DefaultValuePipe(2), ParseIntPipe) pages: number,
  ) {
    return await this.movieImportService.refreshRecentMovies(pages);
  }

  @ApiOperation({
    summary: "Backfill recent movies incrementally",
    description:
      "Imports movies from TMDB discover ordered by release date descending. Each call continues from the next pending page and moves toward older movies.",
  })
  @ApiResponse({
    status: 200,
    description: "Recent movies backfill batch imported successfully.",
  })
  @Get("movies/recent/backfill")
  async importRecentMoviesBackfill(
    @Query("pages", new DefaultValuePipe(5), ParseIntPipe) pages: number,
  ) {
    return await this.movieImportService.importRecentMoviesBackfillBatch(pages);
  }

  @Get("movies/recent")
  async importRecentMovies(
    @Query("pages", new DefaultValuePipe(5), ParseIntPipe) pages: number,
  ) {
    return await this.movieImportService.importRecentMoviesBackfillBatch(pages);
  }

  @ApiOperation({
    summary: "Get recent movies import status",
    description:
      "Returns the saved page cursor used by the incremental recent movies importer.",
  })
  @ApiResponse({
    status: 200,
    description: "Recent movies import status returned successfully.",
  })
  @Get("movies/recent/status")
  async getRecentMoviesImportStatus() {
    return await this.movieImportService.getRecentMoviesImportStatus();
  }

  @ApiOperation({
    summary: "Reset recent movies import progress",
    description:
      "Resets the incremental recent movies importer so the next run starts from page 1 again.",
  })
  @ApiResponse({
    status: 200,
    description: "Recent movies import progress reset successfully.",
  })
  @Get("movies/recent/reset")
  async resetRecentMoviesImportProgress() {
    return await this.movieImportService.resetRecentMoviesImportProgress();
  }

  @ApiOperation({
    summary: "Import actors",
    description:
      "Initiates the import of actors from all movies available in TMDB and stores their details in the Neo4j database.",
  })
  @ApiResponse({
    status: 200,
    description: "Actors import initiated successfully.",
    schema: {
      type: "string",
      example: "Actors import initiated!",
    },
  })
  @ApiResponse({
    status: 500,
    description: "Failed to initiate actors import.",
  })
  @Get("actors")
  async importActors() {
    await this.movieImportService.importActors();
    return "Actors import initiated!";
  }
}
