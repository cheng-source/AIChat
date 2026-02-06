import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from './schemas/user.schemas';
import { Model } from 'mongoose';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import {
  ConsumptionRecord,
  ConsumptionRecordDocument,
} from '../interview/schemas/consumption-record.schema';
import { UserConsumption, UserConsumptionDocument } from './schemas/consumption-record.schema';
import { UpdateUserDto } from './dto/update.dto';
@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
   private readonly JwtService: JwtService,
   @InjectModel(ConsumptionRecord.name)
   private conpsumptionRecordModel: Model<ConsumptionRecordDocument>,
   @InjectModel(UserConsumption.name)
  private consumptionModel: Model<UserConsumptionDocument>,

  ) {}
  // 注册
  async register(register: RegisterDto) {
    const {username, email, password} = register;
    const exitingUser = await this.userModel.findOne({ $or: [{username}, {email}]})
    if (exitingUser) {
      throw new BadRequestException('用户名或邮箱已存在');
    }
    const newUser = new this.userModel({username, email, password});
    await newUser.save();
    const result = newUser.toObject() as any;
    delete result.password;
    return result;
  }
  // 登录
  async login(loginDto: LoginDto) {
    const {email, password} = loginDto;

    const user = await this.userModel.findOne({email}) as UserDocument;
    if (!user) {
      throw new UnauthorizedException('邮箱或密码不正确');
    }
    const isPasswordValid = await user.comparePassword(password) ;
    if (!isPasswordValid) {
      throw new UnauthorizedException('邮箱或密码不正确');
    }
    const token = this.JwtService.sign({
      userId: user._id.toString(),
      username: user.username,
      email: user.email
    });

    const userInfo = user.toObject() as any;

    delete userInfo.password;

    return {
      token,
      user: userInfo
    }
  }
  // 获取用户信息
  async getUserInfo(userId: string) {
    const user = await this.userModel.findById(userId).lean() as any;
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    delete user.password;
    return user;
  }

    /**
   * 创建消费记录
   */
  async createConsumptionRecord(
    userId: string,
    type: string,
    quantity: number = 1,
    source: string = 'free',
    relatedId?: string,
  ) {
    const record = new this.conpsumptionRecordModel({
      userId,
      type,
      quantity,
      source,
      relatedId,
    });

    return await record.save();
  }

  async getUserConsumptionRecords(userId: string, options?: {skip?: number; limit?: number}) {
    const skip = options?.skip || 0;
    const limit = options?.limit || 20;
    // 查询消费记录，按创建时间降序排列，跳过skip条记录，限制返回limit条记录
    const records = await this.conpsumptionRecordModel
      .find({ userId }) // 根据用户ID查询消费记录
      .sort({ createdAt: -1 }) // 按照创建时间降序排列，最新的记录排在前面
      .skip(skip) // 跳过指定数量的记录
      .limit(limit) // 限制返回的记录数量
      .lean(); // 使用lean()优化查询结果，返回普通的JavaScript对象而不是Mongoose文档

    const stats = await this.conpsumptionRecordModel.aggregate([
      { $match: { userId } }, // 过滤出属于当前用户的消费记录
      {
        $group: {
          // 按照消费类型进行分组
          _id: '$type', // 按消费类型进行分组
          count: { $sum: 1 }, // 统计每种类型的消费记录数量
          successCount: {
            $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }, // 统计状态为'success'的记录数
          },
          failedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }, // 统计状态为'failed'的记录数
          },
          totalCost: { $sum: '$estimatedCost' }, // 计算每种类型的消费总额
        },
      },
    ])
    // 返回查询的消费记录和消费统计信息
    return {
      records, // 用户的消费记录
      stats, // 按消费类型分组后的统计信息
    };
  
  }

    async updateUser(userId: string, updateUserDto: UpdateUserDto) {
    // 如果更新邮箱，检查邮箱是否已被使用
    if (updateUserDto.email) {
      const existingUser = await this.userModel.findOne({
        email: updateUserDto.email,
        _id: { $ne: userId }, // 排除当前用户
      });

      if (existingUser) {
        throw new BadRequestException('邮箱已被使用');
      }
    }

    const user = await this.userModel.findByIdAndUpdate(userId, updateUserDto, {
      new: true,
    }) as any;

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    delete user.password;
    return user;
  }
}
