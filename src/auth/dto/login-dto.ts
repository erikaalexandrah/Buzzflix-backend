import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description: 'The email address of the user.',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: 'Username must be a valid email address' })
  username: string;

  @ApiProperty({
    description: 'The password for the user.',
    example: 'P@ssw0rd',
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password: string;
}
