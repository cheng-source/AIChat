import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User, UserSchema } from './schemas/user.schemas';
import { MongooseModule } from '@nestjs/mongoose';
import { ConsumptionRecord, ConsumptionRecordSchema } from 'src/interview/schemas/consumption-record.schema';
import { UserConsumption, UserConsumptionSchema } from './schemas/consumption-record.schema';
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },  
      { name: ConsumptionRecord.name, schema: ConsumptionRecordSchema },
      { name: UserConsumption.name, schema: UserConsumptionSchema },
    ])
    
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService]
})
export class UserModule {}
