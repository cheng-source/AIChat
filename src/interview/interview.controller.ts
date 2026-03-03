import {
  Body,
  Controller,
  Param,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { InterviewService } from './services/interview.service';
import { ResponseUtil } from 'src/common/utils/response.util';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { ResumeQuizDto } from './dto/resume-quiz-dto';
import type { Response } from 'express';
import {
  AnswerMockInterviewDto,
  StartMockInterviewDto,
} from './dto/mock-interview.dto';
@Controller('interview')
export class InterviewController {
  constructor(private interViewService: InterviewService) {}

  // async analyzeResume(@Body() body: {resume: string, jobDescription: string}) {
  //     const result = await this.interViewService.analyzeResume(body.resume, body.jobDescription);

  //     return ResponseUtil.success(result, '简历分析完成');
  // }

  @Post('/analyze-resume')
  @UseGuards(JwtAuthGuard)
  async analyzeResume(
    @Body() body: { position: string; resume: string; jobDescription: string },
    @Request() req,
  ) {
    const result = await this.interViewService.analyzeResume(
      req.user.userId,
      body.position,
      body.resume,
      body.jobDescription,
    );

    return {
      code: 200,
      data: result,
    };
  }

  @Post('/continue-conversation')
  @UseGuards(JwtAuthGuard)
  async continueConversation(
    @Body() body: { sessionId: string; question: string },
  ) {
    const result = await this.interViewService.continueConversation(
      body.sessionId,
      body.question,
    );
    return {
      code: 200,
      data: {
        response: result,
      },
    };
  }

  @Post('resume/quiz/stream')
  @UseGuards(JwtAuthGuard)
  async resumeQuizStream(
    @Body() dto: ResumeQuizDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const userId = req.user.userId;
    res.setHeader('Content-Type', 'text-event-stream');
    res.setHeader('Cache-control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const subscription = this.interViewService
      .generateResumeQuizWithProgress(userId, dto)
      .subscribe({
        next: (event) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        },
        error: (error) => {
          res.write(
            `data: ${JSON.stringify({
              type: 'error',
              error: error.message,
            })}\n\n`,
          );
          res.end();
        },
        complete: () => {
          res.end();
        },
      });

    res.on('close', () => {
      subscription.unsubscribe();
    });
  }

  @Post('mock/start')
  @UseGuards(JwtAuthGuard)
  async startMockInterview(
    @Body() dto: StartMockInterviewDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const userId = req.user.userId;

    res.status(200);
    res.setHeader('Content-type', 'text/event-stream; charset-utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.write(': connected\n\n');

    if (typeof (res as any).flush === 'function') {
      (res as any).flush();
    }

    const subscription = this.interViewService
      .startMockInterviewWithStream(userId, dto)
      .subscribe({
        next: (event) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
        },

        error: (error) => {
          res.write(
            `data: ${JSON.stringify({
              type: 'error',
              error: error.message,
            })}\n\n`,
          );
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
          res.end();
        },

        complete: () => {
          res.end();
        },
      });

    res.on('close', () => {
      subscription.unsubscribe();
    });
  }

  @Post('mock/answer')
  @UseGuards(JwtAuthGuard)
  async answerMockInterview(
    @Body() dto: AnswerMockInterviewDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const userId = req.user.userId;

    res.status(200);
    res.setHeader('Content-type', 'text/event-stream; charset-utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.write(': connected\n\n');

    if (typeof (res as any).flush === 'function') {
      (res as any).flush();
    }

    const subscription = this.interViewService
      .answerMockInterviewWithStream(userId, dto.sessionId, dto.answer)
      .subscribe({
        next: (event) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
        },

        error: (error) => {
          res.write(
            `data: ${JSON.stringify({
              type: 'error',
              error: error.message,
            })}\n\n`,
          );
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
          res.end();
        },

        complete: () => {
          res.end();
        },
      });

    res.on('close', () => {
      subscription.unsubscribe();
    });
  }

  @Post('mock/end/:resultId')
  @UseGuards(JwtAuthGuard)
  async endMockInterview(
    @Param('resultId') resultId: string,
    @Request() req: any,
  ) {
    await this.interViewService.endMockInterview(req.user.userId, resultId);

    return ResponseUtil.success({ resultId }, '面试已结束，正在生成分析报告');
  }

  @Post('mock/pause/:resultId')
  @UseGuards(JwtAuthGuard)
  async pauseMockInterview(
    @Param('resultId') resultId: string,
    @Request() req: any,
  ) {
    const result = await this.interViewService.pauseMockInterview(
      req.user.userId,
      resultId,
    );

    return ResponseUtil.success({ resultId }, '面试已暂停，进度已保存');
  }
  @Post('mock/resume/:resultId')
  @UseGuards(JwtAuthGuard)
  async resumeMockInterview(
    @Param('resultId') resultId: string,
    @Request() req: any,
  ) {
    const result = this.interViewService.resumeMockInterview(
      req.user.userId,
      resultId,
    );

    return ResponseUtil.success({ resultId }, '面试已恢复，可以继续回答');
  }

  @Post('anlysis/report/:resultId')
  @UseGuards(JwtAuthGuard)
  async getAnalysisReport(
    @Param('resultId') resultId: string,
    @Request() req: any,
  ) {
    const report = await this.interViewService.getAnalysisReport(
      req.user.userId,
      resultId,
    );

    return ResponseUtil.success(report, '查询成功');
  }
}
