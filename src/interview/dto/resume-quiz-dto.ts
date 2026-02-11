import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";

// 简历押题请求dto
export class ResumeQuizDto {

  @ApiProperty({
    description: '公司名称',
    example: '字节跳动',
    required: false
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  company?: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  positionName: string

  @IsNumber()
  @Min(0)
  @Max(9999)
  @IsOptional()
  minSalary?: number

  @IsNumber()
  @Min(0)
  @Max(9999)
  @IsOptional()
  maxSalary?: number

  @IsString()
  @IsNotEmpty()
  @MinLength(50)
  @MaxLength(2000)
  jd: string

  @IsString()
  @IsOptional()
  resumeId?: string

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resumeContent?: string


  @IsUUID('4')
  @IsOptional()
  requestId?: string

  @IsString()
  @IsOptional()
  promptVersion?: string
}