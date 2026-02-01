import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './user.schemas';
import { Model } from 'mongoose';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class UserService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

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
}
