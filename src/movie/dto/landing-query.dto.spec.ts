import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  LANDING_DEFAULT_LIMIT,
  LandingQueryDto,
} from './landing-query.dto';

describe('LandingQueryDto', () => {
  it('parses comma-separated genres and applies the default limit', async () => {
    const dto = plainToInstance(LandingQueryDto, {
      genres: 'Comedy, Crime,Drama',
    });

    expect(await validate(dto)).toEqual([]);
    expect(dto.genres).toEqual(['Comedy', 'Crime', 'Drama']);
    expect(dto.limit).toBe(LANDING_DEFAULT_LIMIT);
  });

  it.each([0, 51, 1.5, 'invalid'])('rejects invalid limit %p', async (limit) => {
    const dto = plainToInstance(LandingQueryDto, { limit });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
