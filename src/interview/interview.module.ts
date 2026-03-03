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
import { DocumentParseService } from './services/documentParseService';
import { MinioService } from './services/minio.service';
import { InterviewAiService } from './services/interview.ai.service';
import { AiModelFactory } from 'src/ai/services/ai-model.factory';
import { AIInterviewResult, AIInterviewResultSchema } from './schemas/ai-interview-result.schema';

@Module({
    imports:[
        ConfigModule,
        AIModule,
        MongooseModule.forFeature([
          {name: ConsumptionRecord.name, schema: ConsumptionRecordSchema},
          {name: ResumeQuizResult.name, schema: ResumeQuizResultSchema},
          {name: User.name, schema: UserSchema},
          {name: AIInterviewResult.name, schema: AIInterviewResultSchema}
        ])
    ],
    providers: [
        InterviewService,
        ResumeAnalysisService,
        ConversationContinueService,
        DocumentParseService,
        MinioService,
        InterviewAiService,
        AiModelFactory,
    ],
    controllers: [InterviewController]
})
export class InterviewModule {}
