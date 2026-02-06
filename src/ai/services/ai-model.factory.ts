import { ChatDeepSeek } from "@langchain/deepseek";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AiModelFactory {
    private readonly logger = new Logger(AiModelFactory.name);

    constructor(private configService: ConfigService) {};

    createDefaultModel(): ChatDeepSeek {
        const apiKey = this.configService.get<string>('DEEPSEEK_API_KEY');
        if (!apiKey) {
            this.logger.warn('DEEPSEEK_API_KEY 不存在');
        }

        return new ChatDeepSeek({
            apiKey: apiKey || '',
            model: this.configService.get<string>('DEEPSEEK_MODEL') || 'deepseek-chat',
            temperature: Number(this.configService.get<number>('DEEPSEEK_TEMPERATURE') || 0.7),
            maxTokens: Number(this.configService.get<number>('DEEPSEEK_MAX_TOKENS') || 4000),
        })
    };

    createStableModel(): ChatDeepSeek {
        const baseModel = this.createDefaultModel();
        return new ChatDeepSeek({
            apiKey: this.configService.get<string>('DEEPSEEK_API_KEY') || '',
            model: baseModel.model,
            temperature: 0.3,
            maxTokens: 4000,
        })
    }

    createCreativeModel(): ChatDeepSeek {
        const baseModel = this.createDefaultModel();
        return new ChatDeepSeek({
            apiKey: this.configService.get<string>('DEEPSEEK_API_KEY') || '',
            model: baseModel.model,
            temperature: 0.8,
            maxTokens: 4000,
        })
    }
    
}