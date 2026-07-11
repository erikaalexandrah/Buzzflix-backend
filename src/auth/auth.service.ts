import { Injectable, UnauthorizedException, BadRequestException, OnApplicationBootstrap } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import * as bcrypt from 'bcryptjs';
import { LoginDto } from './dto/login-dto';
import { CreateUserDto } from './dto/create-user-dto';
import { Session } from 'neo4j-driver';

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // Al arrancar, garantiza que exista la cuenta admin definida por
  // ADMIN_EMAIL / ADMIN_PASSWORD. El registro público nunca crea admins.
  async onApplicationBootstrap() {
    const email = this.configService.get<string>('admin.email');
    const password = this.configService.get<string>('admin.password');
    if (!email || !password) {
      return;
    }

    const session: Session = await this.databaseService.getSession();
    try {
      const existing = await session.run(
        'MATCH (u:User {username: $email}) RETURN u',
        { email },
      );
      const hashedPassword = await bcrypt.hash(password, 10);

      if (existing.records.length > 0) {
        await session.run(
          'MATCH (u:User {username: $email}) SET u.role = $role, u.password = $hashedPassword',
          { email, role: 'admin', hashedPassword },
        );
        console.log(`Admin user ensured (updated): ${email}`);
      } else {
        await session.run(
          'CREATE (u:User {username: $email, password: $hashedPassword, role: $role})',
          { email, hashedPassword, role: 'admin' },
        );
        console.log(`Admin user ensured (created): ${email}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Could not ensure admin user on startup:', message);
    } finally {
      await session.close();
    }
  }

  async validateUserWithPassword(username: string, password: string): Promise<any> {
    const session: Session = await this.databaseService.getSession();
    const result = await session.run(
      'MATCH (u:User {username: $username}) RETURN u',
      { username },
    );
    await session.close();

    if (result.records.length === 0) {
      return null;
    }

    const user = result.records[0].get('u').properties;

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (isPasswordValid) {
      return user;
    }
    return null;
  }

  async validateUserByUsername(username: string): Promise<any> {
    const session: Session = await this.databaseService.getSession();
    const result = await session.run(
      'MATCH (u:User {username: $username}) RETURN u',
      { username },
    );
    await session.close();

    if (result.records.length === 0) {
      return null;
    }

    return result.records[0].get('u').properties;
  }

  async register(createUserDto: CreateUserDto) {
    const { username, password, favoriteGenre, age, country } = createUserDto;
  
    const session: Session = await this.databaseService.getSession();
  
    // Validar que el género favorito existe en la BD
    const genreResult = await session.run(
      'MATCH (g:Genre {name: $favoriteGenre}) RETURN g',
      { favoriteGenre }
    );
    if (genreResult.records.length === 0) {
      await session.close();
      throw new BadRequestException('El género de película no es válido');
    }
  
    // Validar que el país existe en la BD
    const countryResult = await session.run(
      'MATCH (c:Country {name: $country}) RETURN c',
      { country }
    );
    if (countryResult.records.length === 0) {
      await session.close();
      throw new BadRequestException('El país no es válido');
    }
  
    // Verificar si el usuario ya existe
    const existingUserResult = await session.run(
      'MATCH (u:User {username: $username}) RETURN u',
      { username }
    );
    if (existingUserResult.records.length > 0) {
      await session.close();
      throw new BadRequestException('Username already exists');
    }
  
    // Crear el usuario
    // El registro público SIEMPRE crea usuarios "normal". El rol admin solo
    // se otorga mediante el bootstrap del servidor (ADMIN_EMAIL/ADMIN_PASSWORD),
    // nunca a través de este endpoint, aunque el body traiga role.
    const hashedPassword = await bcrypt.hash(password, 10);
    const userResult = await session.run(
      `
      CREATE (u:User {username: $username, password: $hashedPassword, age: $age, role: 'normal'})
      WITH u
      MATCH (g:Genre {name: $favoriteGenre}), (c:Country {name: $country})
      CREATE (u)-[:LIKES]->(g), (u)-[:LIVES_IN]->(c)
      RETURN u
      `,
      { username, hashedPassword, favoriteGenre, age, country }
    );

    const user = userResult.records[0].get('u').properties;

    // Generar el JWT
    const payload = { username: user.username, sub: user.id, role: user.role };
    const access_token = this.jwtService.sign(payload);  
    await session.close();
  
    return {
      ...user,
      access_token,
    };
  }
  
  async login(loginDto: LoginDto) {
    const { username, password } = loginDto;
    const user = await this.validateUserWithPassword(username, password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { username: user.username, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
