import { PromptTemplate } from "@langchain/core/prompts";
import { Injectable, Logger } from "@nestjs/common";
import { AiModelFactory } from "src/ai/services/ai-model.factory";
import { RESUME_ANALYSIS_PROMPT } from "../prompts/resume.quiz.prompts";
import { JsonOutputParser } from "@langchain/core/output_parsers";

@Injectable()
export class ResumeAnalysisService {
    private readonly logger = new Logger(ResumeAnalysisService.name);
    constructor(private aiModelFactory: AiModelFactory) {}

    async analyze(resumeContent: string, jobDescription: string) {

        const propmt = PromptTemplate.fromTemplate(RESUME_ANALYSIS_PROMPT);
        const model = this.aiModelFactory.createDefaultModel();

        const parser = new JsonOutputParser();

        const chain = propmt.pipe(model).pipe(parser);

        try {
            this.logger.log('开始分析简历');

            const result = chain.invoke({
                resume_content: resumeContent,
                job_description: jobDescription
            })
            this.logger.log('简历分析完成')
            return result;
        } catch (error) {
            this.logger.log('简历分析失败', error);
            throw error;
        }
    }
}