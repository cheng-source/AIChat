import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
@Schema({ timestamps: true })
export class Resume {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  fileName: string;

  @Prop({ required: true })
  objectName?: string;

  @Prop({ required: true })
  fileUrl: string;

  @Prop({ required: true })
  fileSize?: string;

  @Prop({ required: true })
  fileType: string;

  @Prop()
  createdAt: Date;
}

export const ResumeSchema = SchemaFactory.createForClass(Resume);
