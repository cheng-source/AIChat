import { PromptTemplate } from '@langchain/core/prompts';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiModelFactory } from 'src/ai/services/ai-model.factory';
import {
  buildAssessmentPrompt,
  FORMAT_INSTRUCTIONS_QUESTIONS_ONLY,
  RESUME_QUIZ_PROMPT2,
  RESUME_QUIZ_PROMPT_ANALYSIS_ONLY,
  RESUME_QUIZ_PROMPT_QUESTIONS_ONLY,
} from '../prompts/resume.quiz.prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { buildMockInterviewPrompt } from '../prompts/mock-interview.prompts';

export interface ResumeQuizInput {
  company: string;
  positionName: string;
  minSalary?: number;
  maxSalary?: number;
  jd: string;
  resumeContent: string;
  promptVersion?: string;
}

export interface ResumeQuizOutput {
  //面试问题
  questions: Array<{
    question: string;
    answer: string;
    category: string;
    difficulty: string;
    tips: string;
    keywords?: string[];
    reasoning?: string;
  }>;
  //综合评估
  summary: string;
  //匹配度分析
  matchScore: number;
  matchLevel: string;
  //技能分析
  matchedSkills: Array<{
    skill: string;
    matched: boolean;
    proficiency?: string;
  }>;
  missingskills: string[];
  //知识补充建议
  knowledgeGaps: string[];
  learningPriorities: Array<{
    topic: string;
    priority: 'high' | 'medium' | 'low';
    reason: string;
  }>;
  //雷达图数据
  radarData: Array<{
    dimension: string;
    score: number;
    description?: string;
  }>;
  //优势与劣势
  strengths: string[];
  weaknesses: string[];
  // 面试准备建议
  interviewTips: string[];

  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

@Injectable()
export class InterviewAiService {
  private readonly logger = new Logger(InterviewAiService.name);
  constructor(
    private readonly configService: ConfigService,
    private aiModelFactory: AiModelFactory,
  ) { }

  // 生成简历押题
  async generateResumeQuizQuestionOnly(
    input: ResumeQuizInput,
  ): Promise<{ questions: any[]; summary: string }> {
    const startTime = Date.now();
    try {
      const prompt = PromptTemplate.fromTemplate(
        RESUME_QUIZ_PROMPT_QUESTIONS_ONLY,
      );

      const parser = new JsonOutputParser();
      console.log(this.aiModelFactory);
      const model = this.aiModelFactory.createDefaultModel();

      const chain = prompt.pipe(model).pipe(parser);

      const salaryRange =
        input.minSalary && input.maxSalary
          ? `${input.minSalary}K-${input.maxSalary}K`
          : input.minSalary
            ? `${input.minSalary}K起`
            : input.maxSalary
              ? `${input.maxSalary}K起`
              : '面议';

      const params = {
        company: input?.company || '',
        positionName: input.positionName,
        salaryRange: salaryRange,
        jd: input.jd,
        resumeContent: input.resumeContent,
        format_instructions: FORMAT_INSTRUCTIONS_QUESTIONS_ONLY,
      };

      this.logger.log(
        `【押题部分】，开始生成：company=${params.company}, position=${params.positionName}`,
      );

      const rawResult = await chain.invoke(params);

      if (!Array.isArray(rawResult.questions)) {
        throw new Error('AI返回的结果，questions不是数组');
      }

      if (rawResult.questions.length < 3) {
        throw new Error(
          `AI 返回的问题数量不足： ${rawResult.questions.length}(应至少3个)`,
        );
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `【押题部分】，生成成功：耗时=${duration}ms，问题数=${rawResult.questions?.length || 0}`,
      );

      return rawResult as { questions: any[]; summary: string };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `【押题部分】，生成失败：耗时=${duration}ms，错误=${error.message}`,
      );
      throw error;
    }
  }

  async generateResumeQuizAnalysisOnly(input: ResumeQuizInput): Promise<any> {
    const startTime = Date.now();

    try {
      const prompt = PromptTemplate.fromTemplate(
        RESUME_QUIZ_PROMPT_ANALYSIS_ONLY,
      );

      const parser = new JsonOutputParser();

      const model = this.aiModelFactory.createDefaultModel();

      const chain = prompt.pipe(model).pipe(parser);

      const salaryRange =
        input.minSalary && input.maxSalary
          ? `${input.minSalary}K-${input.maxSalary}K`
          : input.minSalary
            ? `${input.minSalary}K起`
            : input.maxSalary
              ? `${input.maxSalary}K起`
              : '面议';

      const params = {
        company: input?.company || '',
        positionName: input.positionName,
        salaryRange: salaryRange,
        jd: input.jd,
        resumeContent: input.resumeContent,
        format_instructions: FORMAT_INSTRUCTIONS_QUESTIONS_ONLY,
      };

      this.logger.log(
        `【匹配度分析】，开始生成：company=${params.company}, position=${params.positionName}`,
      );

      const result = await chain.invoke(params);

      const duration = Date.now() - startTime;

      this.logger.log(`【匹配度分析】，生成成功：耗时=${duration}ms`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `【匹配度分析】，生成失败：耗时=${duration}ms，错误=${error.message}`,
      );
      throw error;
    }
  }

  async *generateInterviewQuestionStream(context: {
    interviewType: 'special' | 'comprehensive';
    resumeContent: string;
    company?: string;
    positionName?: string;
    jd?: string;
    conversationHistory: Array<{
      role: 'interviewer' | 'candidate';
      content: string;
    }>;
    elapsedMinutes: number;
    targetDuration: number;
  }) {
    try {
      const prompt = buildMockInterviewPrompt(context);

      const promptTemplate = PromptTemplate.fromTemplate(prompt);

      const model = this.aiModelFactory.createDefaultModel();

      const chain = promptTemplate.pipe(model);

      let fullContent = '';

      const startTime = Date.now();

      const stream = await chain.stream({
        interviewType: context.interviewType,
        resumeContent: context.resumeContent,
        company: context.company,
        positionName: context.positionName || '未提供',
        jd: context.jd || '未提供',
        conversationHistory: this.formatConversationHistory(
          context.conversationHistory,
        ),
        elapsedMinutes: context.elapsedMinutes,
        targetDuration: context.targetDuration,
      });

      for await (const chunk of stream) {
        const content = chunk.content?.toString() || '';
        if (content) {
          fullContent += content;
          yield content;
        }
      }

      const duration = Date.now() - startTime;

      this.logger.log(
        `流式生成完成：耗时=${duration}ms，长度=${fullContent.length}`,
      );

      return this.parseInterviewResponse(fullContent, context);
    } catch (error) {
      this.logger.log(`流式面试生成问题失败：${error.message}`, error.stack);
      throw error;
    }
  }
  parseInterviewResponse(
    content: string,
    context: {
      elapsedMinutes: number;
      targetDuration: number;
    },
  ): {
    question: string;
    shouldEnd: boolean;
    standardAnswer?: string;
    reasoning?: string;
  } {
    const shouldEnd = content.includes('[END_INTERVIEW]');

    let standardAnswer: string | undefined;
    let questionContent = content;

    // 使用正则表达式匹配标准答案部分，提取 [STANDARD_ANSWER] 到 [END_INTERVIEW] 或结束位置的内容
    const standardAnswerMatch = content.match(
      /\[STANDARD_ANSWER\]([\s\S]*?)(?=\[END_INTERVIEW\]|$)/,
    );

    // 如果匹配到了标准答案，提取并去除多余的空格
    if (standardAnswerMatch) {
      standardAnswer = standardAnswerMatch[1].trim();
      // 移除标准答案部分，只保留问题部分
      questionContent = content.split('[STANDARD_ANSWER]')[0].trim();
    }

    // 第 3 步：移除结束标记
    // 如果内容中有 [END_INTERVIEW]，去掉该标记，并进行清理
    questionContent = questionContent.replace(/\[END_INTERVIEW\]/g, '').trim();

    // 第 4 步：返回解析结果
    return {
      question: questionContent, // 提取的问题内容
      shouldEnd: shouldEnd, // 是否需要结束面试
      standardAnswer: standardAnswer, // 标准答案（如果存在）
      reasoning: shouldEnd
        ? `面试已达到目标时长（${context.elapsedMinutes}/${context.targetDuration}分钟）` // 如果结束，给出理由
        : undefined,
    };
  }
  formatConversationHistory(
    history: { role: 'interviewer' | 'candidate'; content: string }[],
  ): string {
    if (!history || history.length === 0) {
      return '(对话刚开始，这是候选人的自我介绍)';
    }

    return history
      .map((item, index) => {
        const role = item.role === 'interviewer' ? '面试官' : '候选人';

        return `${index + 1}. ${role}: ${item.content}`;
      })
      .join('\n\n');
  }

  /**
   * 生成面试开场白（非流式）
   * 该方法用于生成面试的开场白内容，根据面试官姓名、候选人姓名和职位名称动态生成问候语、职位信息和面试的开场提示。
   *
   * @param interviewerName - 面试官的姓名，用于问候候选人并提供称呼。
   * @param candidateName - 候选人的姓名（可选），如果提供，问候语中会使用候选人的名字；如果未提供，默认使用“你”。
   * @param positionName - 职位名称（可选），如果提供，开场白中会提到候选人申请的职位。
   *
   * @returns string - 返回生成的面试开场白内容，包含问候语、职位信息和自我介绍提示。
   */
  generateOpeningStatement(
    interviewerName: string,
    candidateName?: string,
    positionName?: string,
  ): string {
    // 第 1 步：生成问候语
    let greeting = candidateName ? `${candidateName}` : '你'; // 如果提供了候选人的名字，使用名字，否则使用“你”
    greeting += '好，我是你今天的面试官，你可以叫我'; // 构建问候语前半部分
    greeting += `${interviewerName}老师。\n\n`; // 添加面试官的名字，并以“老师”作为称呼

    // 第 2 步：如果提供了职位名称，添加职位相关信息
    if (positionName) {
      greeting += `我看到你申请的是${positionName}岗位。\n\n`; // 如果职位名称存在，提到候选人申请的岗位
    }

    // 第 3 步：生成面试的开始提示
    greeting +=
      '让我们开始今天的面试吧。\n\n' + // 提示面试开始
      '首先，请你简单介绍一下自己。自我介绍可以说明你的学历以及专业背景、工作经历以及取得的成绩等。'; // 提供自我介绍的指导

    // 第 4 步：返回生成的开场白内容
    return greeting;
  }

  /**
   * 生成面试结束语
   */
  generateClosingStatement(
    interviewerName: string,
    candidateName?: string,
  ): string {
    const name = candidateName || '候选人';
    return (
      `好的${name}，今天的面试就到这里。\n\n` +
      `感谢你的时间和精彩的回答。整体来看，你的表现不错。\n\n` +
      `我们会将你的面试情况反馈给用人部门，预计3-5个工作日内会给你答复。\n\n` +
      `如果有任何问题，可以随时联系HR。祝你一切顺利！\n\n` +
      `— ${interviewerName}老师`
    );
  }

  /**
   * 流式生成面试开场白（模拟打字机效果）
   * 该方法使用流式生成的方式逐步返回面试开场白的内容，并模拟打字机效果。每次返回一小段字符，并通过延迟模拟打字的过程。
   *
   * @param interviewerName - 面试官的姓名，用于问候候选人并提供称呼。
   * @param candidateName - 候选人的姓名（可选），如果提供，问候语中会使用候选人的名字；如果未提供，默认使用“你”。
   * @param positionName - 职位名称（可选），如果提供，开场白中会提到候选人申请的职位。
   *
   * @returns AsyncGenerator<string, string, undefined> - 返回一个异步生成器，逐块返回流式的开场白内容片段。
   * 每次返回3-8个字符，模拟打字机的效果。
   */
  async *generateOpeningStatementStream(
    interviewerName: string,
    candidateName?: string,
    positionName?: string,
  ): AsyncGenerator<string, string, undefined> {
    // 第 1 步：生成完整的开场白
    // 调用 generateOpeningStatement 方法生成完整的面试开场白内容
    const fullGreeting = this.generateOpeningStatement(
      interviewerName,
      candidateName,
      positionName,
    );

    // 第 2 步：按字符分块，每次返回3-8个字符，模拟打字效果
    const chunkSize = 5; // 每次返回的字符块大小，模拟打字机效果的节奏
    for (let i = 0; i < fullGreeting.length; i += chunkSize) {
      // 截取从索引 i 到 i+chunkSize 的字符块
      const chunk = fullGreeting.slice(i, i + chunkSize);
      yield chunk; // 返回当前字符块

      // 第 3 步：添加小延迟，模拟真实打字（可选）
      await new Promise((resolve) => setTimeout(resolve, 20)); // 模拟每个字符的间隔时间
    }

    // 第 4 步：返回完整的开场白（即使已经通过流式返回了部分内容）
    return fullGreeting;
  }

  async generateInterviewAssessmentReport(context): Promise<any> {
    try {
      const prompt = buildAssessmentPrompt(context);
      const promptTemplate = PromptTemplate.fromTemplate(prompt);

      const model = this.aiModelFactory.createDefaultModel();

      const parser = new JsonOutputParser();

      const chainWithParser = promptTemplate.pipe(model).pipe(parser);

      this.logger.log(
        `开始生成面试评估报告：type=${context.interviewType}, qaCount=${context.qaList.length}`,
      );

      const startTime = Date.now();

      const result: any = await chainWithParser.invoke({
        interviewType: context.inverviewType,
        company: context.company || '',
        positionName: context.positionName || '',
        jd: context.jd || '未提供',
        resumeContent: context.resumeContent,
        qaList: context.qaList
          .map(
            (qa, index) =>
              `问题${index + 1}: ${qa.question}\\n用户回答：${qa.answer}\\n回答长度: ${qa.answer.length}字\\n标准答案：${qa.standardAnswer || '无'}`,
          )
          .join('\\n\\n'),
        totalQuestions: context.qaList.length,
        // 如果有回答质量指标，也格式化成字符串
        qualityMetrics: context.answerQualityMetrics
          ? `\\n## 回答质量统计\\n- 总问题数: ${context.answerQualityMetrics.totalQuestions}\\n- 平均回答长度: ${context.answerQualityMetrics.avgAnswerLength}字\\n- 无效回答数: ${context.answerQualityMetrics.emptyAnswersCount}`
          : '',
      });

      const duration = Date.now() - startTime;
      this.logger.log(
        `评估报告生成完成：耗时=${duration}ms，overallScore=${result.overallScore}`,
      );

      // 4. 格式化并返回最终结果
      // 从AI返回的结果中提取关键信息，并为可能缺失的字段提供默认值，确保返回对象的结构稳定
      return {
        overallScore: result.overallScore || 75, // 综合得分
        overallLevel: result.overallLevel || '良好', // 综合评级
        overallComment: result.overallComment || '面试表现良好', // 综合评语
        radarData: result.radarData || [], // 能力雷达图数据
        strengths: result.strengths || [], // 优点
        weaknesses: result.weaknesses || [], // 缺点
        improvements: result.improvements || [], // 改进建议
        fluencyScore: result.fluencyScore || 80, // 表达流畅度得分
        logicScore: result.logicScore || 80, // 逻辑清晰度得分
        professionalScore: result.professionalScore || 80, // 专业知识得分
      };
    } catch (error) {
      // 5. 错误处理
      // 如果在生成过程中发生任何错误，记录详细的错误日志并抛出异常
      this.logger.error(`❌ 生成评估报告失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
