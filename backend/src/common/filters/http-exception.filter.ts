import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Error interno del servidor.';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const responseBody = exception.getResponse();
      message =
        typeof responseBody === 'string'
          ? responseBody
          : (responseBody as any).message || exception.message;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      this.logger.error(
        `${request.method} ${request.url} — Prisma ${exception.code}`,
        exception.stack,
      );

      const TRANSIENT_CODES = [
        'P1001',
        'P1002',
        'P1003',
        'P1008',
        'P1010',
        'P1011',
        'P1012',
        'P1013',
        'P1015',
        'P1017',
        'P2024',
      ];

      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = 'Ya existe un registro con estos datos.';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'El registro solicitado no existe.';
      } else if (['P2003', 'P2007', 'P2014'].includes(exception.code)) {
        status = HttpStatus.BAD_REQUEST;
        message = 'La operación no pudo completarse.';
      } else if (TRANSIENT_CODES.includes(exception.code)) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        message =
          'Servicio no disponible temporalmente. Intenta nuevamente.';
      } else {
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        message = 'Error interno del servidor.';
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception.stack,
      );
    }

    response.status(status).json({
      statusCode: status,
      message: Array.isArray(message) ? message : [message],
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
