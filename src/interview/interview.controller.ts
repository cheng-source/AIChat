import { Body, Controller, Post, Request, Res, UseGuards } from "@nestjs/common";
import { InterviewService } from "./services/interview.service";
import { ResponseUtil } from "src/common/utils/response.util";
import { JwtAuthGuard } from "src/auth/jwt.auth.guard";
import { ResumeQuizDto } from "./dto/resume-quiz-dto";
import type { Response } from "express";
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
        @Body() body: {position: string, resume: string, jobDescription: string}, 
        @Request() req
    ) {
        const result = await this.interViewService.analyzeResume(req.user.userId, body.position,body.resume, body.jobDescription);

        return {
            code: 200,
            data: result
        }
    }

    @Post('/continue-conversation') 
    @UseGuards(JwtAuthGuard)
    async continueConversation(@Body() body: {
        sessionId: string,
        question: string
    }) {
        const result = await this.interViewService.continueConversation(body.sessionId, body.question);
        return {
            code: 200,
            data: {
                response: result
            }
        }
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
      
      const subscription = this.interViewService.generateResumeQuizWithProgress(userId, dto).subscribe({
        next: (event) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        },
        error: (error) => {
          res.write(`data: ${JSON.stringify({
            type: 'error',
            error: error.message
          })}\n\n`)
          res.end();
        },
        complete: () => {
          res.end();
        }
      })

      res.on('close', () => {
        subscription.unsubscribe();
      })
    }
}