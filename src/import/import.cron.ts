import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ImportService } from './import.service';

@Injectable()
export class ImportCron {
  constructor(private readonly movieImportService: ImportService) {}

  @Cron('0 0 * * 0') // Run every Sunday at midnight
  async handleCron() {
    console.log('Cron job running: Importing latest movies');
    await this.movieImportService.importLatestMovies();
  }
}
