import { PartialType } from '@nestjs/mapped-types';
import { CreateTmdbDto } from './create-tmdb.dto';

export class UpdateTmbdDto extends PartialType(CreateTmdbDto) {}
