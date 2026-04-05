import { Injectable } from '@nestjs/common';
import * as Minio from 'minio';
import { Readable } from 'stream';

@Injectable()
export class MinioService {
  private readonly minioClient: Minio.Client;

  constructor() {
    this.minioClient = new Minio.Client({
      endPoint: '127.0.0.1',
      port: 9005,
      useSSL: false,
      accessKey: 'admin123',
      secretKey: 'admin123',
    });
  }

  putObject = async (
    bucketName: string,
    objectName: string,
    buffer: Buffer,
    size: number,
    metaData: Record<string, string> = {},
  ) => {
    try {
      // 检查存储桶是否存在，如果不存在则创建
      const bucketExists = await this.minioClient.bucketExists(bucketName);
      if (!bucketExists) {
        await this.minioClient.makeBucket(bucketName);
      }
      // 上传对象
      await this.minioClient.putObject(
        bucketName,
        objectName,
        buffer,
        size,
        metaData,
      );
    } catch (error) {
      throw new Error(`Failed to upload object to Minio: ${error.message}`);
    }
  };

  /**
   * 从 Minio 获取文件流
   * @param bucketName 存储桶名称
   * @param objectName 对象名称（包含路径，如 'folder/file.pdf'）
   * @returns 文件的可读流
   */
  async getFileStream(
    bucketName: string,
    objectName: string,
  ): Promise<Readable> {
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
