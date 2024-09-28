import { Module } from '@nestjs/common';
import { ImportService } from './import.service'; 
import { ImportCron } from './import.cron'; 
import { TmdbModule } from 'src/tmdb/tmdb.module';
import { HttpModule } from '@nestjs/axios';
import { DatabaseModule } from 'src/database/database.module';
import { MovieImportController } from './import.controller';

@Module({
  imports: [TmdbModule, HttpModule, DatabaseModule],
  controllers: [MovieImportController],
  providers: [ImportService, ImportCron],
  exports: [ImportService],
}) 
export class ImportModule {}
