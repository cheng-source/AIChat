import { Body, Controller, Post, Request, UseGuards } from "@nestjs/common";
import { InterviewService } from "./services/interview.service";
import { ResponseUtil } from "src/common/utils/response.util";
import { JwtAuthGuard } from "src/auth/jwt.auth.guard";

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
}