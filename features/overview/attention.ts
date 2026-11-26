import { formatDeadline, isPastDeadline, parseDeadline, type ProjectStatus } from '@/features/projects/details';
import { isOverdue } from '@/features/tasks/due';

/**
 * D1: which active projects need a look, and why, in the viewer's time
 * zone. Reasons, most serious first:
 *
 * - marked Off track or At risk by the team (B7);
 * - the deadline has passed and the project isn't Done;
 * - the deadline is within a week and work is still open;
 * - tasks are overdue.
 */

export interface OverviewProject {
  id: string;
  name: string;
  clientName: string | null;
  /** "YYYY-MM-DD" */
  deadline: string | null;
  status: ProjectStatus | null;
  totalTasks: number;
  doneTasks: number;
}

export interface OverviewTask {
  id: string;
  title: string;
  projectId: string;
  dueDate: Date | string;
  dueHasTime: boolean;
}

export interface Attention {
  project: OverviewProject;
  /** Plain sentences, most serious first. */
  reasons: string[];
  /** Lower is more serious; used to order the list. */
  severity: number;
}

const DAY = 24 * 60 * 60 * 1000;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function projectsNeedingAttention(
  projects: OverviewProject[],
  openTasks: OverviewTask[],
  now = new Date(),
): Attention[] {
  const overdueByProject = new Map<string, number>();
  for (const t of openTasks) {
    if (isOverdue(t.dueDate, t.dueHasTime, now)) {
      overdueByProject.set(t.projectId, (overdueByProject.get(t.projectId) ?? 0) + 1);
    }
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const out: Attention[] = [];
  for (const p of projects) {
    if (p.status === 'done') continue;
    const reasons: string[] = [];
    let severity = Infinity;
    const flag = (rank: number, reason: string) => {
      reasons.push(reason);
      severity = Math.min(severity, rank);
    };
    const open = p.totalTasks - p.doneTasks;

    if (p.status === 'off_track') flag(0, 'Marked off track');
    if (p.status === 'at_risk') flag(1, 'Marked at risk');
    if (p.deadline && isPastDeadline(p.deadline, p.status, now)) {
      flag(0, `Deadline passed on ${formatDeadline(p.deadline, now)}${open > 0 ? `, ${plural(open, 'task')} open` : ''}`);
    } else if (p.deadline && open > 0) {
      const days = Math.round((parseDeadline(p.deadline).getTime() - today.getTime()) / DAY);
      if (days <= 7) {
        flag(2, `${days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`}, ${plural(open, 'task')} open`);
      }
    }
    const overdue = overdueByProject.get(p.id) ?? 0;
    if (overdue > 0) flag(3, `${plural(overdue, 'overdue task')}`);

    if (reasons.length > 0) out.push({ project: p, reasons, severity });
  }
  return out.sort((a, b) => a.severity - b.severity || a.project.name.localeCompare(b.project.name));
}
