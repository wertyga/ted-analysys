import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import mongooseConnect from './mongoose/mongoose';
import { isDev } from './utils';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3000;
  const corsOrigin = process.env.CORS_ORIGIN?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigin?.length ? corsOrigin : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('TED Tender Search API')
    .setDescription(
      'Backend-for-frontend API for TED tender search, CPV lookup, and raw TED debug endpoints.',
    )
    .setVersion('1.0')
    .addTag('tenders', 'Frontend-facing tender search endpoints')
    .addTag('cpv', 'Frontend-facing CPV lookup endpoints')
    .addTag('ted', 'Raw TED Search API debug endpoints')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('swagger', app, swaggerDocument);

  await app.listen(port, () => {
    if (isDev) {
      console.log(`Server ran on :${port}`);
      console.log(`Swagger docs: http://localhost:${port}/swagger`);
    }

    mongooseConnect(() => {
      console.log(`Connected to ${process.env.DB_NAME} database`);
    });

    (async function () {})();
  });
}

bootstrap();
