import { Injectable } from "@nestjs/common";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {

  constructor(private readonly configService: ConfigService) {
    super({
      // 从请求头的Authorization字段提取JWT，格式为Bearer <token>
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // 不忽视JWT的过期时间（默认为false）
      ignoreExpiration: false,
      // JWT的密钥，用于验证JWT的签名
      secretOrKey: configService.get<string>('JWT_SECRET') || 'secretKey',
    })
  }
  validate(payload: any): unknown {
    return {
      userId: payload.userId,
      username: payload.username,
      email: payload.email,
    }
  }

}