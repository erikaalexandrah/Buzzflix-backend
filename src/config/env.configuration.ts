export const EnvConfiguration = () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  tmdbapi: {
    apiKey: process.env.TMDB_API_KEY,
    baseUrl: process.env.TMDB_BASE_URL || "https://api.themoviedb.org/3",
  },
  neo4j: {
    uri: process.env.NEO4J_URI || "bolt://localhost:7687",
    username: process.env.NEO4J_USERNAME || "neo4j",
    password: process.env.NEO4J_PASSWORD,
  },
  jwt_secret: process.env.JWT_SECRET,
  import: {
    recentMoviesRefreshPages:
      parseInt(process.env.RECENT_MOVIES_REFRESH_PAGES, 10) || 2,
    recentMoviesBackfillPagesPerRun:
      parseInt(process.env.RECENT_MOVIES_BACKFILL_PAGES_PER_RUN, 10) || 5,
  },
});
