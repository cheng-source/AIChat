import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as pdf from 'pdf-parse';
import * as mammoth from 'mammoth';
import { MinioService } from '../../resume/minio.service';
@Injectable()
export class DocumentParseService {
  private readonly logger = new Logger(DocumentParseService.name);
  constructor(private minioService: MinioService) {}
  private readonly SUPPORTED_TYPES = {
    PDF: ['.pdf'],
    DOCX: ['.docx', 'doc'],
  };

  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024;

  /**
   *预估Token数量(粗略估算)
   *中文:约 1.5-2字符= 1 token
   *英文:约4字符=1token
   **/
  estimateTokens(text: string): number {
    if (!text) {
      return 0;
    }
    // 统计中文字符数
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    //统计英文单词数(粗略)
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    //其他字符
    const otherChars = text.length - chineseChars;
    //预估token
    const chineseTokens = chineseChars / 1.5; // 中文字符
    const englishTokens = englishWords; // 英文单词
    const otherTokens = otherChars / 4; // 其他字符
    return Math.ceil(chineseTokens + englishTokens + otherTokens);
  }

  validateResumeContent(text: string): {
    isValid: boolean;
    reason?: string;
    warning?: string[];
  } {
    const warning: string[] = [];
    if (text.length < 100) {
      return {
        isValid: false,
        reason: '简历内容过短（少于100字符）',
      };
    }

    const resumeKeyWords = [
      '姓名',
      '性别',
      '年龄',
      '手机',
      '电话',
      '邮箱',
      'email',
      '微信',
      //教育经历
      '教育',
      '学历',
      '毕业',
      '大学',
      '学院',
      '专业',
      //工作经历
      '工作',
      '经验',
      '项目',
      '公司',
      '职位',
      '岗位',
      //技能
      '技能',
      '能力',
      '掌握',
      '熟悉',
      '精通',
    ];

    const foundKeyWords = resumeKeyWords.filter((keyword) => {
      text.includes(keyword);
    });

    if (foundKeyWords.length < 3) {
      warning.push('简历内容不完整');
    }

    const lines = text.split('\n').filter((line) => line.trim().length > 0);

    if (lines.length < 5) {
      warning.push('格式可能有问题，内容行数过少');
    }

    return {
      isValid: true,
      warning: warning.length > 0 ? warning : undefined,
    };
  }

  async parseDocumentFromMinio(objectName: string): Promise<string> {
    try {
      this.logger.log(`开始解析Minio文档: ${objectName}`);

      const stream = await this.minioService.getFileStream(
        'resume-bucket',
        objectName,
      );
      const chunks: Buffer[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);

      const fileType = this.getFileType(objectName);
      let text: string;

      switch (fileType) {
        case 'PDF':
          text = await this.parsePDF(buffer);
          console.log(
            '🚀 ~ DocumentParseService ~ parseDocumentFromUrl ~ text:',
            text,
          );
          break;
        case 'DOCX':
          text = await this.parseDocx(buffer);
          break;

        default:
          throw new BadRequestException(
            `不支持的文件格式。当前仅支持：pdf,docx`,
          );
      }
      return text;
    } catch (error) {
      this.logger.error(`解析Minio文档失败: ${error.message}`, error.stack);
      throw new BadRequestException(`解析Minio文档失败: ${error.message}`);
    }
  }

  async parseDocumentFromUrl(url: string): Promise<string> {
    try {
      this.logger.log(`开始解析文档: ${url}`);

      this.validateUrl(url);

      const buffer = await this.downloadFile(url);

      const fileType = this.getFileType(url);
      let text: string;

      switch (fileType) {
        case 'PDF':
          text = await this.parsePDF(buffer);
          console.log(
            '🚀 ~ DocumentParseService ~ parseDocumentFromUrl ~ text:',
            text,
          );
          break;
        case 'DOCX':
          text = await this.parseDocx(buffer);
          break;

        default:
          throw new BadRequestException(
            `不支持的文件格式。当前仅支持：pdf,docx`,
          );
      }

      this.logger.log(`文档解析成功：长度=${text.length}字符`);
      return text;
    } catch (error) {
      throw error;
    }
  }
  private async parseDocx(buffer: Buffer): Promise<string> {
    try {
      this.logger.log('开始解析docx文件');
      const result = await mammoth.extractRawText({ buffer });

      if (!result.value || result.value.trim().length === 0) {
        throw new BadRequestException(
          'DOCX 文件无法提取内容，请检查是否为空文件',
        );
      }

      if (result.messages && result.messages.length > 0) {
        this.logger.warn(
          `DOCX警告：${result.messages.map((m) => m.message).join(', ')}`,
        );
      }

      this.logger.log(`DOCX解析成功：长度=${result.value.length}`);

      return result.value;
    } catch (error) {
      this.logger.error(`docx解析失败：${error.message}`, error.stack);

      throw new BadRequestException(`DOCX文件解析失败：${error.message}。`);
    }
  }
  private async parsePDF(buffer: Buffer): Promise<string> {
    try {
      this.logger.log('开始解析pdf');
      const data = await pdf.default(buffer);

      if (!data.text || data.text.trim().length === 0) {
        throw new BadRequestException('PDF文件无法提取内容');
      }

      this.logger.log(
        `pdf解析成功，页数=${data.numpages}, 长度=${data.text.length}`,
      );

      return data.text;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.log(`PDF解析失败：${error.message}`, error.stack);

      throw new BadRequestException(`PDF解析失败: ${error.message}`);
    }
  }

  private getFileType(url: string): 'PDF' | 'DOCX' | null {
    const urlLower = url.toLowerCase();

    for (const [type, extension] of Object.entries(this.SUPPORTED_TYPES)) {
      for (const ext of extension) {
        if (urlLower.includes(ext)) {
          return type as 'PDF' | 'DOCX';
        }
      }
    }
    return null;
  }

  private async downloadFile(url: string): Promise<Buffer> {
    try {
      this.logger.log(`开始下载`);

      const stream = await this.minioService.getFileStream(
        'resume',
        'sunday-resume.pdf',
      );
      const chunks: Buffer[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);

      if (buffer.length > this.MAX_FILE_SIZE) {
        throw new BadRequestException(`文件过大`);
      }

      if (buffer.length === 0) {
        throw new BadRequestException('文件为空');
      }

      this.logger.log(
        `文件下载成功，大小=${(buffer.length / 1024).toFixed(2)}KB`,
      );

      return buffer;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      if (error.code === 'ECONNABORTED') {
        throw new BadRequestException('文件下载超时');
      }
      this.logger.log(`简历下载失败：error=${error.message}`);
      throw error;
    }
  }
  private validateUrl(url: string) {
    if (!url) {
      throw new BadRequestException('URL 不能为空');
    }

    try {
      new URL(url);
    } catch (error) {
      throw new BadRequestException('URL 格式不正确');
    }

    const fileType = this.getFileType(url);

    if (!fileType) {
      throw new BadRequestException(
        `不支持的文件格式。支持的格式：${Object.values(this.SUPPORTED_TYPES).flat().join(', ')}`,
      );
    }
  }

  cleanText(text: string): string {
    if (!text) {
      return '';
    }
    return (
      text
        //1.统一换行符
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n') // 去除文字中间的多余空格
        .replace(/\s+/g, '')
        //2.去除多余的空行(保留最多2个连续换行)
        .replace(/\n{3,}/g, '\n\n')
        //3.去除行首行尾空白
        .split('\n')
        .map((line) => line.trim())
        .join('\n')
        //4.去除特殊的 Unicode 控制字符
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        //5.统一空格(去除多余空格)
        .replace(/ {2,}/g, ' ')
        //6.去除页眉页脚常见标记
        .replace(/第\s*\d+\s*页/g, '')
        .replace(/Page\s+\d+/gi, '')
        //7.整体trim
        .trim()
    );
  }
}
