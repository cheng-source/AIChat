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
@Module({
  imports: [
    JwtModule.register({
      secret: 'secret-key',
      signOptions: {expiresIn: '24h'}
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
