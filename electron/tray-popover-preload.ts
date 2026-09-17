import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from './shared-with-frontend/ipc-events.const';
import {
  TrayPopoverAPI,
  TrayPopoverAddPayload,
  TrayPopoverSnapshot,
} from './shared-with-frontend/tray-popover.model';

const api: TrayPopoverAPI = {
  onState: (listener) =>
    ipcRenderer.on(IPC.TRAY_POPOVER_STATE, (_event, state: TrayPopoverSnapshot) =>
      listener(state),
    ),
  complete: (id: string) => ipcRenderer.send(IPC.TRAY_POPOVER_COMPLETE, id),
  open: (id: string) => ipcRenderer.send(IPC.TRAY_POPOVER_OPEN, id),
  add: (payload: TrayPopoverAddPayload) =>
    ipcRenderer.send(IPC.TRAY_POPOVER_ADD, payload),
  showMain: () => ipcRenderer.send(IPC.TRAY_POPOVER_MAIN),
  quit: () => ipcRenderer.send(IPC.TRAY_POPOVER_QUIT),
  fit: (height: number) => ipcRenderer.send(IPC.TRAY_POPOVER_FIT, height),
};
contextBridge.exposeInMainWorld('trayPopoverAPI', api);
