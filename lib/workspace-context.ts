import 'server-only';
import { cache } from 'react';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { member, workspace } from '@/db/schema';

export const getActiveWorkspace = cache(
  async (slug: string, userId: string) => {
    const [row] = await db
      .select({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        role: member.role,
      })
      .from(workspace)
      .innerJoin(member, eq(member.workspaceId, workspace.id))
      .where(and(eq(workspace.slug, slug), eq(member.userId, userId)));
    return row ?? null;
  },
);
