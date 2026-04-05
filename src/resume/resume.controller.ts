import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  Request,
  Body,
  UseInterceptors,
  UseGuards,
  Get,
} from '@nestjs/common';
import { ResumeService } from './resume.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { ResponseUtil } from 'src/common/utils/response.util';
@Controller('resume')
export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(JwtAuthGuard)
  @Post('/upload')
  async uploadResume(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any, // 接收其他表单字段
    @Request() req: any,
  ) {
    console.log('Received file:', file, body);
    // 处理简历上传逻辑
    if (!file) {
      throw new BadRequestException('请上传文件');
    }
    return this.resumeService.uploadResume(file, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('/resumeList')
  async findResumes(@Request() req: any) {
    const resumes = await this.resumeService.find(req.user.userId);
    return ResponseUtil.success(resumes, '获取简历列表成功');
  }
}
