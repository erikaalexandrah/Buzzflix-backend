import { MovieService } from './movie.service';

const node = (id: number) => ({
  properties: {
    id,
    title: `Movie ${id}`,
    overview: 'Overview',
    release_date: '2026-01-01',
    score: 8,
    vote_count: 100,
    popularity: 50,
    cover_image: `https://image.tmdb.org/t/p/w500/poster-${id}.jpg`,
    trailer_url: '',
    cast: [],
    age_rating: 'PG',
    subtitles: [],
  },
});

describe('MovieService.getLanding', () => {
  let run: jest.Mock;
  let close: jest.Mock;
  let service: MovieService;

  beforeEach(() => {
    close = jest.fn().mockResolvedValue(undefined);
    run = jest.fn().mockImplementation((query: string, params: any) => {
      // Query de sugerencias "Porque te gustó X": por defecto sin favoritos.
      if (query.includes('seedTitle')) {
        return Promise.resolve({ records: [] });
      }
      // Query colaborativa: por defecto sin coincidencias.
      if (query.includes('overlap')) {
        return Promise.resolve({
          records: [{ get: () => [] }],
        });
      }

      // Query base del landing (latest + genreGroups).
      const { genres, limit } = params;
      const numericLimit =
        typeof limit?.toNumber === 'function' ? limit.toNumber() : limit;
      const groups = genres.map((name: string, index: number) => ({
        name,
        movies:
          name === 'Empty'
            ? []
            : Array.from(
                { length: Math.min(numericLimit, 3) },
                (_, movieIndex) => ({
                movie: node(index * 10 + movieIndex),
                genres: [name],
                }),
              ),
      }));
      return Promise.resolve({
        records: [
          {
            get: (key: string) =>
              key === 'latest'
                ? [{ movie: node(999), genres: ['Drama'] }]
                : groups,
          },
        ],
      });
    });
    const databaseService = {
      getSession: jest.fn().mockResolvedValue({ run, close }),
    };
    service = new MovieService({} as any, databaseService as any);
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('preserves genre order, limits each rail and includes empty genres', async () => {
    const response = await service.getLanding(['Crime', 'Empty', 'Comedy'], 2);

    expect(response.genres.map(({ name }) => name)).toEqual([
      'Crime',
      'Empty',
      'Comedy',
    ]);
    expect(response.genres[0].movies).toHaveLength(2);
    expect(response.genres[1].movies).toEqual([]);
    expect(response.genres[2].movies).toHaveLength(2);
    expect(run).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toContain('coalesce(m.vote_count, 0) >= 50');
    expect(run.mock.calls[0][1].today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(response.latest[0].voteCount).toBe(100);
  });

  it('deduplicates globally: latest wins and each movie stays in one rail', async () => {
    // latest = 5; Crime candidates = [5,6,7]; Comedy candidates = [6,8,9]
    run.mockImplementationOnce((_query, { genres }) =>
      Promise.resolve({
        records: [
          {
            get: (key: string) => {
              if (key === 'latest') return [{ movie: node(5), genres: ['Drama'] }];
              return genres.map((name: string) => ({
                name,
                movies:
                  name === 'Crime'
                    ? [5, 6, 7].map((id) => ({ movie: node(id), genres: [name] }))
                    : [6, 8, 9].map((id) => ({ movie: node(id), genres: [name] })),
              }));
            },
          },
        ],
      }),
    );

    const response = await service.getLanding(['Crime', 'Comedy'], 3);

    const ids = [
      ...response.latest.map((m) => m.id),
      ...response.genres.flatMap((g) => g.movies.map((m) => m.id)),
    ];
    // no repeats anywhere in the landing
    expect(new Set(ids).size).toBe(ids.length);
    expect(response.latest.map((m) => m.id)).toEqual([5]);
    // 5 removed (in latest); Crime keeps 6,7
    expect(response.genres[0].movies.map((m) => m.id)).toEqual([6, 7]);
    // 6 already taken by Crime; Comedy keeps 8,9
    expect(response.genres[1].movies.map((m) => m.id)).toEqual([8, 9]);
  });

  it('serves lighter w185 covers in the landing', async () => {
    const response = await service.getLanding(['Crime'], 1);

    expect(response.latest[0].cover).toContain('/w185/');
    expect(response.latest[0].cover).not.toContain('/w500/');
    expect(response.genres[0].movies[0].cover).toContain('/w185/');
  });

  it('adds no suggestion rails when the user has no favorites', async () => {
    const response = await service.getLanding(['Crime', 'Comedy'], 3, 'kevin');

    expect(response.genres.every((rail) => rail.type === 'genre')).toBe(true);
    expect(response.genres.map((rail) => rail.name)).toEqual(['Crime', 'Comedy']);
  });

  it('interleaves deduplicated suggestion rails for a user with favorites', async () => {
    run.mockImplementation((query: string, params: any) => {
      if (query.includes('seedTitle')) {
        return Promise.resolve({
          records: [
            {
              get: (key: string) =>
                key === 'seedTitle'
                  ? 'Inception'
                  : [1, 50, 51].map((id) => ({ movie: node(id), genres: ['Sci-Fi'] })),
            },
            {
              get: (key: string) =>
                key === 'seedTitle'
                  ? 'Heat'
                  : [52, 53].map((id) => ({ movie: node(id), genres: ['Crime'] })),
            },
          ],
        });
      }
      if (query.includes('overlap')) {
        return Promise.resolve({
          records: [
            {
              get: () =>
                [50, 60].map((id) => ({ movie: node(id), genres: ['Drama'] })),
            },
          ],
        });
      }
      const { genres, limit } = params;
      const numericLimit =
        typeof limit?.toNumber === 'function' ? limit.toNumber() : limit;
      const groups = genres.map((name: string, index: number) => ({
        name,
        movies: Array.from({ length: Math.min(numericLimit, 3) }, (_, i) => ({
          movie: node(index * 10 + i),
          genres: [name],
        })),
      }));
      return Promise.resolve({
        records: [
          {
            get: (key: string) =>
              key === 'latest' ? [{ movie: node(999), genres: ['Drama'] }] : groups,
          },
        ],
      });
    });

    const response = await service.getLanding(['Crime', 'Comedy'], 3, 'kevin');

    const names = response.genres.map((rail) => rail.name);
    // Un rail de sugerencias se intercala tras cada 2 rails de género.
    expect(names).toEqual([
      'Crime',
      'Comedy',
      'Porque te gustó Inception',
      'Porque te gustó Heat',
      'Otros usuarios también disfrutaron',
    ]);

    const suggestion = response.genres.find(
      (rail) => rail.name === 'Porque te gustó Inception',
    );
    // id 1 pertenece al rail de género "Comedy" (id 11? no) -> dedup global:
    // ids 50,51 son nuevos; el 1 no colisiona aquí, se conserva.
    expect(suggestion?.type).toBe('suggestion');

    // Ninguna película se repite en todo el landing (latest + todos los rails).
    const allIds = [
      ...response.latest.map((m) => m.id),
      ...response.genres.flatMap((rail) => rail.movies.map((m) => m.id)),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);

    // 50 fue tomado por el primer rail de sugerencias, así que el colaborativo
    // solo conserva 60.
    const collaborative = response.genres.find(
      (rail) => rail.name === 'Otros usuarios también disfrutaron',
    );
    expect(collaborative?.movies.map((m) => m.id)).toEqual([60]);
  });

  it('returns a cached response without another Neo4j session/query', async () => {
    const first = await service.getLanding(['Comedy'], 2);
    const second = await service.getLanding(['Comedy'], 2);

    expect(second).toBe(first);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('invalidates the user landing cache after changing favorites', async () => {
    // La query MERGE de favoritos devuelve una película encontrada.
    const originalRun = run.getMockImplementation();
    run.mockImplementation((query: string, params: any) => {
      if (query.includes('MERGE') || query.includes('DELETE r')) {
        return Promise.resolve({ records: [{ get: () => ({}) }] });
      }
      return originalRun(query, params);
    });

    const countBaseQueries = () =>
      run.mock.calls.filter(([q]) => q.includes('genreGroups')).length;

    // Primer landing del usuario: se cachea.
    const first = await service.getLanding(['Comedy'], 2, 'kevin');
    expect(countBaseQueries()).toBe(1);

    // Sin cambios: se sirve desde caché (no hay nueva query base).
    await service.getLanding(['Comedy'], 2, 'kevin');
    expect(countBaseQueries()).toBe(1);

    // Al dar like, se invalida la caché del usuario.
    await service.addMovieToFavorites('kevin', '5');
    const afterLike = await service.getLanding(['Comedy'], 2, 'kevin');
    expect(countBaseQueries()).toBe(2);
    expect(afterLike).not.toBe(first);

    // Quitar de favoritos también invalida.
    await service.removeMovieFromFavorites('kevin', '5');
    await service.getLanding(['Comedy'], 2, 'kevin');
    expect(countBaseQueries()).toBe(3);
  });

  it('closes the session and reports a stable error when Neo4j fails', async () => {
    run.mockRejectedValueOnce(new Error('Neo4j unavailable'));

    await expect(service.getLanding(['Comedy'], 2)).rejects.toThrow(
      'Failed to fetch landing movies',
    );
    expect(close).toHaveBeenCalledTimes(1);
  });
});
