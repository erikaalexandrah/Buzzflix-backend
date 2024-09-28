export const EnvConfiguration = () => ({
    port : parseInt(process.env.PORT, 10) || 3000,
    tmdbapi: {
        apiKey: process.env.TMDB_API_KEY,
        baseUrl: process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3',    
    },
    neo4j: {
        uri: process.env.NEO4J_URI,
        username: process.env.NEO4J_USERNAME,
        password: process.env.NEO4J_PASSWORD,
    },
    jwt_secret: process.env.JWT_SECRET,
});

