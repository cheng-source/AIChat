import { Body, Controller, Get, Post, Put, Query, Request, Res, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { ResponseUtil } from 'src/common/utils/response.util';
import { RegisterDto } from './dto/register.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { Public } from 'src/auth/public.decorator';
import { UpdateUserDto } from './dto/update.dto';

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

    @Put('profile')
  async updateUserProfile(
    @Request() req: any,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const { userId } = req.user;
    const user = await this.userService.updateUser(userId, updateUserDto);
    return ResponseUtil.success(user, '更新成功');
  }

    /**
   * 获取用户消费记录（包括简历押题、专项面试、综合面试）
   */
  @Get('consumption-records')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '获取用户消费记录',
    description:
      '获取用户所有的功能消费记录，包括简历押题、专项面试、综合面试等',
  })
  async getUserConsumptionRecords(
    @Request() req: any,
    @Query('skip') skip: number = 0,
    @Query('limit') limit: number = 20,
  ) {
    const { userId } = req.user;
    const result = await this.userService.getUserConsumptionRecords(userId, {
      skip,
      limit,
    });
    return ResponseUtil.success(result, '获取成功');
  }

}
