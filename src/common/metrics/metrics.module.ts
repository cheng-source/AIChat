import { Module } from '@nestjs/common';
import { MetricsService } from './metric.service';
import { MetricsController } from './metrics.controller';

@Module({
  providers: [MetricsService],
  controllers: [MetricsController],
  exports: [MetricsService], // ⭐ 让其他地方能注入
})
export class MetricsModule {}
