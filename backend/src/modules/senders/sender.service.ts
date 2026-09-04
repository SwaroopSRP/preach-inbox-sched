import { prisma } from '../../lib/prisma.js';
import { CreateSenderInput } from './sender.schema.js';
import { AppError } from '../../middleware/error.middleware.js';

export async function listSenders(userId: string) {
  return prisma.sender.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getSenderById(senderId: string, userId: string) {
  const sender = await prisma.sender.findFirst({
    where: { id: senderId, userId },
  });

  if (!sender) {
    throw new AppError(404, 'Sender not found or not owned by user');
  }

  return sender;
}

export async function createSender(userId: string, input: CreateSenderInput) {
  const existing = await prisma.sender.findUnique({
    where: {
      userId_email: {
        userId,
        email: input.email,
      },
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.sender.create({
    data: {
      userId,
      email: input.email,
      name: input.name,
    },
  });
}
