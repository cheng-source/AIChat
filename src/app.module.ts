import { MetricsModule } from './common/metrics/metrics.module';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { InterviewModule } from './interview/interview.module';
import { PaymentModule } from './payment/payment.module';
import { WechatModule } from './wechat/wechat.module';
import { StsModule } from './sts/sts.module';
import { UserModule } from './user/user.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './auth/jwt.strategy';
import { AIModule } from './ai/ai.module';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsInterceptor } from './common/interceptor/metrics.interceptor';

@Module({
  imports: [
    MetricsModule,
    WinstonModule.forRoot({
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.ms(),
        winston.format.json(),
      ),
      defaultMeta: {
        service: 'aichat-server',
      },
      transports: [new winston.transports.Console()],
    }),
    ConfigModule.forRoot({
      envFilePath: `.env.development`,
      isGlobal: true,
    }),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        return {
          secret: configService.get<string>('JWT_SECRET'),
          signOptions: {
            expiresIn: '7d',
          },
        };
      },
      inject: [ConfigService],
      global: true,
    }),
    MongooseModule.forRoot('mongodb://localhost:27017/aichat'),
    InterviewModule,
    PaymentModule,
    WechatModule,
    StsModule,
    UserModule,
    AIModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    JwtStrategy,
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
})
export class AppModule {}
