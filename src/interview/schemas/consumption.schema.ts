import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { SchemaTypes, Types } from "mongoose";
import { User } from "src/user/schemas/user.schemas";


export type ConsumptionRecordDocument = ConsumptionRecord & Document;

export enum ConsumptionType {
  RESUME_QUIZ = 'resume_quiz',
  SPECAIL_INTERVIEW = 'special_interview',
  BEHAVIOR_INTERVIEW = 'behavior_interview',
  AI_INTERVIEW = 'ai_interview',
}

export enum ConsumptionStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}
@Schema()
export class ConsumptionRecord {

  @Prop({required: true, unique: true})
  recordId: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true
  })
  user: Types.ObjectId;

  @Prop({required: true, index: true})
  userId: string;

  @Prop({required: true, enum: ConsumptionType, index: true})
  type: ConsumptionType;

  @Prop({
    required: true,
    enum: ConsumptionStatus,
    default: ConsumptionStatus.PENDING
  })
  status: ConsumptionStatus;

  @Prop({required: true})
  consumedCount: number;

  @Prop()
  description?: string;

  @Prop()
  createAt: Date;

  @Prop({type: SchemaTypes.Mixed})
  inputData?: Record<string, any>;

  @Prop({type: SchemaTypes.Mixed})
  outputData?: Record<string, any>;

  @Prop()
  aiModel?: string;

  @Prop()
  promptTokens?: number;

  @Prop()
  completionTokens?: number;

  @Prop()
  totalTokens?: number;
  
  @Prop()
  estimatedCost?: number;

  @Prop()
  aiResponseTime: number;

  @Prop({default: Date.now})
  startedAt: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  failedAt?: Date;

  @Prop()
  errorMessage?: string;

  @Prop()
  errorStack?: string;

  @Prop({default: false})
  isRefunded: boolean;

  @Prop()
  refundedAt?: Date;

  @Prop({type: SchemaTypes.Mixed})
  metaData?: Record<string, any>;

  @Prop()
  requestId: string;

  @Prop()
  userAgent?: string;

  @Prop()
  ipAddress?: string;
}

export const ConsumptionRecordSchema = SchemaFactory.createForClass(ConsumptionRecord);

ConsumptionRecordSchema.index({ userId: 1, type: 1, createAt: -1 });
ConsumptionRecordSchema.index({ userId: 1, status: 1})
ConsumptionRecordSchema.index({ requestId: 1 }, { sparse: true });