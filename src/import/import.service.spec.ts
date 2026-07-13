import { ImportService } from './import.service';
import neo4j from 'neo4j-driver';

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
    expect(neo4j.isInt(run.mock.calls[0][1].batchSize)).toBe(true);
    expect(run.mock.calls[0][1].batchSize.toNumber()).toBe(100);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it.each([
    [50, 50],
    [50.9, 50],
    [0.9, 1],
    [0, 50],
    [Number.NaN, 50],
    ['invalid' as any, 50],
    [101, 100],
  ])('sends batchSize %p to LIMIT as Neo4j Integer %p', async (input, expected) => {
    const close = jest.fn().mockResolvedValue(undefined);
    const run = jest
      .fn()
      .mockResolvedValueOnce({ records: [] })
      .mockResolvedValueOnce({
        records: [
          {
            get: (key: string) =>
              ({ total: 0, completed: 0, remaining: 0 })[key],
          },
        ],
      });
    const service = new ImportService({} as any, {
      getSession: jest.fn().mockResolvedValue({ run, close }),
    } as any);

    await service.backfillVoteCounts(input as number);

    const limitParameter = run.mock.calls[0][1].batchSize;
    expect(neo4j.isInt(limitParameter)).toBe(true);
    expect(limitParameter.toNumber()).toBe(expected);
  });

  it('processes consecutive batches with an Integer LIMIT each time', async () => {
    const createSession = (id: number, completed: number, remaining: number) => {
      const close = jest.fn().mockResolvedValue(undefined);
      const run = jest
        .fn()
        .mockResolvedValueOnce({ records: [{ get: () => id }] })
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({
          records: [
            {
              get: (key: string) =>
                ({ total: 2, completed, remaining })[key],
            },
          ],
        });
      return { run, close };
    };
    const firstSession = createSession(1, 1, 1);
    const secondSession = createSession(2, 2, 0);
    const getSession = jest
      .fn()
      .mockResolvedValueOnce(firstSession)
      .mockResolvedValueOnce(secondSession);
    const tmdbService = {
      getMovieDetails: jest.fn().mockResolvedValue({
        vote_count: 100,
        vote_average: 7,
        popularity: 50,
      }),
    };
    const service = new ImportService(tmdbService as any, {
      getSession,
    } as any);

    const first = await service.backfillVoteCounts(50);
    const second = await service.backfillVoteCounts(50);

    expect(first).toEqual(expect.objectContaining({ remaining: 1, complete: false }));
    expect(second).toEqual(expect.objectContaining({ remaining: 0, complete: true }));
    for (const session of [firstSession, secondSession]) {
      const parameter = session.run.mock.calls[0][1].batchSize;
      expect(neo4j.isInt(parameter)).toBe(true);
      expect(parameter.toNumber()).toBe(50);
      expect(session.close).toHaveBeenCalledTimes(1);
    }
  });
});
