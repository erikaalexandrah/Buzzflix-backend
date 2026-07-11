import { Transform, Type } from "class-transformer";
import { IsArray, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export const LANDING_DEFAULT_LIMIT = 20;
export const LANDING_MAX_LIMIT = 50;

export class LandingQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string"
      ? value
          .split(",")
          .map((genre) => genre.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @IsString({ each: true })
  genres?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LANDING_MAX_LIMIT)
  limit: number = LANDING_DEFAULT_LIMIT;
}
