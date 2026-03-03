import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuid } from 'uuid';

export const traceIdStorage = new AsyncLocalStorage<string>();

@Injectable()
export class TraceMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TraceMiddleware.name);

  use(req: any, res: any, next: (error?: any) => void) {
    const traceId = (req.headers['x-trace-id'] as string) || uuid();

    traceIdStorage.run(traceId, () => {
      res.setHeader('x-trace-id', traceId);

      this.logger.log(`[${traceId}] 请求开始: ${req.method} ${req.url}`);

      res.on('finish', () => {
        this.logger.log(
          `[${traceId}] 请求结束: ${req.method} ${req.url}-状态码：${res.statusCode}`,
        );
      });
    });

    next();
  }
}
