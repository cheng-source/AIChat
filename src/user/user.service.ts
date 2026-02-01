import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from './user.schemas';
import { Model } from 'mongoose';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class UserService {
  constructor(@InjectModel(User.name) private userModel: Model<User>, private readonly JwtService: JwtService) {}

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
}
