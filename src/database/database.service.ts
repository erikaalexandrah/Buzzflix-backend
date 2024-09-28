import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import neo4j, { Driver, Session } from 'neo4j-driver';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private driver: Driver;
  private isDriverInitialized: boolean = false;
  private driverInitializedPromise: Promise<void>;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const uri = this.configService.get<string>('neo4j.uri');
    const username = this.configService.get<string>('neo4j.username');
    const password = this.configService.get<string>('neo4j.password');
    this.driverInitializedPromise = this.initializeDriver(uri, username, password);
  }

  private async initializeDriver(uri: string, username: string, password: string) {
    try {
      this.driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
      console.log('Driver created, testing connection...');

      // Test the connection by running a simple query
      const session = this.driver.session();
      await session.run('RETURN 1'); // Executes a simple query to test the connection
      await session.close();

      this.isDriverInitialized = true;
      console.log('Connected to Neo4j successfully');
    } catch (error) {
      console.error('Error connecting to Neo4j:', error.message);
      throw new Error('Could not establish connection to Neo4j');
    }
  }

  async onModuleDestroy() {
    await this.driver?.close();
  }

  async getSession(): Promise<Session> {
    // Wait for the driver to be initialized before returning a session
    await this.driverInitializedPromise;

    if (!this.isDriverInitialized) {
      throw new Error('Neo4j driver not initialized');
    }

    return this.driver.session();
  }
}
