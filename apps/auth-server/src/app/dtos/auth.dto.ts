import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  type: 'admin' | 'broker';
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class BrokerLoginDto {
  @IsString()
  @IsNotEmpty()
  brokerCode: string;

  @IsString()
  password?: string;

  @IsString()
  deviceId?: string;

  @IsString()
  googleId?: string;
}
