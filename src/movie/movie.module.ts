import { Module } from '@nestjs/common';
import { MovieService } from './movie.service';
import { MovieController } from './movie.controller';
import { TmdbModule } from 'src/tmdb/tmdb.module';
import { HttpModule } from '@nestjs/axios';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  imports: [TmdbModule, HttpModule, DatabaseModule],
  controllers: [MovieController],
  providers: [MovieService],
})
export class MovieModule {}
