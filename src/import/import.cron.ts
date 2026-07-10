import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import { ImportService } from "./import.service";

@Injectable()
export class ImportCron {
  constructor(
    private readonly movieImportService: ImportService,
    private readonly configService: ConfigService,
  ) {}

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
