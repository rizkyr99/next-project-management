/** Shared by the workspace home (server) and the checklist (client). */
export const checklistCookie = (workspaceId: string) => `tide_checklist_hidden_${workspaceId}`;

export interface ChecklistState {
  createdProject: boolean;
  addedTask: boolean;
  invitedTeammate: boolean;
}
