import { PrismaClient } from '@prisma/client';

// 서버리스 웜 인스턴스에서 커넥션 재사용 (커넥션 고갈 방지)
const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
