/** A file in a task's Files list (B3), as the page sends it to the browser. */
export interface TaskFile {
  id: string;
  name: string;
  size: number;
  /** An image type when it can be shown inline; otherwise a download. */
  contentType: string;
  createdAt: Date;
  uploadedById: string | null;
  uploadedByName: string | null;
  /** Added by the project's client (a guest); always visible to them. */
  fromClient: boolean;
  clientVisible: boolean;
}
