import {
  TrayPopoverAPI,
  TrayPopoverSnapshot,
} from './shared-with-frontend/tray-popover.model';
declare const trayPopoverAPI: TrayPopoverAPI;
const list = document.getElementById('tasks')!;
const select = document.getElementById('project') as HTMLSelectElement;
const input = document.getElementById('title') as HTMLInputElement;
const menu = document.getElementById('menu')!;
const more = document.getElementById('more')!;
const addButton = document.querySelector('#add button')!;
const mainButton = document.getElementById('main')!;
const quitButton = document.getElementById('quit')!;
trayPopoverAPI.onState((state: TrayPopoverSnapshot) => {
  const labels = state.labels;
  document.getElementById('today')!.textContent = labels.today || '';
  more.setAttribute('aria-label', labels.more || '');
  input.setAttribute('aria-label', labels.add || '');
  input.placeholder = labels.add || '…';
  select.setAttribute('aria-label', labels.project || '');
  addButton.setAttribute('aria-label', labels.add || '');
  mainButton.textContent = labels.openMain || '';
  quitButton.textContent = labels.quit || '';
  const selected = select.value;
  select.replaceChildren(...state.projects.map((p) => new Option(p.title, p.id)));
  select.value = state.projects.some((p) => p.id === selected)
    ? selected
    : state.projects[0]?.id || '';
  list.replaceChildren(
    ...state.tasks.map((task) => {
      const li = document.createElement('li');
      const c = document.createElement('input');
      c.type = 'checkbox';
      c.setAttribute('aria-label', `${labels.complete || ''} ${task.title}`.trim());
      c.onchange = () => trayPopoverAPI.complete(task.id);
      const b = document.createElement('button');
      b.textContent = task.title;
      b.onclick = () => trayPopoverAPI.open(task.id);
      const p = document.createElement('span');
      p.className = 'project';
      p.textContent = task.projectName;
      li.append(c, b, p);
      return li;
    }),
  );
  if (!state.tasks.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = labels.empty || '';
    list.append(empty);
  }
});
document.getElementById('add')!.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = input.value.trim();
  const projectId = select.value;
  if (!title || !projectId) return;
  trayPopoverAPI.add({ title, projectId });
  input.value = '';
});
more.addEventListener('click', () => {
  const open = menu.hidden;
  menu.hidden = !open;
  document.getElementById('more')!.setAttribute('aria-expanded', String(open));
});
document.getElementById('main')!.onclick = trayPopoverAPI.showMain;
document.getElementById('quit')!.onclick = trayPopoverAPI.quit;
