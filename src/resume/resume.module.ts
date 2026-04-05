import { ResumeService } from './resume.service';
import { ResumeController } from './resume.controller';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Resume, ResumeSchema } from './schemas/resume.schemas';
import { MinioService } from './minio.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Resume.name, schema: ResumeSchema }]),
  ],
  controllers: [ResumeController],
  providers: [ResumeService, MinioService],
})
export class ResumeModule {}
