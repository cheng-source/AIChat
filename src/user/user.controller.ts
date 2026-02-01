import { Body, Controller, Post, Res } from '@nestjs/common';
import { UserService } from './user.service';
import { ResponseUtil } from 'src/common/utils/response.util';
import { RegisterDto } from './dto/register.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';

@ApiTags('用户')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiOperation({
    summary: '用户注册',
    description: '用户注册接口，提供用户名、邮箱和密码进行注册',
  })
  @ApiResponse({
    status: 200,
    description: '注册成功',
  })
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    const result = await this.userService.register(registerDto);
    return ResponseUtil.success(result, '注册成功');
  }

  @Post('login') 
  async login(@Body() loginDto: LoginDto) {
    const result = await this.userService.login(loginDto);
    return ResponseUtil.success(result, '登录成功');
  }
}
