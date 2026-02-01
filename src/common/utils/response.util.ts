import { HttpStatus } from "@nestjs/common";


export class ResponseUtil {
  static success<T = any>(data: T, message: string = '操作成功', code : number = HttpStatus.OK) {
    return {
      code,
      message,
      data,
      timeStamp: new Date().toISOString(),
    };
  }

  static error<T = any>( message: string = '操作失败', code : number = HttpStatus.BAD_REQUEST, data: T) {
    return {
      code,
      message,
      data,
      timeStamp: new Date().toISOString(),
    };
  }

  static paginated<T = any>(data: T, pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }, message: string = '查询成功', code : number = HttpStatus.OK, ) {
    return {
      code,
      message,
      data,
      timeStamp: new Date().toISOString(),
    };
  }

  static list<T = any>(data: T, message: string = '查询成功', code : number = HttpStatus.OK) {
    return {
      code,
      message,
      data,
      timeStamp: new Date().toISOString(),
    };
  }

  static empty<T = any>(message: string = '暂无数据', code : number = HttpStatus.OK) {
    return {
      code,
      message,
      data: null,
      timeStamp: new Date().toISOString(),
    };
  }
}