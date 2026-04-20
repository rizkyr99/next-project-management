// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStatusSelect } from '@/features/tasks/components/task-status-select';

// Mock Radix Select with native <select> so behavior tests work in jsdom
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange, disabled }: {
    children: React.ReactNode;
    value: string;
    onValueChange: (v: string) => void;
    disabled?: boolean;
  }) => (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}
      data-testid='status-select'
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

const mockUpdateTaskStatus = vi.fn().mockResolvedValue({});

vi.mock('@/features/tasks/actions', () => ({
  updateTaskStatus: (...args: unknown[]) => mockUpdateTaskStatus(...args),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

const statuses = [
  { id: 'todo', name: 'Todo' },
  { id: 'in-progress', name: 'In Progress' },
  { id: 'done', name: 'Done' },
];

const defaultProps = {
  taskId: 'task-1',
  projectId: 'project-1',
  currentStatusId: 'todo',
  statuses,
};

describe('TaskStatusSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders current status as selected', () => {
    render(<TaskStatusSelect {...defaultProps} />);
    const select = screen.getByTestId('status-select') as HTMLSelectElement;
    expect(select.value).toBe('todo');
  });

  it('renders all status options', () => {
    render(<TaskStatusSelect {...defaultProps} />);
    expect(screen.getByRole('option', { name: 'Todo' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'In Progress' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Done' })).toBeInTheDocument();
  });

  it('calls updateTaskStatus when a new status is selected', async () => {
    const user = userEvent.setup();
    render(<TaskStatusSelect {...defaultProps} />);
    await user.selectOptions(screen.getByTestId('status-select'), 'done');
    expect(mockUpdateTaskStatus).toHaveBeenCalledWith({
      taskId: 'task-1',
      statusId: 'done',
      projectId: 'project-1',
    });
  });

  it('calls onStatusChange callback when status changes', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(<TaskStatusSelect {...defaultProps} onStatusChange={onStatusChange} />);
    await user.selectOptions(screen.getByTestId('status-select'), 'in-progress');
    expect(onStatusChange).toHaveBeenCalledWith('task-1', 'in-progress');
  });

  it('does not call updateTaskStatus when same status is selected', async () => {
    const user = userEvent.setup();
    render(<TaskStatusSelect {...defaultProps} />);
    await user.selectOptions(screen.getByTestId('status-select'), 'todo');
    expect(mockUpdateTaskStatus).not.toHaveBeenCalled();
  });
});
