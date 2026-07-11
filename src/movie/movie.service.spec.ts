import { MovieService } from './movie.service';

const node = (id: number) => ({
  properties: {
    id,
    title: `Movie ${id}`,
    overview: 'Overview',
    release_date: '2026-01-01',
    score: 8,
    cover_image: 'cover.jpg',
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
    run = jest.fn().mockImplementation((_query, { genres, limit }) => {
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
  });

  it('returns a cached response without another Neo4j session/query', async () => {
    const first = await service.getLanding(['Comedy'], 2);
    const second = await service.getLanding(['Comedy'], 2);

    expect(second).toBe(first);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('closes the session and reports a stable error when Neo4j fails', async () => {
    run.mockRejectedValueOnce(new Error('Neo4j unavailable'));

    await expect(service.getLanding(['Comedy'], 2)).rejects.toThrow(
      'Failed to fetch landing movies',
    );
    expect(close).toHaveBeenCalledTimes(1);
  });
});
