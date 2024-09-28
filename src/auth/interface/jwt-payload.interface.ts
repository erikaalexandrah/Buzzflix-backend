import { ApiProperty } from '@nestjs/swagger';

export class JwtPayload {
  @ApiProperty({
    description: 'The username associated with the JWT token.',
    example: 'user@example.com',
  })
  username: string;

  @ApiProperty({
    description: 'The subject identifier (usually user ID) associated with the JWT token.',
    example: 123,
  })
  sub: number;
}
