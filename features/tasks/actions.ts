'use server';

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import z from 'zod';
import { createTaskSchema } from './schema';
import { db } from '@/db/drizzle';
import { task } from '@/db/schema';
import { revalidatePath } from 'next/cache';

export async function createTask(values: z.infer<typeof createTaskSchema>) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || !session.user) {
    throw new Error('Unauthorized');
  }

  try {
    const [newTask] = await db
      .insert(task)
      .values({
        title: values.title,
        dueDate: values.dueDate,
        order: values.order,
        projectId: values.projectId,
        statusId: values.statusId,
      })
      .returning();

    revalidatePath(`/projects/${values.projectId}`);

    return { task: newTask };
  } catch (error) {
    console.error('Error creating task:', error);
    return { error: 'Failed to create task.' };
  }
}
