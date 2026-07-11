import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import neo4j, { Driver, Session } from "neo4j-driver";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private driver: Driver;
  private isDriverInitialized = false;
  private driverInitializedPromise: Promise<void>;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const uri = this.configService.get<string>("neo4j.uri");
    const username = this.configService.get<string>("neo4j.username");
    const password = this.configService.get<string>("neo4j.password");
    if (!uri || !username || !password) {
      throw new Error(
        "Missing Neo4j configuration. Set NEO4J_URI, NEO4J_USERNAME and NEO4J_PASSWORD.",
      );
    }

    this.driverInitializedPromise = this.initializeDriver(
      uri,
      username,
      password,
    );
    await this.driverInitializedPromise;
  }

  private async initializeDriver(
    uri: string,
    username: string,
    password: string,
  ) {
    try {
      this.driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
      await this.driver.verifyConnectivity();

      const session = this.driver.session();
      try {
        await session.run(
          "CREATE INDEX genre_name IF NOT EXISTS FOR (g:Genre) ON (g.name)",
        );
        await session.run(
          "CREATE INDEX movie_release_date IF NOT EXISTS FOR (m:Movie) ON (m.release_date)",
        );
      } finally {
        await session.close();
      }

      this.isDriverInitialized = true;
      console.log("Connected to Neo4j successfully");
    } catch (error) {
      await this.driver?.close();
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error connecting to Neo4j:", message);
      throw new Error(`Could not establish connection to Neo4j: ${message}`);
    }
  }

  async onModuleDestroy() {
    await this.driver?.close();
  }

  async getSession(): Promise<Session> {
    await this.driverInitializedPromise;

    if (!this.isDriverInitialized) {
      throw new Error("Neo4j driver not initialized");
    }

    return this.driver.session();
  }
}
