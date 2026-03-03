import { PromptTemplate } from '@langchain/core/prompts';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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
import { NotFoundError, Subject } from 'rxjs';
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
import { DocumentParseService } from './documentParseService';
import { MinioService } from './minio.service';
import { InterviewAiService } from './interview.ai.service';
import {
  MockInterviewEventDto,
  MockInterviewEventType,
  MockInterviewType,
  StartMockInterviewDto,
} from '../dto/mock-interview.dto';
import {
  AIInterviewResult,
  AIInterviewResultDocument,
} from '../schemas/ai-interview-result.schema';
import {
  ReportStatus,
  ResumeQuizAnalysisDto,
} from '../dto/analysis-report.dto';

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

/**
 * 面试会话（内存中）
 */
interface InterviewSession {
  sessionId: string; // 临时ID，用于这次面试
  resultId?: string; // 数据库中的持久化ID
  consumptionRecordId?: string; // 消费记录ID

  // 用户信息
  userId: string; // 用户ID
  interviewType: MockInterviewType; // 面试类型（专项/综合）
  interviewerName: string; // 面试官名字
  candidateName?: string; // 候选人名字

  // 岗位信息
  company: string; // 公司名称
  positionName?: string; // 岗位名称
  salaryRange?: string; // 薪资范围
  jd?: string; // 职位描述
  resumeContent: string; // 简历内容（保存，用于后续问题生成）

  // 对话历史
  conversationHistory: Array<{
    role: 'interviewer' | 'candidate';
    content: string;
    timestamp: Date;
    standardAnswer?: string; // 标准答案（仅面试官问题有）
  }>;

  // 进度追踪
  questionCount: number; // 已问的问题数
  startTime: Date; // 开始时间
  targetDuration: number; // 预期时长（分钟）

  // 状态
  isActive: boolean; // 是否活跃（用于判断是否已结束）
}
@Injectable()
export class InterviewService {
  [x: string]: any;
  private readonly logger = new Logger(InterviewService.name);
  private readonly SPECIAL_INTERVIEW_MAX_DURATION = 120;
  private readonly BEHAVIOR_INTERVIEW_MAX_DURATION = 120;

  // 存储活跃的面试会话（内存中）
  private interviewSessions: Map<string, InterviewSession> = new Map();
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
    private documentParserService: DocumentParseService,
    private minioService: MinioService,
    private interviewAiService: InterviewAiService,
    @InjectModel(AIInterviewResult.name)
    private aiInterviewResultModel: Model<AIInterviewResultDocument>,
  ) {}

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

      this.emitProgress(progressSubject, 0, '正在读取简历文档...', 'prepare');

      const resumeContent = await this.extractResumeContent(userId, dto);
      this.logger.log(`简历解析成功：${resumeContent}`);
      this.emitProgress(progressSubject, 5, '简历解析完成', 'prepare');

      this.emitProgress(
        progressSubject,
        10,
        '准备就绪，即将开始AI生成',
        'prepare',
      );
      // AI生成
      const aiStartTime = Date.now();
      this.logger.log('开始生成简历押题部分...');
      this.emitProgress(
        progressSubject,
        10,
        'AI正在理解您的简历并生成面试问题...',
        'prepare',
      );

      const questionsResult =
        await this.interviewAiService.generateResumeQuizQuestionOnly({
          company: dto?.company || '',
          positionName: dto.positionName,
          minSalary: dto.minSalary,
          maxSalary: dto.maxSalary,
          jd: dto.jd,
          resumeContent,
        });

      this.logger.log(`押题部分生成完成`);

      this.emitProgress(
        progressSubject,
        50,
        '面试问题生成完成，开始匹配度分析...',
        'prepare',
      );
      this.logger.log(`开始生成匹配度分析部分...`);

      this.emitProgress(
        progressSubject,
        60,
        'AI正在分析您与岗位的匹配度',
        'prepare',
      );
      const analysisResult =
        await this.interviewAiService.generateResumeQuizAnalysisOnly({
          company: dto?.company || '',
          positionName: dto.positionName,
          minSalary: dto.minSalary,
          maxSalary: dto.maxSalary,
          jd: dto.jd,
          resumeContent,
        });

      this.logger.log(`匹配度分析完成`);

      const aiDuration = Date.now() - aiStartTime;
      this.logger.log(
        `AI总耗时：${aiDuration}ms，${(aiDuration / 1000).toFixed(1)}秒`,
      );

      const aiResult = {
        ...questionsResult,
        ...analysisResult,
      };

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
        this.logger.log(`开始退还次数: userId=${userId}`);

        await this.refundCount(userId, 'resume');

        this.logger.log(`次数退还成功：userId=${userId}`);
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
          this.logger.log(
            `消费记录已更新为失败状态：recordId=${consumptionRecord.recordId}`,
          );
        }
      } catch (error) {
        // 退款失败
        this.logger.error(
          `退款失败，需要人工介入, userId=${userId}, originalError=${error.message}, `,
        );
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

  private async refundCount(
    userId: string,
    type: 'resume' | 'special' | 'behavior',
  ) {
    const field =
      type === 'resume'
        ? 'resumeRemainingCount'
        : type === 'special'
          ? 'specialRemainingCount'
          : 'behaviorRemainingCount';
    const result = await this.userModel.findByIdAndUpdate(
      userId,
      {
        $inc: { [field]: 1 },
      },
      {
        new: true,
      },
    );
    if (!result) {
      throw new Error(`退款失败：用户不存在userId=${userId}`);
    }
    this.logger.log(
      `次数退还成功，userId=${userId}, type=${type}, 退还后=${result[field]}`,
    );
  }

  private async extractResumeContent(
    userId: string,
    dto: ResumeQuizDto,
  ): Promise<string> {
    if (dto.resumeContent) {
      this.logger.log(
        `使用直接提供的简历文本，长度=${dto.resumeContent.length}`,
      );
      return dto.resumeContent;
    }

    if (dto.resumeId) {
      // 查询
    }

    if (dto.resumeURL) {
      try {
        const rawText = await this.documentParserService.parseDocumentFromUrl(
          dto.resumeURL,
        );

        const cleanedText = this.documentParserService.cleanText(rawText);

        const validation =
          this.documentParserService.validateResumeContent(cleanedText);

        if (!validation.isValid) {
          throw new BadRequestException(validation.reason);
        }

        if (validation.warning && validation.warning.length > 0) {
          this.logger.log(`简历解析警告: ${validation.warning.join('; ')}`);
        }

        const estimatedTokens =
          this.documentParserService.estimateTokens(cleanedText);

        if (estimatedTokens > 6000) {
          this.logger.warn(
            `简历内容过长，${estimatedTokens}tokens, 将进行截断`,
          );

          const maxChars = 1000 * 1.5;
          const truncatedText = cleanedText.substring(0, maxChars);

          this.logger.log(
            `简历已经截断：原长度= ${estimatedTokens}, 截断后=${maxChars}，tokens=${this.documentParserService.estimateTokens(truncatedText)}`,
          );

          return truncatedText;
        }

        this.logger.log(
          `简历解析成功: 长度=${cleanedText.length}, tokens= ${estimatedTokens}`,
        );
        return cleanedText;
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }

        this.logger.error(
          `解析简历失败，resumeId=${dto.resumeId}, error=${error.message}`,
          error.stack,
        );

        throw new BadRequestException(`简历解析失败：${error.message}。`);
      }
    }
    throw new BadRequestException(`请提供简历URL或简历内容`);
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

  private async executeStartMockInterview(
    userId: string,
    dto: StartMockInterviewDto,
    progressSubject: Subject<MockInterviewEventDto>,
  ) {
    try {
      const countField =
        dto.interviewType === MockInterviewType.SPECIAL
          ? 'specialRemainingCount'
          : 'behaviorRemainingCount';

      // 扣费
      const user = await this.userModel.findOneAndUpdate(
        {
          _id: userId,
          [countField]: { $gt: 0 },
        },
        {
          $inc: { [countField]: -1 },
        },
        {
          new: false,
        },
      );
      if (!user) {
        throw new BadRequestException(
          `${dto.interviewType === MockInterviewType.SPECIAL ? '专项面试' : '综合面试'}次数不足`,
        );
      }
      this.logger.log(
        `用户扣费成功，user=${userId}，type=${dto.interviewType}，扣费前=${user[countField]}，扣费后=${user[countField] - 1}`,
      );

      const resumeContent = await this.extractResumeContent(userId, {
        resumeId: dto.resumeId,
        resumeContent: dto.resumeContent,
      } as any);

      const sessionId = uuidv4();

      const interviewerName = '面试官（张三老师）';

      const targetDuration =
        dto.interviewType === MockInterviewType.SPECIAL
          ? this.SPECIAL_INTERVIEW_MAX_DURATION
          : this.BEHAVIOR_INTERVIEW_MAX_DURATION;

      // 根据工资范围生成工资区间
      const salaryRange =
        dto.minSalary && dto.maxSalary
          ? `${dto.minSalary}K-${dto.maxSalary}K`
          : dto.minSalary
            ? `${dto.minSalary}K起`
            : dto.maxSalary
              ? `${dto.maxSalary}K封顶`
              : undefined;

      const session: InterviewSession = {
        sessionId,
        userId,
        interviewType: dto.interviewType,
        interviewerName,
        candidateName: dto.candidateName,
        company: dto.company || '',
        positionName: dto.positionName,
        salaryRange,
        jd: dto.jd,
        resumeContent,
        conversationHistory: [],
        questionCount: 0,
        startTime: new Date(),
        targetDuration,
        isActive: true,
      };
      this.interviewSessions.set(sessionId, session);

      const resultId = uuidv4();
      const recordId = uuidv4();
      session.resultId = resultId;
      session.consumptionRecordId = recordId;

      // 保存面试结果记录到数据库
      await this.aiInterviewResultModel.create({
        resultId,
        user: new Types.ObjectId(userId),
        userId,
        interviewType:
          dto.interviewType === MockInterviewType.SPECIAL
            ? 'special'
            : 'behavior',
        company: dto.company || '',
        position: dto.positionName,
        salaryRange,
        jobDescription: dto.jd,
        interviewMode: 'text',
        qaList: [],
        totalQuestions: 0,
        answeredQuestions: 0,
        status: 'in_progress',
        consumptionRecordId: recordId,
        sessionState: session, // 保存会话状态
        metadata: {
          interviewerName,
          candidateName: dto.candidateName,
          sessionId,
        },
      });

      // 创建消费记录
      await this.consumptionRecordModel.create({
        resultId,
        recordId,
        user: new Types.ObjectId(userId),
        userId,
        type:
          dto.interviewType === MockInterviewType.SPECIAL
            ? ConsumptionType.SPECIAL_INTERVIEW
            : ConsumptionType.BEHAVIOR_INTERVIEW,
        status: ConsumptionStatus.SUCCESS,
        consumedCount: 1,
        description: `模拟面试 - ${dto.interviewType === MockInterviewType.SPECIAL ? '专项面试' : '综合面试'}`,
        inputData: {
          company: dto.company || '',
          position: dto.positionName,
          interviewType: dto.interviewType,
        },
        outputData: {
          resultId,
          sessionId,
        },
        startedAt: session.startTime,
      });

      this.logger.log(
        `✅ 面试会话创建成功: sessionId=${sessionId}, resultId=${resultId}, interviewer=${interviewerName}`,
      );

      let fullOpeningStatement = '';
      const openingGenerator =
        this.interviewAiService.generateOpeningStatementStream(
          interviewerName,
          dto.candidateName,
          dto.positionName,
        );

      for await (const chunk of openingGenerator) {
        fullOpeningStatement += chunk;

        progressSubject.next({
          type: MockInterviewEventType.START,
          sessionId,
          resultId,
          interviewerName,
          content: fullOpeningStatement,
          questionNumber: 0,
          totalQuestions:
            dto.interviewType === MockInterviewType.SPECIAL ? 12 : 8,
          elapsedMinutes: 0,
          isStreaming: true,
        });
      }

      const openStatementTime = new Date();

      session.conversationHistory.push({
        role: 'interviewer',
        content: fullOpeningStatement,
        timestamp: openStatementTime,
      });

      await this.aiInterviewResultModel.findOneAndUpdate(
        { resultId },
        {
          $push: {
            qaList: {
              question: fullOpeningStatement,
              answer: '',
              answerDuration: 0,
              answerAt: openStatementTime,
              askedAt: openStatementTime,
            },
          },
          $set: {
            sessionState: session,
          },
        },
      );

      this.logger.log('开场白已保存到数据库中：resultId = ', resultId);

      progressSubject.next({
        type: MockInterviewEventType.START,
        sessionId,
        resultId,
        interviewerName,
        content: fullOpeningStatement,
        questionNumber: 0,
        totalQuestions:
          dto.interviewType === MockInterviewType.SPECIAL ? 12 : 8,
        elapsedMinutes: 0,
        isStreaming: false,
      });
      progressSubject.next({
        type: MockInterviewEventType.WAITING,
        sessionId,
      });

      progressSubject.complete();
    } catch (error) {
      const countField =
        dto.interviewType === MockInterviewType.SPECIAL
          ? 'special'
          : 'behavior';
      await this.refundCount(userId, countField);
      this.logger.log('启动面试失败，失败原因：', error.message);
      throw error;
    }
  }

  startMockInterviewWithStream(
    userId: string,
    dto: StartMockInterviewDto,
  ): Subject<MockInterviewEventDto> {
    const subject = new Subject<MockInterviewEventDto>();

    this.executeStartMockInterview(userId, dto, subject).catch((error) => {
      this.logger.log('启动模拟面试失败');
      if (subject && !subject.closed) {
        subject.next({
          type: MockInterviewEventType.ERROR,
          error: error,
        });
        subject.complete();
      }
    });

    return subject;
  }

  /**
   * 【步骤1】更新用户回答
   * 在用户提交回答时调用。该方法用于更新面试结果中的用户回答内容，并在用户首次回答时增加回答计数。
   * 另外，还可以同步更新面试会话的状态（sessionState），以便持续跟踪和保存面试进度。
   *
   * @param resultId - 面试结果的唯一标识符，用于查找对应的面试结果记录。
   * @param qaIndex - 问题的索引，用于确定更新的是哪一个问题的回答。
   * @param answer - 用户的回答内容。
   * @param answeredAt - 用户提交回答的时间。
   * @param session - 可选的 session 对象，用于更新面试会话的状态。
   *
   * @returns Promise<void> - 返回一个 `Promise`，表示更新操作的结果（没有返回值）。
   */
  private async updateInterviewAnswer(
    resultId: string,
    qaIndex: number,
    answer: string,
    answeredAt: Date,
    session?: InterviewSession, // 可选的 session，用于更新 sessionState
  ): Promise<void> {
    try {
      const existingRecord = await this.aiInterviewResultModel.findOne({
        resultId,
      });

      const isFirstAnswer =
        !existingRecord?.qaList[qaIndex]?.answer ||
        existingRecord.qaList[qaIndex].answer === '';

      const updateQuery: any = {
        $set: {
          [`qaList.${qaIndex}.answer`]: answer,
          [`qaList.${qaIndex}.answeredAt`]: answeredAt,
        },
      };

      if (isFirstAnswer) {
        updateQuery.$inc = { answerQuestions: 1 };
      }

      const result = await this.aiInterviewResultModel.findOneAndUpdate(
        { resultId },
        updateQuery,
        { new: true },
      );

      if (result) {
        this.logger.log('更新用户回答成功');
      } else {
        this.logger.log('更新用户回答失败');
      }
    } catch (error) {
      this.logger.error('更新用户回答异常：', error.message, error.stack);
    }
  }

  /**
   * 【步骤2】创建问题占位项
   * 在AI开始生成问题前调用。该方法用于在面试结果中创建一个“问题占位项”，
   * 以便在AI生成问题之前，能够先占据一个位置，保证面试流程的顺利进行。
   * 这个占位项会在实际问题生成后更新为问题内容和答案。
   *
   * @param resultId - 面试结果的唯一标识符，用于查找对应的面试结果记录。
   * @param askedAt - 问题生成的时间，通常是AI开始生成问题的时间。
   *
   * @returns Promise<void> - 返回一个 `Promise`，表示创建占位项的操作结果（没有返回值）。
   */
  private async createInterviewQuestionPlaceholder(
    resultId: string,
    askedAt: Date,
  ): Promise<void> {
    try {
      const placeholderItem = {
        question: ['生成中...'],
        answer: '',
        standardAnswer: '',
        answerDuration: 0,
        askedAt,
        answeredAt: null,
      };

      await this.aiInterviewResultModel.findOneAndUpdate(
        { resultId },
        {
          $push: { qaList: placeholderItem },
          $inc: { totalQuestions: 1 },
        },
        { new: true },
      );
    } catch (error) {}
  }

  private async saveMockInterviewResult(
    session: InterviewSession,
  ): Promise<string> {
    try {
      if (session.resultId) {
        this.logger.log(
          `使用已有结果id：resultId=${session.resultId}(已通过实时保存)`,
        );

        await this.aiInterviewResultModel.findOneAndUpdate(
          { resultId: session.resultId },
          {
            $set: {
              status: 'completed',
              completedAt: new Date(),
              sessionState: session,
            },
          },
        );

        if (session.consumptionRecordId) {
          await this.consumptionRecordModel.findOneAndUpdate(
            { recordId: session.consumptionRecordId },
            {
              $set: {
                completedAt: new Date(),
                status: ConsumptionStatus.SUCCESS,
              },
            },
          );
        }

        return session.resultId;
      }

      const resultId = uuidv4();
      const recordId = uuidv4();

      const qaList: any[] = [];
      for (let i = 0; i < session.conversationHistory.length; i += 2) {
        if (i + 1 < session.conversationHistory.length) {
          qaList.push({
            question: session.conversationHistory[i].content,
            answer: session.conversationHistory[i + 1].content,
            standardAnswer: session.conversationHistory[i].standardAnswer,
            answerDuration: 0,
            answeredAt: session.conversationHistory[i + 1].timestamp,
          });
        }
      }

      const durationMinutes = Math.floor(
        (Date.now() - session.startTime.getTime()) / 1000 / 60,
      );

      await this.aiInterviewResultModel.create({
        resultId,
        user: new Types.ObjectId(session.userId),
        userId: session.userId,
        interviewType:
          session.interviewType === MockInterviewType.SPECIAL
            ? 'special'
            : 'behavior',
        company: session.company || '',
        position: session.positionName,
        salaryRange: session.salaryRange,
        jobDescription: session.jd,
        interviewDuration: durationMinutes,
        interviewMode: 'text',
        qaList: qaList,
        totalQuestions: qaList.length,
        answeredQuestions: qaList.length,
        status: 'completed',
        completedAt: new Date(),
        consumptionRecordId: recordId,
        metadata: {
          interviewerName: session.interviewerName,
          candidateName: session.candidateName,
        },
      });

      await this.consumptionRecordModel.create({
        recordId,
        user: new Types.ObjectId(session.userId),
        userId: session.userId,
        type:
          session.interviewType === MockInterviewType.SPECIAL
            ? ConsumptionType.SPECIAL_INTERVIEW
            : ConsumptionType.BEHAVIOR_INTERVIEW,
        status: ConsumptionStatus.SUCCESS,
        consumedCount: 1,
        description: `模拟面试-${session.interviewType === MockInterviewType.SPECIAL ? '专项面试' : '综合面试'}`,
        inputData: {
          company: session.company || '',
          positionName: session.positionName,
          interviewType: session.interviewType,
        },
        outputData: {
          resultId,
          questionCount: qaList.length,
          duration: durationMinutes,
        },
        resultId,
        startedAt: session.startTime,
        completedAt: new Date(),
      });

      this.logger.log(
        `面试结果保存成功：result=${resultId}，duration=${durationMinutes}min`,
      );
      return resultId;
    } catch (error) {
      this.logger.log(`面试结果保存失败：${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 【步骤3】更新问题内容
   * 在AI问题生成完成后调用。该方法用于更新面试记录中的问题内容，
   * 以便将AI生成的实际问题填充到相应的位置，从而更新占位符为具体的面试问题。
   *
   * @param resultId - 面试结果的唯一标识符，用于查找对应的面试结果记录。
   * @param qaIndex - 问题的索引，用于确定更新的是哪一个问题。
   * @param question - AI生成的实际问题内容。
   * @param askedAt - 问题生成的时间，通常是AI生成问题的时间。
   *
   * @returns Promise<void> - 返回一个 `Promise`，表示更新操作的结果（没有返回值）。
   */
  private async updateInterviewQuestion(
    resultId: string,
    qaIndex: number,
    question: string,
    askedAt: Date,
  ): Promise<void> {
    try {
      const result = await this.aiInterviewResultModel.findOneAndUpdate(
        { resultId },
        {
          $set: {
            [`qaList.${qaIndex}.question`]: question,
            [`qaList.${qaIndex}.askedAt`]: askedAt,
          },
        },
        { new: true },
      );

      if (result) {
        this.logger.log(
          `更新问题内容成功：resultId=${resultId}, qaIndex=${qaIndex}, question的前50个字=${question.substring(0, 50)}...`,
        );
      } else {
        this.logger.error(`更新问题内容失败：未找到resultId=${resultId}`);
      }
    } catch (error) {
      this.logger.error(`更新问题内容异常：${error.message}`, error.stack);
    }
  }

  private async updateInterviewStandardAnswer(
    resultId: string,
    qaIndex: number,
    standardAnswer: string,
  ): Promise<void> {
    try {
      const result = await this.aiInterviewResultModel.findOneAndUpdate(
        { resultId },
        {
          $set: {
            [`qaList.${qaIndex}.standardAnswer`]: standardAnswer,
          },
        },
        { new: true },
      );
      if (result) {
        this.logger.log(
          `更新标准答案成功：resultId=${resultId}, qaIndex=${qaIndex}, standardAnswer的前50个字=${standardAnswer.substring(0, 50)}...`,
        );
      } else {
        this.logger.error(`更新标准答案失败：未找到resultId=${resultId}`);
      }
    } catch (error) {
      this.logger.error(`更新标准答案异常：${error.message}`, error.stack);
    }
  }

  private async executeAnswerMockInterview(
    userId: string,
    sessionId: string,
    answer: string,
    progressSubject: Subject<MockInterviewEventDto>,
  ): Promise<void> {
    try {
      const session = this.interviewSessions.get(sessionId);

      if (!session) {
        throw new BadRequestException('面试会话不存在或已过期');
      }

      if (session.userId !== userId) {
        throw new BadRequestException('无权访问此面试会话');
      }

      if (!session.isActive) {
        throw new BadRequestException('面试会话已结束');
      }

      session.conversationHistory.push({
        role: 'candidate',
        content: answer,
        timestamp: new Date(),
      });
      session.questionCount++;

      const elapsedMinutes = Math.floor(
        (Date.now() - session.startTime.getTime()) / 1000 / 60,
      );

      this.logger.log(`当前面试用时：${elapsedMinutes}分钟`);

      this.logger.log(
        `候选人回答：sessionId=${sessionId}， questionCount = ${session.questionCount}，elapsed = ${elapsedMinutes}min`,
      );

      const maxDuration =
        session.interviewType === MockInterviewType.SPECIAL
          ? this.SPECIAL_INTERVIEW_MAX_DURATION
          : this.BEHAVIOR_INTERVIEW_MAX_DURATION;

      if (elapsedMinutes >= maxDuration) {
        this.logger.log(
          `面试超时，强制结束：sessionId = ${sessionId}, elapsed=${elapsedMinutes}min, max = ${maxDuration}min`,
        );
        session.isActive = false;

        const closingStatement = `感谢您今天的面试表现。由于时间关系（已进行${elapsedMinutes}分钟），我们今天的面试就到这里。您的回答让我们对您有了较为全面的了解，后续我们会进行综合评估，有结果会及时通知您。祝您生活愉快！`;
        session.conversationHistory.push({
          role: 'interviewer',
          content: closingStatement,
          timestamp: new Date(),
        });

        const resultId = await this.saveMockInterviewResult(session);

        progressSubject.next({
          type: MockInterviewEventType.END,
          sessionId,
          content: closingStatement,
          resultId,
          elapsedMinutes,
          isStreaming: false,
          metadata: {
            totalQuestion: session.questionCount,
            interviewerName: session.interviewerName,
            reason: 'timeout',
          },
        });

        setTimeout(
          () => {
            this.interviewSessions.delete(sessionId);
            this.logger.log(`会话已清理：sessionId=${sessionId}`);
          },
          5 * 60 * 1000,
        );
        progressSubject.complete();
        return;
      }

      progressSubject.next({
        type: MockInterviewEventType.THINKING,
        sessionId,
      });

      const questionStartTime = new Date();
      let fullQuestion = '';
      let aiResponse: {
        question: string;
        shouldEnd: boolean;
        standardAnswer?: string;
        reasoning?: string;
      };

      const questionGenerator =
        this.interviewAiService.generateInterviewQuestionStream({
          interviewType:
            session.interviewType === MockInterviewType.SPECIAL
              ? 'special'
              : 'comprehensive',
          resumeContent: session.resumeContent,
          company: session.company || '',
          positionName: session.positionName,
          jd: session.jd,
          conversationHistory: session.conversationHistory.map((h) => ({
            role: h.role,
            content: h.content,
          })),
          elapsedMinutes,
          targetDuration: session.targetDuration,
        });

      let hasStandarAnswer = false;
      let questionOnlyContent = '';
      let standarAnswerContent = '';

      try {
        let result = await questionGenerator.next();
        while (!result.done) {
          const chunk = result.value;
          fullQuestion += chunk;

          const standardAnswerIndex = fullQuestion.indexOf('[STANDARD_ANSWER]');

          if (standardAnswerIndex !== -1) {
            if (!hasStandarAnswer) {
              questionOnlyContent = fullQuestion
                .substring(0, standardAnswerIndex)
                .trim();
              hasStandarAnswer = true;
              progressSubject.next({
                type: MockInterviewEventType.QUESTION,
                sessionId,
                interviewerName: session.interviewerName,
                content: questionOnlyContent,
                questionNumber: session.questionCount,
                totalQuestions:
                  session.interviewType === MockInterviewType.SPECIAL ? 12 : 8,
                elapsedMinutes,
                isStreaming: false,
              });

              progressSubject.next({
                type: MockInterviewEventType.WAITING,
                sessionId,
              });

              this.logger.log(
                `✅ 问题生成完成，进入参考答案生成阶段: questionLength=${questionOnlyContent.length}`,
              );
            }

            const currentStandardAnswer = fullQuestion
              .substring(standardAnswerIndex + '[STANDARD_ANSWER]'.length)
              .trim();

            if (currentStandardAnswer.length > standarAnswerContent.length) {
              standarAnswerContent = currentStandardAnswer;

              progressSubject.next({
                type: MockInterviewEventType.REFERENCE_ANSWER,
                sessionId,
                interviewerName: session.interviewerName,
                content: standarAnswerContent,
                questionNumber: session.questionCount,
                totalQuestions:
                  session.interviewType === MockInterviewType.SPECIAL ? 12 : 8,
                elapsedMinutes,
                isStreaming: true,
              });
            }
          } else {
            progressSubject.next({
              type: MockInterviewEventType.QUESTION,
              sessionId,
              interviewerName: session.interviewerName,
              content: fullQuestion,
              questionNumber: session.questionCount,
              totalQuestions:
                session.interviewType === MockInterviewType.SPECIAL ? 12 : 8,
              elapsedMinutes,
              isStreaming: true,
            });
          }
          result = await questionGenerator.next();
        }

        if (hasStandarAnswer && standarAnswerContent) {
          progressSubject.next({
            type: MockInterviewEventType.REFERENCE_ANSWER,
            sessionId,
            interviewerName: session.interviewerName,
            content: standarAnswerContent,
            questionNumber: session.questionCount,
            totalQuestions:
              session.interviewType === MockInterviewType.SPECIAL ? 12 : 8,
            elapsedMinutes,
            isStreaming: false,
          });
        }

        aiResponse = result.value;

        if (!hasStandarAnswer) {
          questionOnlyContent = fullQuestion;
          this.logger.log('未检测出标准答案印记');
        }
      } catch (error) {
        throw error;
      }

      if (!session.resultId) {
        this.logger.log(
          `session.resultId不存在，无法保存数据：sessionId=${sessionId}`,
        );
        throw new Error('session.resultId不存在，无法保存数据');
      }

      if (session.conversationHistory.length > 2) {
        const userAnswerIndex = session.conversationHistory.length - 1;
        const prevQuestionIndex = session.conversationHistory.length - 2;

        const prevQuestion = session.conversationHistory[prevQuestionIndex];
        const userAnswer = session.conversationHistory[userAnswerIndex];

        const isOpeningStatement = prevQuestionIndex === 0;

        if (
          prevQuestion.role === 'interviewer' &&
          userAnswer.role === 'candidate'
        ) {
          if (isOpeningStatement) {
            await this.updateInterviewAnswer(
              session.resultId,
              0,
              userAnswer.content,
              userAnswer.timestamp,
              session,
            );
          } else {
            const qaIndex = session.questionCount - 1;
            await this.updateInterviewAnswer(
              session.resultId,
              qaIndex,
              userAnswer.content,
              userAnswer.timestamp,
              session,
            );
          }
        }
      }

      const dbRecord = await this.aiInterviewResultModel.findOne({
        resultId: session.resultId,
      });

      const newQAIndex = dbRecord?.qaList.length || 0;

      await this.createInterviewQuestionPlaceholder(
        session.resultId,
        questionStartTime,
      );

      session.conversationHistory.push({
        role: 'interviewer',
        content: aiResponse.question,
        timestamp: questionStartTime,
        standardAnswer: aiResponse.standardAnswer,
      });

      await this.updateInterviewQuestion(
        session.resultId,
        newQAIndex,
        aiResponse.question,
        questionStartTime,
      );

      if (aiResponse.standardAnswer) {
        await this.updateInterviewStandardAnswer(
          session.resultId,
          newQAIndex,
          aiResponse.standardAnswer,
        );
      }

      await this.aiInterviewResultModel.findOneAndUpdate(
        { resultId: session.resultId },
        {
          $set: {
            sessionState: session,
          },
        },
      );

      if (aiResponse.shouldEnd) {
        session.isActive = false;
        const resultId = await this.saveMockInterviewResult(session);

        progressSubject.next({
          type: MockInterviewEventType.END,
          sessionId,
          content: aiResponse.question,
          resultId,
          elapsedMinutes,
          isStreaming: false,
          metadata: {
            totalQuestions: session.questionCount,
            interviewerName: session.interviewerName,
          },
        });

        setTimeout(
          () => {
            this.interviewSessions.delete(sessionId);
            this.logger.log(`会话已清理：sessionId=${sessionId}`);
          },
          5 * 60 * 1000,
        );
      } else {
        if (!hasStandarAnswer) {
          progressSubject.next({
            type: MockInterviewEventType.QUESTION,
            sessionId,
            interviewerName: session.interviewerName,
            content: aiResponse.question,
            questionNumber: session.questionCount,
            totalQuestions:
              session.interviewType === MockInterviewType.SPECIAL ? 12 : 8,
            elapsedMinutes,
            isStreaming: false,
          });

          progressSubject.next({
            type: MockInterviewEventType.WAITING,
            sessionId,
          });
        }
      }

      progressSubject.complete();
    } catch (error) {}
  }

  answerMockInterviewWithStream(
    userId: string,
    sessionId: string,
    answer: string,
  ): Subject<MockInterviewEventDto> {
    const subject = new Subject<MockInterviewEventDto>();

    this.executeAnswerMockInterview(userId, sessionId, answer, subject).catch(
      (error) => {
        this.logger.log(`回答面试失败：${error.message}`, error.stack);
        if (subject && subject.closed) {
          subject.next({
            type: MockInterviewEventType.ERROR,
            error: error,
          });
          subject.complete();
        }
      },
    );

    return subject;
  }

  async endMockInterview(userId: string, resultId: string): Promise<void> {
    const dbResult = await this.aiInterviewResultModel.findOne({
      resultId,
      userId,
    });

    if (!dbResult) {
      throw new BadRequestException('面试记录不存在');
    }

    if (dbResult.status === 'completed') {
      throw new BadRequestException('面试已经结束');
    }

    let session: InterviewSession;

    if (dbResult.sessionState) {
      session = dbResult.sessionState as InterviewSession;
    } else {
      throw new BadRequestException('无法加载面试状态');
    }

    session.isActive = false;

    const closingstatement = this.interviewAiService.generateClosingStatement(
      session.interviewerName,
      session.candidateName,
    );

    session.conversationHistory.push({
      role: 'interviewer',
      content: closingstatement,
      timestamp: new Date(),
    });

    await this.saveMockInterviewResult(session);

    if (session.sessionId) {
      this.interviewSessions.delete(session.sessionId);
      this.logger.log(`会话已从内存中清理：session = ${session.sessionId}`);
    }
  }

  async pauseMockInterview(
    userId: string,
    resultId: string,
  ): Promise<{ resultId: string; pauseAt: Date }> {
    let pausedAt: Date;
    try {
      const dbResult = await this.aiInterviewResultModel.findOne({
        resultId,
        userId,
      });

      if (!dbResult) {
        throw new NotFoundError('面试记录不存在');
      }

      if (dbResult.status === 'pause') {
        throw new BadRequestException('面试已经暂停');
      }

      if (dbResult.status === 'completed') {
        throw new BadRequestException('面试已经结束，无法暂停');
      }

      pausedAt = new Date();

      await this.aiInterviewResultModel.findOneAndUpdate(
        { resultId },
        {
          $set: {
            status: 'pause',
            pausedAt,
          },
        },
      );

      this.logger.log(`面试已暂停: resultId=${resultId}`);

      const session = dbResult.sessionState as InterviewSession;

      if (session?.sessionId) {
        this.interviewSessions.delete(session.sessionId);
        this.logger.log(`会话已从内存中清理：sessionId=${session.sessionId}`);
      }
    } catch (error) {
      this.logger.log(`暂停面试异常：${error.message}`, error.stack);
      throw error;
    }

    return {
      resultId: '',
      pauseAt: new Date(),
    };
  }

  async resumeMockInterview(
    userId: string,
    resultId: string,
  ): Promise<{
    resultId: string;
    sessionId: string;
    currentQuestion: number;
    totalQuestions: number;
    lastQuestion?: string;
    conversationHistory: Array<{
      role: 'interviewer' | 'candidate';
      content: string;
      timestamp: Date;
    }>;
  }> {
    try {
      const dbResult = await this.aiInterviewResultModel.findOne({
        resultId,
        userId,
        status: 'pause',
      });

      if (!dbResult) {
        throw new BadRequestException('未找到可恢复的面试，或面试未暂停');
      }

      if (!dbResult.sessionState) {
        throw new BadRequestException('会话数据不完整，无法恢复');
      }

      const session: InterviewSession =
        dbResult.sessionState as InterviewSession;

      if (!session || !session.sessionId) {
        throw new BadRequestException('会话数据不完整，无法恢复');
      }

      session.isActive = true;

      this.interviewSessions.set(session.sessionId, session);

      await this.aiInterviewResultModel.findOneAndUpdate(
        { resultId },
        {
          $set: {
            status: 'in_progress',
            resumedAt: new Date(),
            sessionState: session,
          },
        },
      );

      this.logger.log('面试已恢复');

      let lastQuestion: string | undefined;

      if (session.conversationHistory.length > 0) {
        const lastEntry =
          session.conversationHistory[session.conversationHistory.length - 1];

        if (lastEntry.role === 'interviewer') {
          lastQuestion = lastEntry.content;
        }
      }

      return {
        resultId,
        sessionId: '',
        currentQuestion: 0,
        totalQuestions: 0,
        lastQuestion: '',
        conversationHistory: [],
      };
    } catch (error) {
      this.logger.log(`恢复面试异常：${error.message}`, error.stack);
      throw error;
    }
  }

  private async generateResumeQuizAnalysis(
    result: ResumeQuizResultDocument,
  ): Promise<ResumeQuizAnalysisDto> {
    await this.resumeQuizResultModel.findByIdAndUpdate(result.resultId, {
      $inc: { viewCount: 1 },
      $set: { lastViewedAt: new Date() },
    });

    const createdAt = (result as any).createdAt
      ? new Date((result as any).createdAt).toISOString()
      : new Date().toISOString();

    return {
      resultId: result.resultId,
      type: 'resume_quiz',
      company: result.company || '',
      position: result.position,
      salaryRange: result.salaryRange,
      createdAt,

      matchScore: result.matchScore || 0,
      matchLevel: result.matchLevel || '中等',
      matchedSkills: result.matchedSkill || [],
      missingSkills: result.missingSkills || [],
      knowledgeGaps: result.knowledgeGaps || [],
      learningPriorities: (result.learningPriorities || []).map((lp) => ({
        topic: lp.topic,
        priority: lp.priority as 'high' | 'medium' | 'low',
        reason: lp.reason,
      })),
      radarData: result.radarData || [],
      strengths: result.strengths || [],
      weaknesses: result.weaknesses || [],
      summary: result.summary || '',
      interviewTips: result.interviewTips || [],

      totalQuestions: result.questions?.length || 0,
      questionDistribution: result.questionDistribution || {},
      viewCount: result.viewCount || 0,
    };
  }

  private async generateAssessmentReportAsync(resultId: string): Promise<void> {
    try {
      const dbResult = await this.aiInterviewResultModel.findOne({ resultId });

      if (!dbResult) {
        this.logger.error(`未找到面试记录：resultId=${resultId}`);
        throw new NotFoundException(`未找到面试记录：${resultId}`);
      }

      if (dbResult.reportStatus === 'generating') {
        this.logger.log(`评估报告正在生成中：resultId=${resultId}`);
        return;
      }

      await this.aiInterviewResultModel.findOneAndUpdate(
        { resultId },
        { $set: { reportStatus: 'generating' } },
      );

      const qaList: Array<{
        question: string;
        answer: string;
        standardAnswer?: string;
      }> = dbResult.qaList
        .filter((qa) => qa || [])
        .map((qa) => ({
          question: qa?.question,
          answer: qa?.answer,
          standardAnswer: qa?.standardAnswer,
        }));

      this.logger.log(
        `开始生成异步报告：resultId=${resultId}, qaCount=${qaList.length}`,
      );

      if (qaList.length === 0) {
        this.logger.warn('没有有效的问答记录，默认低分报告');

        await this.aiInterviewResultModel.findOneAndUpdate(
          { resultId },
          {
            $set: {
              overallScore: 30,
              overallLevel: '需提升',
              overallComment:
                '本次面试未能有效进行，候选人没有回答任何问题，无法评估专业能力，建议重新安排面试',
              radarData: [
                { dimension: '技术能力', score: 0, description: '未评估' },
                { dimension: '项目经验', score: 0, description: '未评估' },
                { dimension: '问题解决', score: 0, description: '未评估' },
                { dimension: '学习能力', score: 0, description: '未评估' },
                { dimension: '沟通表达', score: 0, description: '未评估' },
              ],
              strengths: [],
              weaknesses: ['未参与面试', '无法评估专业能力'],
              improvements: [
                {
                  category: '面试准备',
                  suggestion: '建议充分准备后重新参加面试',
                  priority: 'high',
                },
              ],
              fluencyScore: 0,
              logicScore: 0,
              professionalScore: 0,
              reportStatus: 'completed',
              reportGeneratedAt: new Date(),
            },
          },
        );

        this.logger.log(`默认低分报告已生成：resultId=${resultId}`);
        return;
      }

      const totalAnswerlength = qaList.reduce(
        (sum, qa) => sum + qa.answer.length,
        0,
      );

      const avgAnswerLength = totalAnswerlength / qaList.length;

      const emptyAnswers = qaList.filter((qa) => qa.answer.length < 10).length;
      this.logger.log(
        `回答质量统计：总问题=${qaList.length}, 平均回答长度=${Math.round(avgAnswerLength)}, 无效回答=${emptyAnswers}`,
      );

      const resumeContent = dbResult.sessionState?.resumeContent || '';

      const interviewType =
        dbResult.interviewType === 'special' ? 'special' : 'comprehensive';

      const assessment =
        await this.interviewAiService.generateInterviewAssessmentReport({
          interviewType,
          company: dbResult.company || '',
          positionName: dbResult.position || '',
          jd: dbResult.jobDescription || '',
          resumeContent,
          qaList,
          answerQualityMetrics: {
            totalQuestions: qaList.length,
            avgAnswerLength: Math.round(avgAnswerLength),
            emptyAnswersCount: emptyAnswers,
          },
        });

      await this.aiInterviewResultModel.findOneAndUpdate(
        { resultId },
        {
          $set: {
            overallScore: assessment.overallScore,
            overallLevel: assessment.overallLevel,
            overallComment: assessment.overallComment,
            radarData: assessment.radarData,
            strengths: assessment.strengths,
            weaknesses: assessment.weaknesses,
            improvements: assessment.improvements,
            fluencyScore: assessment.fluencyScore,
            logicScore: assessment.logicScore,
            professionalScore: assessment.professionalScore,
            reportStatus: 'completed',
            reportGeneratedAt: new Date(),
          },
        },
      );

      this.logger.log(
        `评估报告生成成功: resultId=${resultId}, overallScore=${assessment.overallScore}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ 评估报告生成失败: resultId=${resultId}, error=${error.message}`,
        error.stack,
      );

      await this.aiInterviewResultModel.findOneAndUpdate(
        { resultId },
        {
          $set: {
            reportStatus: 'failed',
            reportError: error.message,
          },
        },
      );
    }
  }

  async getAnalysisReport(userId: string, resultId: string): Promise<any> {
    const resumeQuizResult = await this.resumeQuizResultModel.findOne({
      resultId,
      userId,
    });

    if (resumeQuizResult) {
      const result = this.generateResumeQuizAnalysis(resumeQuizResult);
      return result;
    }

    const aiInterviewResult = await this.aiInterviewResultModel.findOne({
      resultId,
      userId,
    });

    if (aiInterviewResult) {
      const reportStatus =
        aiInterviewResult.reportStatus || ReportStatus.PENDING;

      if (reportStatus === ReportStatus.PENDING) {
        this.generateAssessmentReportAsync(resultId);
      }

      if (
        reportStatus === ReportStatus.PENDING ||
        reportStatus === ReportStatus.GENERATING
      ) {
        throw new BadRequestException('评估报告正在生产中，请稍候再试');
      }

      if (reportStatus === ReportStatus.FAILED) {
        this.generateAssessmentReportAsync(resultId);
        throw new BadRequestException('评估报告正在生产中，请稍候再试');
      }

      return aiInterviewResult;
    }
    throw new NotFoundError('未找到该分析报告');
  }
}
