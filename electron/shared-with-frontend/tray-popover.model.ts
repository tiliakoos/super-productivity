export type TrayPopoverTask = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
};
export type TrayPopoverProject = { id: string; title: string };
export type TrayPopoverLabels = {
  today: string;
  more: string;
  complete: string;
  add: string;
  project: string;
  quit: string;
  openMain: string;
  empty: string;
};
export type TrayPopoverSnapshot = {
  tasks: TrayPopoverTask[];
  projects: TrayPopoverProject[];
  labels: TrayPopoverLabels;
};
export type TrayPopoverAddPayload = { title: string; projectId: string };
export type TrayPopoverAPI = {
  onState: (listener: (state: TrayPopoverSnapshot) => void) => void;
  complete: (id: string) => void;
  open: (id: string) => void;
  add: (payload: TrayPopoverAddPayload) => void;
  showMain: () => void;
  quit: () => void;
};
