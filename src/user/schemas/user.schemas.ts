import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import bcrypt from 'bcryptjs'
import { Document } from "mongoose";
@Schema({timestamps: true})
export class User {
  
  @Prop({required: true})
  username: string;

  @Prop()
  wechatId: string;

  @Prop({required: false})
  email?:  string;

  @Prop({required: false})
  phone: string;

  @Prop()
  avatar?: string;

  @Prop({default: ['user']})
  roles: string[];

  @Prop()
  password: string;

  @Prop()
  realName: string; 

  @Prop({enum: ['male', 'femail', 'other'], default: 'other'})
  gender?: 'mail' | 'femail' | 'other';

  @Prop()
  idCard?: string

  @Prop()
  isVerified: boolean;

  @Prop()
  birthDate: Date;

  @Prop({default: false})
  isVip: boolean;

  @Prop()
  vipExpireTime: Date;

  @Prop({default: 0})
  aiInterviewRemainingCount: number;

  @Prop({default: 0})
  aiInterviewRemainingMinutes: number;

  @Prop({default: 0})
  wwCoinBalance: number;

  @Prop({default: 0})
  resumeRemainingCount: number;

  @Prop({default: 0})
  specialRemainingCount: number;

  @Prop({default: 0})
  behaviorRemainingCount: number;

  @Prop()
  lastLoginLocation?: string;

  @Prop()
  lastLoginTime: string;

  @Prop()
  openid?: string;

  @Prop()
  unionid?: string;

  @Prop()
  wechatNickname?: string;

  @Prop()
  wechatAvatar?:string;

  @Prop({default: false})
  isWechatBound: boolean;

  @Prop()
  wechatBoundTime?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.pre('save', async function() {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  if (this.password) {
    this.password = await bcrypt.hash(this.password, salt);
  }
})

export type UserDocument = User & Document & {
  comparePassword(candidatePassword: string): Promise<boolean>;
}

UserSchema.methods.comparePassword= async function(candidatePassword: string) {
  return await bcrypt.compare(candidatePassword, this.password);
}