import { Body, Controller, Get, Post, Request, Res, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { ResponseUtil } from 'src/common/utils/response.util';
import { RegisterDto } from './dto/register.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { Public } from 'src/auth/public.decorator';

@ApiTags('用户')
@Controller('user')
@UseGuards(JwtAuthGuard)
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
  @Public()
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    const result = await this.userService.register(registerDto);
    return ResponseUtil.success(result, '注册成功');
  }
  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    const result = await this.userService.login(loginDto);
    return ResponseUtil.success(result, '登录成功');
  }

  @Get('info')
  async getUserInfo(@Request() req: any) {
    const {userId } = req.user;
    const userInfo = await this.userService.getUserInfo(userId);
    return ResponseUtil.success(userInfo, '获取用户信息成功');
  }
}
