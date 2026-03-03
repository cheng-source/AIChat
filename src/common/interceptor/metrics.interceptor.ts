import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsService } from '../metrics/metric.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private metricsService: MetricsService) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<any>,
  ): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();

    const { method, url } = request;
    const route = this.extractRoute(url);

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;

          const statusCode = ctx.getResponse().statusCode || 200;

          this.metricsService.httpRequestsTotal.inc({
            method,
            route,
            status: statusCode,
          });

          this.metricsService.httpRequestDurationMs.observe(
            { method, route },
            duration,
          );
        },

        error: () => {
          const duration = Date.now() - startTime;

          this.metricsService.httpRequestsTotal.inc({
            method,
            route,
            status: 500,
          });
          this.metricsService.httpRequestDurationMs.observe(
            { method, route },
            duration,
          );
          this.metricsService.errorsTotal.inc({
            type: 'http_error',
            service: 'api',
          });
        },
      }),
    );
  }

  private extractRoute(url: string) {
    return url.split('?')[0].replace(/\/d+/g, '/:id');
  }
}
