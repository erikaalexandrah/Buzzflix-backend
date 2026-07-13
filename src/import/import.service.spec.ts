import { ImportService } from './import.service';

describe('ImportService movie upsert', () => {
  it('persists TMDB vote_count when a movie is created or updated', async () => {
    const run = jest.fn().mockResolvedValue({});
    const service = new ImportService({} as any, {} as any);
    const movie = {
      id: 123,
      title: 'Rated movie',
      release_date: '2026-01-01',
      popularity: 90,
      vote_count: 450,
    };
    const details = {
      vote_average: 8.1,
      vote_count: 500,
      popularity: 95,
      credits: { cast: [], crew: [] },
      videos: { results: [] },
      release_dates: { results: [] },
      spoken_languages: [],
      keywords: { keywords: [] },
    };

    await (service as any).upsertMovie({ run }, movie, details, []);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toContain('m.vote_count = $vote_count');
    expect(run.mock.calls[0][1]).toEqual(
      expect.objectContaining({ score: 8.1, vote_count: 500 }),
    );
  });

  it('falls back to vote_count from discover results', async () => {
    const run = jest.fn().mockResolvedValue({});
    const service = new ImportService({} as any, {} as any);

    await (service as any).upsertMovie(
      { run },
      { id: 123, vote_count: 75 },
      {
        credits: { cast: [], crew: [] },
        videos: { results: [] },
        release_dates: { results: [] },
      },
      [],
    );

    expect(run.mock.calls[0][1].vote_count).toBe(75);
  });
});

describe('ImportService vote-count backfill', () => {
  it('reports status and closes its Neo4j session', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const run = jest.fn().mockResolvedValue({
      records: [
        {
          get: (key: string) => ({ total: 100, completed: 25, remaining: 75 })[
            key
          ],
        },
      ],
    });
    const service = new ImportService({} as any, {
      getSession: jest.fn().mockResolvedValue({ run, close }),
    } as any);

    await expect(service.getVoteCountBackfillStatus()).resolves.toEqual({
      total: 100,
      completed: 25,
      remaining: 75,
      percentage: 25,
      complete: false,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('updates successful movies, keeps failures pending and returns progress', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const candidateRecord = (id: number) => ({ get: () => id });
    const statusRecord = {
      get: (key: string) => ({ total: 3, completed: 2, remaining: 1 })[key],
    };
    const run = jest
      .fn()
      .mockResolvedValueOnce({
        records: [candidateRecord(1), candidateRecord(2), candidateRecord(3)],
      })
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({ records: [statusRecord] });
    const tmdbService = {
      getMovieDetails: jest.fn().mockImplementation((id: number) =>
        id === 2
          ? Promise.reject(new Error('TMDB unavailable'))
          : Promise.resolve({
              vote_count: id * 100,
              vote_average: 7.5,
              popularity: 80,
            }),
      ),
    };
    const service = new ImportService(tmdbService as any, {
      getSession: jest.fn().mockResolvedValue({ run, close }),
    } as any);

    const result = await service.backfillVoteCounts(500);

    expect(result).toEqual(
      expect.objectContaining({
        processed: 3,
        updated: 2,
        failed: 1,
        remaining: 1,
        complete: false,
      }),
    );
    expect(result.failures[0]).toEqual({ id: 2, error: 'TMDB unavailable' });
    expect(run.mock.calls[0][1].batchSize).toBe(100);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
