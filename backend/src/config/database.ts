import { PrismaClient } from '@prisma/client';
import { env } from './env';

// Singleton de PrismaClient para reutilizar el pool de conexiones en toda la aplicación
export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
