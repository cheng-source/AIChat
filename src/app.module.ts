import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {JwtModule} from '@nestjs/jwt'
import { MongooseModule } from '@nestjs/mongoose';
import { InterviewModule } from './interview/interview.module';
import { PaymentModule } from './payment/payment.module';
import { WechatModule } from './wechat/wechat.module';
import { StsModule } from './sts/sts.module';
import { UserModule } from './user/user.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: `.env.development`,
      isGlobal: true,
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        return {
          secret: configService.get<string>('JWT_SECRET'),
          signOptions: {
            expiresIn: '7d',
          }
        }
      },
      inject: [ConfigService],
      global: true,
    }),
    MongooseModule.forRoot('mongodb://localhost:27017/aichat'),
    InterviewModule,
    PaymentModule,
    WechatModule,
    StsModule,
    UserModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
