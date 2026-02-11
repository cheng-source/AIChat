import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AIModule } from 'src/ai/ai.module';
import { InterviewService } from './services/interview.service';
import { ResumeAnalysisService } from './services/resume.analysis.service';
import { ConversationContinueService } from './services/conversation-continue.service';
import { InterviewController } from './interview.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { ConsumptionRecord, ConsumptionRecordSchema } from './schemas/consumption-record.schema';
import { ResumeQuizResult, ResumeQuizResultSchema } from './schemas/interview-quiz-result.schema';
import { User, UserSchema } from 'src/user/schemas/user.schemas';

@Module({
    imports:[
        ConfigModule,
        AIModule,
        MongooseModule.forFeature([
          {name: ConsumptionRecord.name, schema: ConsumptionRecordSchema},
          {name: ResumeQuizResult.name, schema: ResumeQuizResultSchema},
          {name: User.name, schema: UserSchema},
        ])
    ],
    providers: [
        InterviewService,
        ResumeAnalysisService,
        ConversationContinueService
    ],
    controllers: [InterviewController]
})
export class InterviewModule {}
