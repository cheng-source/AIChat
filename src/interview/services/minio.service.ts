import { Injectable } from '@nestjs/common';
import * as Minio from 'minio';
import { Readable } from 'stream';

@Injectable()
export class MinioService {
    private readonly minioClient: Minio.Client;

    constructor() {
        this.minioClient = new Minio.Client({
            endPoint: '192.168.51.2',
            port: 9000,
            useSSL: false,
            accessKey: 'minioadmin',
            secretKey: 'minioadmin',
        })
    }

      /**
   * 从 Minio 获取文件流
   * @param bucketName 存储桶名称
   * @param objectName 对象名称（包含路径，如 'folder/file.pdf'）
   * @returns 文件的可读流
   */
  async getFileStream(bucketName: string, objectName: string): Promise<Readable> {
    try {
      // 检查存储桶是否存在（可选）
      const bucketExists = await this.minioClient.bucketExists(bucketName);
      if (!bucketExists) {
        throw new Error(`Bucket "${bucketName}" does not exist`);
      }

      // 获取对象流
      return await this.minioClient.getObject(bucketName, objectName);
    } catch (error) {
      throw new Error(`Failed to get file from Minio: ${error.message}`);
    }
  }

}