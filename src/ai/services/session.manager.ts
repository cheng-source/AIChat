import { Injectable, Logger } from "@nestjs/common";
import { Message, SessionData } from "../interfaces/message.interface";
import {v4 as generateUUID} from 'uuid';

@Injectable()
export class SessionManager {
    private readonly logger = new Logger(SessionManager.name);

    private sessions = new Map<string, SessionData>();

    createSession(userId: string, position: string, systemMessage: string): string {
        const sessionId = generateUUID();
        const sessionData: SessionData = {
            sessionId,
            userId,
            position,
            messages: [
                {role: 'system', content: systemMessage}
            ],
            createAt: new Date(),
            lastActivityAt: new Date()
        };
        this.sessions.set(sessionId, sessionData);
        this.logger.log(`创建新会话: ${sessionId} 用户: ${userId} 职位: ${position}`);
        return sessionId;
    }

    addMessage(sessionId: string, role:  'user' | 'assistant', content: string): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            this.logger.warn(`尝试向不存在的会话添加消息: ${sessionId}`);
            throw new Error('会话不存在');
        }
        session.messages.push({role, content});
        session.lastActivityAt = new Date();
        this.logger.log(`向会话 ${sessionId} 添加消息 角色: ${role}`);
    }

    getHistory(sessionId: string): Message[] {
        const session = this.sessions.get(sessionId);
        return session?.messages || [];
    }

    getRecentSessions(sessionId: string, count: number = 10): Message[] {
        const history = this.getHistory(sessionId);
        if (history.length === 0) return [];

        const systemMessage = history[0];

        const recentMessages = history.slice(-count);

        if (recentMessages[0].role !== 'system') {
            return [systemMessage, ...recentMessages];
        }
        return recentMessages;
    }

    endSession(sessionId: string): void {
        if (this.sessions.has(sessionId)) {
            this.sessions.delete(sessionId);
            this.logger.log(`会话结束: ${sessionId}`);
        }
    }

    cleanupExpiredSessions(): void {
        const now = new Date();
        const expirationTime = 60 * 60 * 1000;

        for (const [sessionId, session] of this.sessions.entries()) {
            if (now.getTime() - session.lastActivityAt.getTime() > expirationTime) {
                this.logger.log(`清理过期结束: ${sessionId}`)
                this.sessions.delete(sessionId);
            }
        }
    }
}