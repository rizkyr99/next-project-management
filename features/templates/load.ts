import 'server-only';
import { db } from '@/db/drizzle';
import { projectTemplate } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { builtinTemplate } from './builtin';
import { BUILTIN_PREFIX, templateDataSchema, type TemplateData } from './shape';

/**
 * A template the given workspace may use: a built-in one, or one saved in
 * that workspace. Saved data is validated again on the way out, so a bad
 * row can't produce a broken project. Null when there's no such template.
 */
export async function loadTemplate(
  templateId: string,
  workspaceId: string,
): Promise<{ name: string; data: TemplateData } | null> {
  if (templateId.startsWith(BUILTIN_PREFIX)) {
    const t = builtinTemplate(templateId);
    return t ? { name: t.name, data: t.data } : null;
  }
  if (!/^[0-9a-f-]{36}$/i.test(templateId)) return null;
  const [row] = await db
    .select({ name: projectTemplate.name, data: projectTemplate.data })
    .from(projectTemplate)
    .where(and(eq(projectTemplate.id, templateId), eq(projectTemplate.workspaceId, workspaceId)))
    .limit(1);
  if (!row) return null;
  const parsed = templateDataSchema.safeParse(row.data);
  if (!parsed.success) {
    console.error('[templates] stored template is invalid:', templateId, parsed.error.issues[0]);
    return null;
  }
  return { name: row.name, data: parsed.data };
}
