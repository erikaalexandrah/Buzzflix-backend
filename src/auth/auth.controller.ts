import { Controller, Post, Body, BadRequestException, Get, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-user-dto';
import { LoginDto } from './dto/login-dto';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('auth')  // Categoriza los endpoints bajo la etiqueta "auth"
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({
    summary: 'User login',
    description: 'Allows a user to log in with their username (email) and password, returning a JWT token.',
  })
  @ApiBody({
    description: 'User login credentials',
    type: LoginDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful, JWT token returned.',
    schema: {
      type: 'object',
      properties: {
        access_token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @ApiOperation({
    summary: 'User registration',
    description: 'Registers a new user with the provided details, returning the created user and a JWT token.',
  })
  @ApiBody({
    description: 'User registration details. The password for the user. It must be at least 6 characters long, include at least one uppercase letter, and at least one number.',
    type: CreateUserDto,
  })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully.',
    schema: {
      type: 'object',
      properties: {
        username: { type: 'string', example: 'user@example.com' },
        age: { type: 'number', example: 25 },
        access_token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad Request - Invalid genre or country, or username already exists.' })
  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @ApiBearerAuth() 
  @ApiOperation({
    summary: 'Get user profile',
    description: 'Returns the profile of the currently authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile returned successfully.',
    schema: {
      type: 'object',
      properties: {
        username: { type: 'string', example: 'user@example.com' },
        age: { type: 'number', example: 25 },
        favoriteGenre: { type: 'string', example: 'Action' },
        country: { type: 'string', example: 'United States' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token.' })
  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  getProfile(@Request() req) {
    return req.user;
  }
}
