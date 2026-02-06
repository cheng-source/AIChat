import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AIModule } from 'src/ai/ai.module';
import { InterviewService } from './services/interview.service';
import { ResumeAnalysisService } from './services/resume.analysis.service';
import { ConversationContinueService } from './services/conversation-continue.service';
import { InterviewController } from './interview.controller';

@Module({
    imports:[
        ConfigModule,
        AIModule
    ],
    providers: [
        InterviewService,
        ResumeAnalysisService,
        ConversationContinueService
    ],
    controllers: [InterviewController]
})
export class InterviewModule {}
