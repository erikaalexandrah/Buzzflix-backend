import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TmdbModule } from './tmdb/tmdb.module';
import { ConfigModule } from '@nestjs/config';
import { EnvConfiguration } from './config/env.configuration';
import { ImportModule } from './import/import.module';
import { DatabaseModule } from './database/database.module';
import { MovieModule } from './movie/movie.module';
import { AuthModule } from './auth/auth.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      load: [EnvConfiguration],
      isGlobal: true,
    }),
    TmdbModule,
    ImportModule,
    DatabaseModule,
    MovieModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
