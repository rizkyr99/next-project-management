import { describe, it, expect } from 'vitest';
import {
  createTaskSchema,
  updateTaskStatusSchema,
  bulkUpdateStatusSchema,
  bulkDeleteTasksSchema,
  reorderTasksSchema,
} from '@/features/tasks/schema';

const validUuid = '00000000-0000-4000-8000-000000000001';
const validUuid2 = '00000000-0000-4000-8000-000000000002';

describe('createTaskSchema', () => {
  it('passes with valid data', () => {
    const result = createTaskSchema.safeParse({
      title: 'My task',
      order: 0,
      projectId: validUuid,
      statusId: validUuid2,
    });
    expect(result.success).toBe(true);
  });

  it('fails when title is empty', () => {
    const result = createTaskSchema.safeParse({
      title: '',
      order: 0,
      projectId: validUuid,
      statusId: validUuid2,
    });
    expect(result.success).toBe(false);
  });

  it('fails when projectId is not a uuid', () => {
    const result = createTaskSchema.safeParse({
      title: 'Task',
      order: 0,
      projectId: 'not-a-uuid',
      statusId: validUuid2,
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional dueDate', () => {
    const result = createTaskSchema.safeParse({
      title: 'Task',
      order: 1,
      projectId: validUuid,
      statusId: validUuid2,
      dueDate: new Date('2025-12-31'),
    });
    expect(result.success).toBe(true);
  });
});

describe('bulkUpdateStatusSchema', () => {
  it('passes with at least one task id', () => {
    const result = bulkUpdateStatusSchema.safeParse({
      taskIds: [validUuid],
      statusId: validUuid2,
      projectId: validUuid,
    });
    expect(result.success).toBe(true);
  });

  it('fails with empty taskIds array', () => {
    const result = bulkUpdateStatusSchema.safeParse({
      taskIds: [],
      statusId: validUuid2,
      projectId: validUuid,
    });
    expect(result.success).toBe(false);
  });
});

describe('bulkDeleteTasksSchema', () => {
  it('passes with multiple task ids', () => {
    const result = bulkDeleteTasksSchema.safeParse({
      taskIds: [validUuid, validUuid2],
      projectId: validUuid,
    });
    expect(result.success).toBe(true);
  });

  it('fails with empty taskIds array', () => {
    const result = bulkDeleteTasksSchema.safeParse({
      taskIds: [],
      projectId: validUuid,
    });
    expect(result.success).toBe(false);
  });
});

describe('updateTaskStatusSchema', () => {
  it('passes with valid uuids', () => {
    const result = updateTaskStatusSchema.safeParse({
      taskId: validUuid,
      statusId: validUuid2,
      projectId: validUuid,
    });
    expect(result.success).toBe(true);
  });

  it('fails when taskId is missing', () => {
    const result = updateTaskStatusSchema.safeParse({
      statusId: validUuid2,
      projectId: validUuid,
    });
    expect(result.success).toBe(false);
  });
});

describe('reorderTasksSchema', () => {
  it('passes with valid task order array', () => {
    const result = reorderTasksSchema.safeParse({
      projectId: validUuid,
      statusId: validUuid2,
      tasks: [{ id: validUuid, order: 0 }, { id: validUuid2, order: 1 }],
    });
    expect(result.success).toBe(true);
  });

  it('fails when task id in array is not a uuid', () => {
    const result = reorderTasksSchema.safeParse({
      projectId: validUuid,
      statusId: validUuid2,
      tasks: [{ id: 'bad-id', order: 0 }],
    });
    expect(result.success).toBe(false);
  });
});
