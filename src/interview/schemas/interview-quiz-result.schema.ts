import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { SchemaType, SchemaTypes, Types } from "mongoose";

export enum QuestionDifficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard'
}

export enum QuestionCategory {
  TECHNICAL = 'technical',
  PROJECT = 'project',
  PROBLEM_SOLVING = 'problem-solving',
  SOFT_SKILL = 'soft-skill',
  BEHAVIORAL = 'behavioral',
  SCENARIO = 'scenario'
} 

@Schema({_id: false})
export class InterviewQuestion {

  @Prop({required: true})
  question: string;

  @Prop({required: true})
  answer: string;

  @Prop({enum: QuestionCategory, required: true})
  category: QuestionCategory;

  @Prop({enum: QuestionDifficulty, required: true})
  difficulty: QuestionDifficulty;

  @Prop()
  tips?: string;

  @Prop({type: [String], default: []})
  keywords: string[];

  @Prop()
  reasoning?: string;

  @Prop({default: false})
  isFavorite?: boolean

  @Prop({default: false})
  isPracticed?: boolean;

  @Prop()
  practicedAt?: Date;

  @Prop()
  userNote?: string;
}

export const InterviewQuestionSchema = SchemaFactory.createForClass(InterviewQuestion);


@Schema({_id: false})
export class SkillMatch {
  @Prop({required: true})
  skill: string;

  @Prop({required: true})
  matched: boolean;

  @Prop()
  proficiency?: string
}

export const  SkillMatchSchema = SchemaFactory.createForClass(SkillMatch);

@Schema({_id: false})
export class LearningPriority {
  @Prop({required: true})
  topic: string;

  @Prop({required: true, enum: ['high', 'medium', 'low']})
  priority: string;

  @Prop({required: true})
  reason: string
}

export const LearningPrioritySchema = SchemaFactory.createForClass(LearningPriority);

/**
 * 雷达图维度数据
 */
@Schema({ _id: false })
export class RadarDimension {
  @Prop({ required: true })
  dimension: string; // 维度名称（如：技术能力、沟通能力等）

  @Prop({ required: true, type: Number, min: 0, max: 100 })
  score: number; // 得分 (0-100)

  @Prop()
  description?: string; // 维度说明
}

export const RadarDimensionSchema =
  SchemaFactory.createForClass(RadarDimension);

@Schema({timestamps: true})
export class ResumeQuizResult {
  @Prop({required: true, unique: true})
  resultId: string;

  @Prop({type: SchemaTypes.ObjectId, ref: 'user', required: true, index: true})
  user: Types.ObjectId;

  @Prop({required: true, index: true})
  userId: string

  @Prop()
  resumeId?: string;

  @Prop({required: true})
  company: string

  @Prop({required: true})
  position: string;

  @Prop()
  salaryRange?: string;

  @Prop({type: String})
  jobDescription?: string;

  @Prop({type: String})
  resumeSnapshot?: string;
  
  @Prop({type: [InterviewQuestionSchema], default: []})
  questions: InterviewQuestion[];

  @Prop()
  totalQuestions?: number;

  @Prop()
  summary?: string;

  @Prop({type: Number, min: 0, max: 100})
  matchScore?: number;

  @Prop()
  matchLevel?: string;

  @Prop({type: [SkillMatchSchema], default: []})
  matchedSkill?: SkillMatch[];

  @Prop({type: [String], default: []})
  missingSkills?: string[];

  @Prop({type: [String], default: [] })
  knowledgeGaps?: string[];

  @Prop({type: [LearningPrioritySchema], default: []})
  learningPriorities?: LearningPriority[];

  @Prop({type: [RadarDimensionSchema], default: []})
  radarData?: RadarDimension[];

  @Prop({type: [String], default: []})
  strengths?: string[];

  @Prop({type: [String], default: []})
  weaknesses?: string[];

  @Prop({type: [String], default: []})
  interviewTips?: string[];

  @Prop({type: SchemaTypes.Mixed})
  questionDistribution?: Record<string, number>;

  @Prop({default: 0})
  viewCount?: number;

  @Prop()
  lastViewedAt?: Date;

  @Prop({type: Number, min: 1, max: 5})
  rating?: number;

  @Prop()
  feedback?: string;

  @Prop()
  ratedAt: Date;

  @Prop({default: false})
  isArchived: boolean; // 是否归档

  @Prop()
  archivedAt?: Date

  @Prop({default: false})
  isShared: boolean;

  @Prop()
  sharedAt?: Date;

  @Prop()
  shareUrl?: string;

  @Prop({index: true})
  consumptionRecordId?: string;

  @Prop({type: SchemaTypes.Mixed})
  metadata?: Record<string, any>;

  @Prop()
  aiModel?: string;

  @Prop()
  promptVersion?: string;
}

export const ResumeQuizResultSchema = SchemaFactory.createForClass(ResumeQuizResult);

ResumeQuizResultSchema.index({userId: 1, createAt: -1})
ResumeQuizResultSchema.index({userId: 1, company: 1})
ResumeQuizResultSchema.index({userId: 1, isArchived: -1})

export type ResumeQuizResultDocument = ResumeQuizResult & Document;
