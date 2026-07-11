import { Module } from '@nestjs/common';
import { ImportService } from './import.service'; 
import { ImportCron } from './import.cron'; 
import { TmdbModule } from 'src/tmdb/tmdb.module';
import { HttpModule } from '@nestjs/axios';
import { DatabaseModule } from 'src/database/database.module';
import { MovieImportController } from './import.controller';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [TmdbModule, HttpModule, DatabaseModule, AuthModule],
  controllers: [MovieImportController],
  providers: [ImportService, ImportCron],
  exports: [ImportService],
}) 
export class ImportModule {}
