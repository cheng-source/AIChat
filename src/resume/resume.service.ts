/*
https://docs.nestjs.com/providers#services
*/

import { Injectable } from '@nestjs/common';
import { MinioService } from './minio.service';
import { v4 as uuidv4 } from 'uuid';
import { Model } from 'mongoose';
import { Resume } from './schemas/resume.schemas';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class ResumeService {
  constructor(
    private minioService: MinioService,
    @InjectModel(Resume.name) private resumeModel: Model<Resume>,
  ) {}

  async uploadResume(file: Express.Multer.File, userId: string) {
    const bucketName = 'resume-bucket';
    const originalname = Buffer.from(file.originalname, 'latin1').toString(
      'utf8',
    );
    const objectName = `${uuidv4()}-${originalname}`;

    // 1️⃣ 上传 MinIO
    await this.minioService.putObject(
      bucketName,
      objectName,
      file.buffer,
      file.size,
      {
        'Content-Type': file.mimetype,
      },
    );

    const fileUrl = `http://localhost:9000/${bucketName}/${objectName}`;

    // 3️⃣ 存数据库（伪代码）
    const resume = {
      userId,
      fileName: originalname,
      objectName: objectName,
      fileUrl,
      fileSize: file.size,
      fileType: file.mimetype,
      createdAt: new Date(),
    };
    const newResume = new this.resumeModel(resume);
    await newResume.save();
    return {
      message: '上传成功',
      data: resume,
    };
  }

  async find(userId: string) {
    const list = await this.resumeModel.find({ userId });
    const result = list.map((item) => {
      const previewUrl = `http://localhost:9000/resume-bucket/${item.objectName}`;
      return {
        id: item._id,
        fileName: item.fileName,
        fileSize: item.fileSize,
        fileType: item.fileType,
        createdAt: item.createdAt,
        previewUrl,
        ObjectName: item.objectName,
      };
    });
    console.log('简历列表：', result);
    return result;
  }
}
