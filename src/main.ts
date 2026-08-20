import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import express from 'express';
import { existsSync } from 'fs';
import { dirname, isAbsolute, join, normalize } from 'path';
import { AppModule } from './app.module';
import mongooseConnect from './mongoose/mongoose';
import { HttpErrorLoggingFilter } from '@/http-logger/HTTPLogger';

async function bootstrap() {
  await mongooseConnect(async () => {
    console.log(`Connected to ${process.env.DB_NAME} database`);
  });

  const app = await NestFactory.create(AppModule, { rawBody: true });
  const port = process.env.PORT ?? 3000;
  const corsOrigin = process.env.CORS_ORIGIN?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(compression());

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
  app.useGlobalFilters(new HttpErrorLoggingFilter());

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

  const sitemapOutputPath = 'sitemaps/tenders-sitemap.xml';
  const sitemapOutputAbsolutePath = isAbsolute(sitemapOutputPath)
    ? normalize(sitemapOutputPath)
    : join(process.cwd(), sitemapOutputPath);
  const sitemapOutDir = dirname(sitemapOutputAbsolutePath);
  const adminDir = join(process.cwd(), 'admin');
  const adminIndexPath = join(adminDir, 'index.html');
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('query parser', 'extended');

  expressApp.use(
    '/sitemaps',
    express.static(sitemapOutDir, {
      extensions: ['xml'],
      fallthrough: true,
      index: false,
      setHeaders: (res) => {
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader(
          'Cache-Control',
          'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
        );
      },
    }),
  );

  if (existsSync(adminIndexPath)) {
    expressApp.use('/admin', express.static(adminDir));
    expressApp.get(/^\/admin(?:\/.*)?$/, (_req, res) => {
      res.sendFile(adminIndexPath);
    });
  } else {
    expressApp.get(/^\/admin(?:\/.*)?$/, (_req, res) => {
      res.status(503).send('Admin app is missing (admin/index.html not found).');
    });
  }

  await app.listen(port, () => {
    console.log(`Server ran on :${port}`);
    console.log(`Swagger docs: http://localhost:${port}/swagger`);
    console.log(`Admin app: http://localhost:${port}/admin`);
  });
}

bootstrap();
