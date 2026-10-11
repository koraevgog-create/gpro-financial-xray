'use strict';

const $ = id => document.getElementById(id);
const KEY = 'gpro-my-budget-v1'; // Retain the v1 key to preserve existing transactions.
const LIMIT_KEY = 'gpro-my-budget-limits-v1';
const CATEGORIES = {
  expense: ['Продукты', 'Жильё', 'Транспорт', 'Здоровье', 'Семья', 'Развлечения', 'Покупки', 'Другое'],
  income: ['Зарплата', 'Подработка', 'Подарки', 'Возвраты', 'Другое']
};
const fmt = n => n.toLocaleString('ru-RU', {style: 'currency', currency: 'RUB', maximumFractionDigits: 2});
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const uid = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
const option = (value, label = value) => {
  const el = document.createElement('option');
  el.value = value;
  el.textContent = label;
  return el;
};
function readStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
  catch { return fallback; }
}
const saved = readStorage(KEY, []);
let entries = Array.isArray(saved) ? saved.filter(x =>
  x && typeof x.id === 'string' && ['income', 'expense'].includes(x.type) &&
  typeof x.date === 'string' && typeof x.category === 'string' &&
  Number.isSafeInteger(x.cents) && x.cents > 0
) : [];
const savedLimits = readStorage(LIMIT_KEY, {});
let limits = savedLimits && typeof savedLimits === 'object' && !Array.isArray(savedLimits) ? savedLimits : {};
const centsFrom = (value, allowZero = false) => {
  const n = Number(value);
  if (value === '' || !Number.isFinite(n) || n > 1e12 || (allowZero ? n < 0 : n <= 0)) return null;
  const cents = Math.round(n * 100);
  return Number.isSafeInteger(cents) && (allowZero || cents > 0) ? cents : null;
};
function save(key, data, errorId) {
  try { localStorage.setItem(key, JSON.stringify(data)); return true; }
  catch {
    $(errorId).textContent = 'Не удалось сохранить изменения. Проверь свободное место и настройки браузера.';
    return false;
  }
}
const monthly = () => entries.filter(e => e.date.slice(0, 7) === $('month').value);
const element = (tag, text, className = '') => {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
};
function updateCategories() {
  const previous = $('category').value;
  $('category').replaceChildren(...CATEGORIES[$('type').value].map(x => option(x)));
  if (CATEGORIES[$('type').value].includes(previous)) $('category').value = previous;
}
function updateFilterCategories() {
  const previous = $('filterCategory').value;
  const type = $('filterType').value;
  const names = type === 'all' ? [...new Set([...CATEGORIES.expense, ...CATEGORIES.income])] : CATEGORIES[type];
  $('filterCategory').replaceChildren(option('all', 'Все категории'), ...names.map(x => option(x)));
  $('filterCategory').value = names.includes(previous) ? previous : 'all';
}
function resetEditor() {
  $('editingId').value = '';
  $('operationForm').reset();
  $('date').value = today();
  updateCategories();
  $('formHeading').textContent = 'Добавить операцию';
  $('saveOperation').textContent = 'Добавить операцию';
  $('cancelEdit').hidden = true;
  $('formError').textContent = '';
}
function editEntry(id) {
  const item = entries.find(x => x.id === id);
  if (!item) return;
  $('editingId').value = item.id;
  $('type').value = item.type;
  updateCategories();
  $('category').value = item.category;
  $('amount').value = (item.cents / 100).toFixed(2);
  $('date').value = item.date;
  $('note').value = item.note || '';
  $('formHeading').textContent = 'Редактировать операцию';
  $('saveOperation').textContent = 'Сохранить изменения';
  $('cancelEdit').hidden = false;
  $('formError').textContent = '';
  $('operationForm').scrollIntoView({behavior: 'smooth', block: 'start'});
  $('amount').focus({preventScroll: true});
}
function categoryTotals(data) {
  const totals = new Map();
  for (const e of data) if (e.type === 'expense')
    totals.set(e.category, (totals.get(e.category) || 0) + e.cents);
  return totals;
}
function renderBreakdown(totals, totalExpense) {
  const root = $('breakdown');
  root.replaceChildren();
  if (!totals.size) {
    root.append(element('div', 'Добавь расходы, чтобы увидеть распределение по категориям.', 'empty'));
    return;
  }
  for (const [name, cents] of [...totals].sort((a, b) => b[1] - a[1])) {
    const item = element('div', '', 'breakdown-item');
    const row = element('div', '', 'breakdown-row');
    const meter = element('div', '', 'meter');
    const fill = document.createElement('div');
    row.append(element('span', name), element('strong', fmt(cents / 100)));
    fill.style.width = (totalExpense ? cents / totalExpense * 100 : 0) + '%';
    meter.append(fill);
    item.append(row, meter);
    root.append(item);
  }
}
function renderLimits(totals) {
  const month = $('month').value;
  const monthLimits = limits[month] || {};
  const root = $('limitList');
  root.replaceChildren();
  const configured = CATEGORIES.expense.filter(name => Number.isSafeInteger(monthLimits[name]) && monthLimits[name] > 0);
  if (!configured.length) {
    root.append(element('div', 'Лимиты пока не заданы. Выбери категорию и установи сумму.', 'empty'));
    return;
  }
  for (const name of configured) {
    const cap = monthLimits[name], spent = totals.get(name) || 0;
    const exceeded = spent > cap;
    const item = element('div', '', 'limit-item' + (exceeded ? ' over' : ''));
    const row = element('div', '', 'limit-row');
    row.append(element('strong', name), element('span', fmt(spent / 100) + ' / ' + fmt(cap / 100)));
    const meter = element('div', '', 'meter');
    const fill = document.createElement('div');
    fill.style.width = Math.min(100, spent / cap * 100) + '%';
    meter.append(fill);
    item.append(row, meter, element('small', exceeded ? 'Лимит превышен на ' + fmt((spent - cap) / 100) : 'Осталось ' + fmt((cap - spent) / 100), exceeded ? 'warning' : 'hint'));
    root.append(item);
  }
}
function renderHistory(data) {
  const type = $('filterType').value;
  const category = $('filterCategory').value;
  const search = $('filterSearch').value.trim().toLocaleLowerCase('ru-RU');
  const filtered = data.filter(e =>
    (type === 'all' || e.type === type) &&
    (category === 'all' || e.category === category) &&
    (!search || (e.category + ' ' + (e.note || '')).toLocaleLowerCase('ru-RU').includes(search))
  );
  $('count').textContent = filtered.length + ' из ' + data.length + ' операций';
  const root = $('entries');
  root.replaceChildren();
  if (!filtered.length) {
    root.append(element('div', data.length ? 'Нет операций по выбранным фильтрам.' : 'За этот месяц операций пока нет.', 'empty'));
    return;
  }
  for (const e of [...filtered].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))) {
    const item = element('div', '', 'entry');
    const date = element('time', new Date(e.date + 'T12:00:00').toLocaleDateString('ru-RU', {day: '2-digit', month: 'short'}));
    date.dateTime = e.date;
    const info = document.createElement('div');
    info.append(element('b', e.category));
    if (e.note) info.append(element('small', e.note));
    const amount = element('strong', (e.type === 'income' ? '+' : '−') + fmt(e.cents / 100), e.type === 'income' ? 'positive' : 'negative');
    const actions = element('div', '', 'entry-actions');
    const edit = element('button', 'Изменить', 'button secondary');
    edit.type = 'button';
    edit.addEventListener('click', () => editEntry(e.id));
    const remove = element('button', 'Удалить', 'button danger');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      if (!confirm('Удалить эту операцию?')) return;
      const next = entries.filter(x => x.id !== e.id);
      if (!save(KEY, next, 'formError')) return;
      entries = next;
      if ($('editingId').value === e.id) resetEditor();
      render();
    });
    actions.append(edit, remove);
    item.append(date, info, amount, actions);
    root.append(item);
  }
}
function render() {
  const data = monthly();
  const incomeCents = data.filter(e => e.type === 'income').reduce((sum, e) => sum + e.cents, 0);
  const expenseCents = data.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.cents, 0);
  $('income').textContent = fmt(incomeCents / 100);
  $('expense').textContent = fmt(expenseCents / 100);
  $('balance').textContent = fmt((incomeCents - expenseCents) / 100);
  $('balance').className = incomeCents < expenseCents ? 'negative' : 'positive';
  const totals = categoryTotals(data);
  renderBreakdown(totals, expenseCents);
  renderLimits(totals);
  renderHistory(data);
}
$('month').value = today().slice(0, 7);
$('date').value = today();
$('limitCategory').replaceChildren(...CATEGORIES.expense.map(x => option(x)));
updateCategories();
updateFilterCategories();
$('type').addEventListener('change', updateCategories);
$('month').addEventListener('change', () => {
  resetEditor();
  $('limitAmount').value = '';
  render();
});
$('filterType').addEventListener('change', () => { updateFilterCategories(); renderHistory(monthly()); });
$('filterCategory').addEventListener('change', () => renderHistory(monthly()));
$('filterSearch').addEventListener('input', () => renderHistory(monthly()));
$('clearFilters').addEventListener('click', () => {
  $('filterType').value = 'all';
  updateFilterCategories();
  $('filterCategory').value = 'all';
  $('filterSearch').value = '';
  renderHistory(monthly());
});
$('cancelEdit').addEventListener('click', resetEditor);
$('operationForm').addEventListener('submit', event => {
  event.preventDefault();
  $('formError').textContent = '';
  const cents = centsFrom($('amount').value);
  const date = $('date').value, type = $('type').value, category = $('category').value;
  const note = $('note').value.trim();
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(date + 'T12:00:00').getTime());
  if (cents === null || !validDate || !CATEGORIES[type]?.includes(category)) {
    $('formError').textContent = 'Проверь сумму, дату и категорию.';
    return;
  }
  const id = $('editingId').value;
  const updated = {id: id || uid(), type, cents, date, category, note};
  if (id && !entries.some(x => x.id === id)) {
    $('formError').textContent = 'Операция не найдена. Обнови страницу.';
    return;
  }
  const next = id ? entries.map(x => x.id === id ? updated : x) : [...entries, updated];
  if (!save(KEY, next, 'formError')) return;
  entries = next;
  resetEditor();
  $('month').value = date.slice(0, 7);
  render();
});
$('limitForm').addEventListener('submit', event => {
  event.preventDefault();
  $('limitError').textContent = '';
  const category = $('limitCategory').value;
  const cents = centsFrom($('limitAmount').value, true);
  if (!CATEGORIES.expense.includes(category) || cents === null) {
    $('limitError').textContent = 'Введи корректный лимит от 0 ₽.';
    return;
  }
  const month = $('month').value;
  const next = {...limits, [month]: {...(limits[month] || {})}};
  if (cents === 0) delete next[month][category];
  else next[month][category] = cents;
  if (!save(LIMIT_KEY, next, 'limitError')) return;
  limits = next;
  $('limitAmount').value = '';
  renderLimits(categoryTotals(monthly()));
});
$('export').addEventListener('click', () => {
  const data = monthly();
  const rows = [
    ['Дата', 'Тип', 'Категория', 'Сумма', 'Комментарий'],
    ...data.map(e => [e.date, e.type === 'income' ? 'Доход' : 'Расход', e.category, (e.cents / 100).toFixed(2).replace('.', ','), e.note || ''])
  ];
  const quote = value => '"' + String(value).replace(/"/g, '""') + '"';
  const csv = '\uFEFF' + rows.map(row => row.map(quote).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'gpro-budget-' + $('month').value + '.csv';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
const bot = window.GPRO_CONFIG?.telegramBotUrl?.trim() || '';
if (/^https:\/\/t\.me\/[A-Za-z0-9_]{5,32}(?:\?start=[A-Za-z0-9_-]{1,64})?$/.test(bot)) {
  const a = element('a', 'Открыть Telegram ↗', 'button');
  a.href = bot;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  $('tgAction').replaceChildren(a);
}
render();
