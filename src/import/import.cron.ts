import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import { ImportService } from "./import.service";

@Injectable()
export class ImportCron implements OnApplicationBootstrap {
  constructor(
    private readonly movieImportService: ImportService,
    private readonly configService: ConfigService,
  ) {}

  // Al arrancar: si la BD está vacía, sembrarla desde TMDB (en segundo plano
  // para no bloquear el arranque del servidor).
  async onApplicationBootstrap() {
    const seedEnabled = this.configService.get<boolean>(
      "import.seedOnEmpty",
      true,
    );
    if (!seedEnabled) {
      return;
    }

    try {
      const isEmpty = await this.movieImportService.isDatabaseEmpty();
      if (!isEmpty) {
        console.log("Database already has movies; skipping initial seed");
        return;
      }

      console.log("Database is empty; starting initial seed in background...");
      void this.movieImportService
        .seedInitialData()
        .catch((error) => console.error("Initial seed failed:", error));
    } catch (error) {
      console.error("Could not check/seed database on startup:", error);
    }
  }

  @Cron("0 0 * * *") // Run every day at midnight
  async refreshNewestMovies() {
    const pagesToRefresh = this.configService.get<number>(
      "import.recentMoviesRefreshPages",
      2,
    );

    console.log(
      `Cron job running: refreshing ${pagesToRefresh} newest movie pages`,
    );
    await this.movieImportService.refreshRecentMovies(pagesToRefresh);
  }

  @Cron("0 */6 * * *") // Run every 6 hours
  async backfillOlderMovies() {
    const pagesPerRun = this.configService.get<number>(
      "import.recentMoviesBackfillPagesPerRun",
      5,
    );

    console.log(
      `Cron job running: backfilling ${pagesPerRun} older movie pages`,
    );
    await this.movieImportService.importRecentMoviesBackfillBatch(pagesPerRun);
  }
}
