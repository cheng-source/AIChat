import { PromptTemplate } from "@langchain/core/prompts";
import { Injectable, Logger } from "@nestjs/common";
import { Message } from "src/ai/interfaces/message.interface";
import { AiModelFactory } from "src/ai/services/ai-model.factory";
import { CONVERSATION_CONTINUATION_PROMPT } from "../prompts/resume.quiz.prompts";

@Injectable()
export class ConversationContinueService {
    private readonly logger = new Logger(ConversationContinueService.name);

    constructor(private aiModelFactory: AiModelFactory) {};

    async continue(history: Message[]): Promise<string> {
        const prompt = PromptTemplate.fromTemplate(CONVERSATION_CONTINUATION_PROMPT);

        const model = this.aiModelFactory.createDefaultModel();

        const chain = prompt.pipe(model);

        try {
            this.logger.log(`继续对话,历史消息数: ${history.length}`);
            const response = await chain.invoke({
                history: history.map((m) => `${m.role}: ${m.content}`).join('\n\n'),
            });

            const aiResponse = response.content as string;

            this.logger.log('对话继续完成');
            return aiResponse;
        } catch (error) {
            this.logger.log(`继续对话失败: `, error);
            throw error;
        }
    }
}