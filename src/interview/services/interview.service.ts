import { PromptTemplate } from "@langchain/core/prompts";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiModelFactory } from "src/ai/services/ai-model.factory";
import { RESUME_ANALYSIS_SYSTEM_MESSAGE, RESUME_QUIZ_PROMPT2 } from "../resume.quiz.prompts";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import { SessionManager } from "src/ai/services/session.manager";
import { ResumeAnalysisService } from "./resume.analysis.service";
import { ConversationContinueService } from "./conversation-continue.service";


@Injectable()
export class InterviewService {
    private readonly logger = new Logger(InterviewService.name);
    constructor(
        private configService: ConfigService, 
        private aiModelFactory: AiModelFactory, 
        private sessionManager: SessionManager,
        private resumeAnalysisService: ResumeAnalysisService,
        private conversationContinueService: ConversationContinueService
    ) {};

    // async analyzeResume(resumeContent: string, jobDescription: string) {
        
    //     const prompt = PromptTemplate.fromTemplate(RESUME_QUIZ_PROMPT2);

    //     const model = this.aiModelFactory.createDefaultModel();

    //     const parser = new JsonOutputParser();

    //     const chain = prompt.pipe(model).pipe(parser);

    //     try {
    //         this.logger.log('开始分析简历...');

    //         const result = await chain.invoke({
    //             resume_content: resumeContent,
    //             job_description: jobDescription
    //         });
    //         this.logger.log('简历分析完成');
    //         return result;
    //     } catch (error) {
    //         this.logger.error('简历分析失败', error);
    //         throw error;
    //     }
    // }

    async analyzeResume(userId: string, position: string, resumeContent: string, jobDescription: string) {
        try {
        const systemMessage = RESUME_ANALYSIS_SYSTEM_MESSAGE(position);

        const sessionId = this.sessionManager.createSession(userId, position, systemMessage);

        this.logger.log(`创建会话: ${sessionId}`);

        const result = await this.resumeAnalysisService.analyze(resumeContent, jobDescription);

        this.sessionManager.addMessage(sessionId, 'user', `简历内容: ${resumeContent}`);

        this.sessionManager.addMessage(sessionId, 'assistant', JSON.stringify(result));

        this.logger.log('简历分析完成, sessionId: ', sessionId);

        return {
            sessionId,
            analysis: result
        }
        } catch (error) {
            this.logger.error(`简历分析失败: ${error}`);
            throw error;
        }
    }

    async continueConversation(sessionId: string, userQuestion: string): Promise<string> {
        try {
            this.sessionManager.addMessage(sessionId, 'user', userQuestion);
            const history = this.sessionManager.getRecentSessions(sessionId, 10);

            this.logger.log('继续对话');

            const aiResponse = await this.conversationContinueService.continue(history);

            this.sessionManager.addMessage(sessionId, 'assistant', aiResponse);

            this.logger.log('继续对话完成')

            return aiResponse;
        } catch (error) {
            this.logger.log('继续对话失败');
            throw error;
        }
    }
}