import { Module } from "@nestjs/common";
import { AiModelFactory } from "./services/ai-model.factory";
import { SessionManager } from "./services/session.manager";

@Module({
    providers: [AiModelFactory, SessionManager],
    exports: [AiModelFactory,SessionManager],
})
export class AIModule{}