import { IsString, IsInt, Min, Max, IsEmail, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    description: 'The email address of the user, which will be used as the username.',
    example: 'user@example.com',
  })
  @IsEmail()
  username: string;

  @ApiProperty({
    description: 'The password for the user. It must be at least 6 characters long, include at least one uppercase letter, and at least one number.',
    example: 'P@ssw0rd',
  })
  @IsString()
  @Matches(/^(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{6,}$/, {
    message: 'Password must be at least 6 characters long, include at least one uppercase letter, and at least one number',
  })
  password: string;

  @ApiProperty({
    description: 'The favorite genre of the user, typically selected from a predefined list of genres.',
    example: 'Action',
  })
  @IsString()
  favoriteGenre: string;

  @ApiProperty({
    description: 'The age of the user. Must be an integer between 5 and 100.',
    example: 25,
  })
  @IsInt({ message: 'Age must be an integer' })
  @Min(5, { message: 'Age must be at least 5' })
  @Max(100, { message: 'Age must be at most 100' })
  age: number;

  @ApiProperty({
    description: 'The country of residence of the user.',
    example: 'United States',
  })
  @IsString()
  country: string;
}
