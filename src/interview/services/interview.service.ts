import { PromptTemplate } from '@langchain/core/prompts';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiModelFactory } from 'src/ai/services/ai-model.factory';
import {
  RESUME_ANALYSIS_SYSTEM_MESSAGE,
  RESUME_QUIZ_PROMPT2,
} from '../prompts/resume.quiz.prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { SessionManager } from 'src/ai/services/session.manager';
import { ResumeAnalysisService } from './resume.analysis.service';
import { ConversationContinueService } from './conversation-continue.service';
import { ResumeQuizDto } from '../dto/resume-quiz-dto';
import { Subject } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import {
  ConsumptionRecord,
  ConsumptionRecordDocument,
  ConsumptionStatus,
  ConsumptionType,
} from '../schemas/consumption-record.schema';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import {
  ResumeQuizResult,
  ResumeQuizResultDocument,
  ResumeQuizResultSchema,
} from '../schemas/interview-quiz-result.schema';
import { User, UserDocument } from 'src/user/schemas/user.schemas';

export interface ProgressEvent {
  type: 'progress' | 'complete' | 'error' | 'timeout';
  step?: number;
  label?: string;
  progress: number;
  message?: string;
  data?: any;
  error?: string;
  stage?: 'prepare' | 'generating' | 'saving' | 'done';
}
@Injectable()
export class InterviewService {
  [x: string]: any;
  private readonly logger = new Logger(InterviewService.name);
  constructor(
    private configService: ConfigService,
    private aiModelFactory: AiModelFactory,
    private sessionManager: SessionManager,
    private resumeAnalysisService: ResumeAnalysisService,
    private conversationContinueService: ConversationContinueService,
    @InjectModel(ConsumptionRecord.name)
    private consumptionRecordModel: Model<ConsumptionRecordDocument>,
    @InjectModel(ResumeQuizResult.name)
    private resumeQuizResultModel: Model<ResumeQuizResultDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
  ) {}

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

  async analyzeResume(
    userId: string,
    position: string,
    resumeContent: string,
    jobDescription: string,
  ) {
    try {
      const systemMessage = RESUME_ANALYSIS_SYSTEM_MESSAGE(position);

      const sessionId = this.sessionManager.createSession(
        userId,
        position,
        systemMessage,
      );

      this.logger.log(`创建会话: ${sessionId}`);

      const result = await this.resumeAnalysisService.analyze(
        resumeContent,
        jobDescription,
      );

      this.sessionManager.addMessage(
        sessionId,
        'user',
        `简历内容: ${resumeContent}`,
      );

      this.sessionManager.addMessage(
        sessionId,
        'assistant',
        JSON.stringify(result),
      );

      this.logger.log('简历分析完成, sessionId: ', sessionId);

      return {
        sessionId,
        analysis: result,
      };
    } catch (error) {
      this.logger.error(`简历分析失败: ${error}`);
      throw error;
    }
  }

  async continueConversation(
    sessionId: string,
    userQuestion: string,
  ): Promise<string> {
    try {
      this.sessionManager.addMessage(sessionId, 'user', userQuestion);
      const history = this.sessionManager.getRecentSessions(sessionId, 10);

      this.logger.log('继续对话');

      const aiResponse =
        await this.conversationContinueService.continue(history);

      this.sessionManager.addMessage(sessionId, 'assistant', aiResponse);

      this.logger.log('继续对话完成');

      return aiResponse;
    } catch (error) {
      this.logger.log('继续对话失败');
      throw error;
    }
  }

  private getStagePrompt(
    progressSubject: Subject<ProgressEvent> | undefined,
  ): void {
    if (!progressSubject) return;

    const progressMessages = [
      { progress: 0.1, message: 'AI正在分析您的技术栈和项目经验' },
      { progress: 0.2, message: 'AI正在对比岗位要求和背景' },
      { progress: 0.3, message: 'AI正在挖掘项目亮点' },
      { progress: 0.4, message: 'AI正在设计不同难度的问题组合' },
      { progress: 0.5, message: 'AI正在生成基于STAR法则的答案' },
      { progress: 0.6, message: 'AI正在为您准备回答要点和技巧' },
      { progress: 0.7, message: 'AI正在调整问题难度分布' },
      { progress: 0.8, message: 'AI正在完善综合评估建议' },
      { progress: 0.9, message: 'AI即将完成问题生成' },
    ];
    let progress = 0;
    let currentMessage = progressMessages[0];
    const interval = setInterval(() => {
      progress += 1;
      currentMessage = progressMessages[progress];
      this.emitProgress(
        progressSubject,
        progress,
        currentMessage.message,
        'generating',
      );
      if (progress === progressMessages.length - 1) {
        clearInterval(interval);
        this.emitProgress(progressSubject, 100, 'AI已完成问题生成', 'done');
        return {
          question: [],
          analysis: [],
        };
      }
    }, 1000);
  }
  // 执行简历押题
  private async executeResumeQuiz(
    userId: string,
    dto: ResumeQuizDto,
    progressSubject?: Subject<ProgressEvent>,
  ) {
    let consumptionRecord: any = null;
    const recordId = uuidv4();
    const resultId = uuidv4();

    try {
      if (dto.requestId) {
        const existingRecord = await this.consumptionRecordModel.findOne({
          userId,
          'metadata.requestId': dto.requestId,
          status: {
            $in: [ConsumptionStatus.SUCCESS, ConsumptionStatus.PENDING],
          },
        });
        if (existingRecord) {
          if (existingRecord.status === ConsumptionStatus.SUCCESS) {
            this.logger.log(
              `重复请求，返回已有结果：requestId = ${dto.requestId}`,
            );

            const existingResult = await this.resumeQuizResultModel.findOne({
              resultId: existingRecord.resultId,
            });

            if (!existingResult) {
              throw new BadRequestException('结果不存在');
            }
            return {
              requestId: existingResult.resultId,
              questions: existingResult.questions,
              summary: existingResult.summary,
              remainCount: await this.getRemainingCount(userId, 'resume'),
              consumptionRecordId: existingRecord.recordId,
              isFromCache: true,
            };
          }

          if (existingRecord.status === ConsumptionStatus.PENDING) {
            throw new BadRequestException('请求正在处理中，请稍后查询结果');
          }
        }
      }

      this.logger.log(`${userId}用户扣费成功`);

      // 检查并扣除次数
      const user = await this.userModel.findOneAndUpdate(
        {
          _id: userId,
          resumeRemainingCount: { $gt: 0 },
        },
        {
          $inc: { resumeRemainingCount: -1 },
        },
        {
          new: false,
        }, // 返回更新前的文档
      );
      if (!user) {
        throw new BadRequestException(`简历押题次数不足，请充值`);
      }
      this.logger.log(
        `用户扣费成功: userId=${userId}, 扣费前=${user.resumeRemainingCount}, 扣费后=${user.resumeRemainingCount - 1}`,
      );

      // 创建消费记录
      consumptionRecord = await this.consumptionRecordModel.create({
        recordId,
        user: new Types.ObjectId(userId),
        userId,
        type: ConsumptionType.RESUME_QUIZ,
        status: ConsumptionStatus.PENDING,
        consumedCount: 1,
        description: `简历押题-${dto.company} ${dto.positionName}`,
        inputData: {
          company: dto?.company || '',
          positionName: dto.positionName,
          minSalary: dto.minSalary,
          maxSalary: dto.maxSalary,
          jd: dto.jd,
          resumeId: dto.resumeId,
        },
        resultId,
        metadata: {
          requestId: dto.requestId,
          promptVersion: dto.promptVersion,
        },
        startedAt: new Date(),
      });

      this.getStagePrompt(progressSubject);

      const aiResult: any = {};

      const quizResult = await this.resumeQuizResultModel.create({
        resultId,
        user: new Types.ObjectId(userId),
        userId,
        resumeId: dto.resumeId,
        company: dto?.company || '',
        position: dto.positionName,
        jobDescription: dto.jd,
        questions: aiResult.questions,
        totalQuestions: aiResult.questions.length,
        summary: aiResult.summary,
        // AI生成的分析报告数据
        matchScore: aiResult.matchScore,
        matchLevel: aiResult.matchLevel,
        matchedSkill: aiResult.matchedSkills,
        missingSkills: aiResult.missingSkills,
        knowledgeGaps: aiResult.knowledgeGaps,
        learningPriorities: aiResult.learningPriorities,
        radarData: aiResult.radarData,
        strengths: aiResult.strengths,
        weaknesses: aiResult.weaknesses,
        interviewTips: aiResult.interviewTips, // 元数据
        consumptionRecordId: recordId,
        aiModel: 'deepseek-chat',
        promptVersion: dto.promptVersion || 'v2',
      });

      this.logger.log(`结果保存成功: resultId = ${resultId}`);
      await this.consumptionRecordModel.findByIdAndUpdate(
        consumptionRecord._id,
        {
          $set: {
            status: ConsumptionStatus.SUCCESS,
            outputData: {
              resultId,
              questionCount: aiResult.questions.length,
            },
            aiModel: 'deepseek-chat',
            promptTokens: aiResult.usage.promptTokens,
            completionTokens: aiResult.usage?.completionTokens,
            totalTokens: aiResult.usage?.totalTokens,
            completedAt: new Date(),
          },
        },
      );

      this.logger.log(`消费状态已更新为success，resultId = ${resultId}`);
    } catch (error) {
      this.logger.error(
        `简历押题生成失败：userId=${userId}, error=${error.message}`,
        error.stack,
      );
      // 失败回滚
      try {
        this.logger.log(`开始退换次数: userId=${userId}`);
        await this.refundCount(userId, 'resume');
        this.logger.log(`次数退还成功：userId=${user}`);
        if (consumptionRecord) {
          await this.consumptionRecordModel.findByIdAndUpdate(
            consumptionRecord._id,
            {
              $set: {
                status: ConsumptionStatus.FAILED,
                errorMessage: error.message,
                errorStack:
                  process.env.NODE_ENV === 'development'
                    ? error.stack
                    : undefined,
                failedAt: new Date(),
                isRefunded: true,
                refundedAt: new Date(),
              },
            },
          );
          this.logger.log(`消费记录已更新为失败状态：recordId=${consumptionRecord.recordId}`)
        }
      } catch (error) {
        // 退款失败
        this.logger.error(`退款失败，需要人工介入, userId=${userId}, originalError=${error.message}, `)
      }
      if (progressSubject && !progressSubject.closed) {
        progressSubject.next({
          type: 'error',
          progress: 0,
          label: '生成失败',
          error: error,
        });
        progressSubject.complete();
      }
      throw error;
    }
  }
  private emitProgress(
    subject: Subject<ProgressEvent> | undefined,
    progress: number,
    label: string,
    stage?: 'prepare' | 'generating' | 'saving' | 'done',
  ) {
    if (subject && !subject.closed) {
      subject.next({
        type: 'progress',
        progress: Math.min(Math.max(progress, 0), 100),
        label,
        message: label,
        stage,
      });
    }
  }

  private async getRemainingCount(
    userId: string,
    type: 'resume' | 'special' | 'behavior',
  ): Promise<number> {
    const user = await this.userModel.findById(userId);
    if (!user) return 0;
    switch (type) {
      case 'resume':
        return user.resumeRemainingCount;
      case 'special':
        return user.specialRemainingCount;
      case 'behavior':
        return user.behaviorRemainingCount;
      default:
        return 0;
    }
  }

  generateResumeQuizWithProgress(
    userId: string,
    dto: ResumeQuizDto,
  ): Subject<ProgressEvent> {
    const subject = new Subject<ProgressEvent>();

    this.executeResumeQuiz(userId, dto, subject).catch((error) => {
      subject.error(error);
    });

    return subject;
  }
}
