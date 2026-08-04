/* Douglas County House-Hunt & School Tracker — vanilla JS, no build step. */

// ---------- constants ----------
const HOUSE_STATUSES = ['Researching', 'Showing Scheduled', 'Showing Complete', 'Offer Submitted', 'Under Contract', 'Rejected', 'Purchased'];
const SCHOOL_TYPES = ['Elementary', 'Middle', 'High', 'School'];
const SCHOOL_PRIORITIES = ['Very High', 'High', 'Moderate-High', 'Medium', 'Low'];
const CSPF_RATINGS = ['Distinguished', 'Accredited', 'Accredited-Improvement', 'Accredited-Priority-Improvement', 'Accredited-Turnaround'];
const TRANSPORT_OPTIONS = ['Bus Provided', 'Bus for Fee', 'None'];
const ENROLLMENT_METHODS = ['Boundary', 'School Choice', 'Lottery', 'Application'];
const TASK_STATUSES = ['Not Started', 'In Progress', 'Done'];
const TASK_PRIORITIES = ['Low', 'Medium', 'High'];
const TASK_RELATED_TYPES = ['House', 'School', 'General'];
const FINANCING_STATUSES = ['Not Started', 'Pre-approved', 'Approved', 'Locked'];
const APARTMENT_STATUSES = ['Researching', 'Contacted', 'Application Submitted', 'Approved', 'Lease Signed', 'Not Available', 'Rejected'];
const LEASE_TERM_OPTIONS = ['Month-to-Month', '3 Months', '6 Months', '12 Months', 'Lease Takeover/Assignment', 'Other'];
const EARLY_TERMINATION_OPTIONS = ['Confirmed Available', 'Not Available', 'Unknown — Ask Leasing Office'];
const ACTIVITY_LIMIT = 300;

const STATUS_COLORS = {
  'Researching': 'var(--series-1)',
  'Showing Scheduled': 'var(--series-2)',
  'Showing Complete': 'var(--series-3)',
  'Offer Submitted': 'var(--series-4)',
  'Under Contract': 'var(--series-7)',
  'Rejected': 'var(--series-8)',
  'Purchased': 'var(--series-6)',
};

const APARTMENT_STATUS_COLORS = {
  'Researching': 'var(--series-1)',
  'Contacted': 'var(--series-2)',
  'Application Submitted': 'var(--series-4)',
  'Approved': 'var(--series-3)',
  'Lease Signed': 'var(--series-6)',
  'Not Available': 'var(--series-8)',
  'Rejected': 'var(--series-8)',
};

const CSPF_POINTS = {
  'Distinguished': 100,
  'Accredited': 80,
  'Accredited-Improvement': 60,
  'Accredited-Priority-Improvement': 40,
  'Accredited-Turnaround': 20,
};
const TRANSPORT_POINTS = { 'Bus Provided': 100, 'Bus for Fee': 60, 'None': 0 };
const ENROLL_METHOD_POINTS = { 'Boundary': 100, 'School Choice': 60, 'Lottery': 40, 'Application': 20 };

const HOUSE_FACTORS = [
  { key: 'affordability', label: 'Affordability', getValue: h => numOrNull(h.price), higherIsBetter: false, display: h => fmtMoney(h.price) },
  { key: 'condition', label: 'Condition', getValue: h => numOrNull(h.condition), higherIsBetter: true, display: h => (h.condition ?? '—') + '/5' },
  { key: 'commute', label: 'Commute Time', getValue: h => numOrNull(h.commuteTimeMin), higherIsBetter: false, display: h => (h.commuteTimeMin ?? '—') + ' min' },
  { key: 'size', label: 'Size (sqft)', getValue: h => numOrNull(h.sqft), higherIsBetter: true, display: h => (h.sqft ? Number(h.sqft).toLocaleString() : '—') },
];

const SCHOOL_FACTORS = [
  { key: 'cspf', label: 'CSPF Rating', getNorm: s => CSPF_POINTS[s.cspfRating] ?? 50, display: s => s.cspfRating || '—' },
  { key: 'achievement', label: 'Academic Achievement', getNorm: s => clampNum(s.academicAchievement), display: s => (s.academicAchievement ?? '—') },
  { key: 'growth', label: 'Academic Growth', getNorm: s => clampNum(s.academicGrowth), display: s => (s.academicGrowth ?? '—') },
  { key: 'transportation', label: 'Transportation', getNorm: s => TRANSPORT_POINTS[s.transportation] ?? 50, display: s => s.transportation || '—' },
];

// ---------- state ----------
let state = { houses: [], schools: [], tasks: [], apartments: [], weights: { house: {}, school: {}, enrollment: {} }, activity: [], settings: { commuteDestination: '' } };
let appConfig = { geocodingProvider: 'nominatim', commuteAvailable: false };
const sortState = {
  houses: { key: 'address', dir: 'asc' },
  schools: { key: 'name', dir: 'asc' },
  tasks: { key: 'dueDate', dir: 'asc' },
  apartments: { key: 'address', dir: 'asc' },
};
const compareSelection = new Set();
const today0 = new Date();
const calendarState = { year: today0.getFullYear(), month: today0.getMonth() };
const CALENDAR_EVENT_COLORS = { Showing: 'var(--series-2)', 'Follow-up': 'var(--series-7)', Tour: 'var(--series-3)', Task: 'var(--series-1)' };

let mapInstance = null;
let mapHouseLayer = null;
let mapSchoolLayer = null;
let mapInitialized = false;

// ---------- utilities ----------
function numOrNull(v) { return (typeof v === 'number' && !isNaN(v)) ? v : null; }
function clampNum(v) { return (typeof v === 'number' && !isNaN(v)) ? Math.max(0, Math.min(100, v)) : 50; }
function uid(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 9); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function addDays(dateStr, days) { const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function fmtMoney(v) { if (v === null || v === undefined || v === '') return '—'; return '$' + Number(v).toLocaleString(); }
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function truncate(s, n) { if (!s) return ''; return s.length > n ? s.slice(0, n) + '…' : s; }
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }
function compareValues(a, b, dir) {
  a = (a === undefined || a === null) ? '' : a;
  b = (b === undefined || b === null) ? '' : b;
  let cmp;
  if (typeof a === 'number' && typeof b === 'number') cmp = a - b;
  else cmp = String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  return dir === 'asc' ? cmp : -cmp;
}
function val(key) { return document.getElementById('f_' + key).value; }
function numVal(key) { const v = document.getElementById('f_' + key).value; return v === '' ? null : Number(v); }
function parseTags(s) { return (s || '').split(',').map(t => t.trim()).filter(Boolean); }

// ---------- acting-as identity ----------
function getActingAs() { return localStorage.getItem('actingAs') || ''; }
function setActingAs(name) { localStorage.setItem('actingAs', name); }

// ---------- activity log ----------
function logActivity(action, summary) {
  if (!state.activity) state.activity = [];
  state.activity.unshift({ ts: new Date().toISOString(), who: getActingAs() || 'Unknown', action, summary });
  if (state.activity.length > ACTIVITY_LIMIT) state.activity.length = ACTIVITY_LIMIT;
}
function relativeTime(iso) {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------- persistence ----------
let saveTimeout = null;
function scheduleSave() {
  const el = document.getElementById('saveStatus');
  el.textContent = 'Saving…';
  el.className = 'save-status saving';
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(doSave, 500);
}
async function doSave() {
  const el = document.getElementById('saveStatus');
  try {
    const res = await fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(state) });
    if (!res.ok) throw new Error('save failed');
    const saved = await res.json();
    if (Array.isArray(saved.scoreHistory)) {
      state.scoreHistory = saved.scoreHistory;
      renderHouses();
      renderSchools();
    }
    el.textContent = 'All changes saved';
    el.className = 'save-status';
  } catch (e) {
    el.textContent = 'Save failed — retrying…';
    el.className = 'save-status error';
    setTimeout(doSave, 3000);
  }
}
async function loadState() {
  const res = await fetch('/api/state', { credentials: 'include' });
  state = await res.json();
  if (!Array.isArray(state.activity)) state.activity = [];
  if (!Array.isArray(state.scoreHistory)) state.scoreHistory = [];
  if (!Array.isArray(state.weightPresets)) state.weightPresets = [];
  if (!Array.isArray(state.apartments)) state.apartments = [];
  if (!state.settings || typeof state.settings !== 'object') state.settings = {};
  if (typeof state.settings.commuteDestination !== 'string') state.settings.commuteDestination = '';
  state.houses.forEach(h => { if (!Array.isArray(h.tags)) h.tags = []; });
  try {
    const res = await fetch('/api/config', { credentials: 'include' });
    appConfig = res.ok ? await res.json() : appConfig;
  } catch (e) { /* config endpoint unreachable — integrations UI just shows as unavailable */ }
}

// ---------- scoring ----------
function minMax(arr) {
  const nums = arr.filter(v => typeof v === 'number' && !isNaN(v));
  if (nums.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...nums), max: Math.max(...nums) };
}
function normalizeValue(value, min, max, higherIsBetter) {
  if (typeof value !== 'number' || isNaN(value)) return 50;
  if (max === min) return 100;
  let pct = (value - min) / (max - min);
  if (!higherIsBetter) pct = 1 - pct;
  return pct * 100;
}
function normalizedWeights(weightsObj) {
  const total = Object.values(weightsObj).reduce((s, v) => s + Number(v || 0), 0) || 1;
  const out = {};
  Object.entries(weightsObj).forEach(([k, v]) => out[k] = Number(v || 0) / total * 100);
  return out;
}

function computeHouseScores(houses, weights) {
  const w = normalizedWeights(weights);
  const ranges = {};
  HOUSE_FACTORS.forEach(f => ranges[f.key] = minMax(houses.map(f.getValue)));
  const result = {};
  houses.forEach(h => {
    let total = 0;
    const breakdown = [];
    HOUSE_FACTORS.forEach(f => {
      const rawVal = f.getValue(h);
      const norm = normalizeValue(rawVal, ranges[f.key].min, ranges[f.key].max, f.higherIsBetter);
      const weightPct = w[f.key] || 0;
      const contribution = norm * weightPct / 100;
      total += contribution;
      breakdown.push({ label: f.label, rawDisplay: f.display(h), normalized: norm, weightPct: Math.round(weightPct), contribution });
    });
    result[h.id] = { score: total, breakdown };
  });
  return result;
}

function computeSchoolScores(schools, weights) {
  const w = normalizedWeights(weights);
  const result = {};
  schools.forEach(s => {
    let total = 0;
    const breakdown = [];
    SCHOOL_FACTORS.forEach(f => {
      const norm = f.getNorm(s);
      const weightPct = w[f.key] || 0;
      const contribution = norm * weightPct / 100;
      total += contribution;
      breakdown.push({ label: f.label, rawDisplay: f.display(s), normalized: norm, weightPct: Math.round(weightPct), contribution });
    });
    result[s.id] = { score: total, breakdown };
  });
  return result;
}

function waitlistPoints(status) {
  if (!status || status === 'None') return 100;
  if (status === 'Closed') return 0;
  const m = /(\d+)/.exec(status);
  if (m) return Math.max(10, 100 - Number(m[1]) * 5);
  return 50;
}
function computeEnrollmentScores(schools, weights) {
  const w = normalizedWeights(weights);
  const result = {};
  schools.forEach(s => {
    const methodNorm = ENROLL_METHOD_POINTS[s.enrollmentMethod] ?? 50;
    const waitlistNorm = waitlistPoints(s.waitlistStatus);
    const methodW = w.method || 0, waitlistW = w.waitlist || 0;
    const methodContribution = methodNorm * methodW / 100;
    const waitlistContribution = waitlistNorm * waitlistW / 100;
    result[s.id] = {
      score: methodContribution + waitlistContribution,
      breakdown: [
        { label: 'Enrollment Method', rawDisplay: s.enrollmentMethod || '—', normalized: methodNorm, weightPct: Math.round(methodW), contribution: methodContribution },
        { label: 'Waitlist Status', rawDisplay: s.waitlistStatus || '—', normalized: waitlistNorm, weightPct: Math.round(waitlistW), contribution: waitlistContribution },
      ]
    };
  });
  return result;
}

function getScoreHistoryPoints(kind, id, limit = 30) {
  const pts = (state.scoreHistory || []).filter(e => e.kind === kind && e.id === id).sort((a, b) => a.date.localeCompare(b.date));
  return pts.slice(-limit);
}

function renderSparkline(points) {
  if (!points || points.length < 2) return '';
  const w = 56, h = 18, pad = 2;
  const step = (w - 2 * pad) / (points.length - 1);
  const xs = points.map((_, i) => pad + i * step);
  const ys = points.map(p => h - pad - (Math.max(0, Math.min(100, p.score)) / 100) * (h - 2 * pad));
  const line = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const trendUp = points[points.length - 1].score >= points[0].score;
  const color = trendUp ? 'var(--status-good)' : 'var(--status-critical)';
  const title = `${points[0].date}: ${points[0].score} → ${points[points.length - 1].date}: ${points[points.length - 1].score}`;
  return `<svg class="sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><title>${escapeHtml(title)}</title><polyline points="${line}" fill="none" stroke="${color}" stroke-width="1.5"/></svg>`;
}

function renderScoreCell(entry, historyPoints) {
  if (!entry) return '—';
  const pct = Math.max(0, Math.min(100, Math.round(entry.score)));
  const lines = entry.breakdown.map(b =>
    `<div>${escapeHtml(b.label)}: ${escapeHtml(String(b.rawDisplay))} → normalized ${Math.round(b.normalized)} × weight ${b.weightPct}% = ${b.contribution.toFixed(1)}</div>`
  ).join('');
  const spark = renderSparkline(historyPoints);
  return `<details>
    <summary class="score-cell"><span class="score-num">${pct}</span><span class="score-bar-track"><span class="score-bar-fill" style="width:${pct}%"></span></span>${spark}</summary>
    <div class="calc-detail">${lines}<div><strong>Total = ${pct} / 100</strong></div></div>
  </details>`;
}

// ---------- generic table renderer ----------
function renderTable(container, columns, rows, tableSortState, reload, rowClassFn) {
  let html = '<table><thead><tr>';
  columns.forEach(col => {
    const sortable = !!(col.sortKey && tableSortState && reload);
    const isSorted = sortable && tableSortState.key === col.sortKey;
    html += `<th ${sortable ? `data-sortkey="${col.sortKey}"` : ''} class="${isSorted ? 'sorted' : ''}" ${isSorted ? `data-dir="${tableSortState.dir === 'asc' ? '▲' : '▼'}"` : ''}>${col.label}</th>`;
  });
  html += '</tr></thead><tbody>';
  if (rows.length === 0) {
    html += `<tr><td colspan="${columns.length}"><span class="empty-note">No rows match the current filters.</span></td></tr>`;
  } else {
    rows.forEach(row => {
      const cls = rowClassFn ? rowClassFn(row) : '';
      html += `<tr class="${cls}">`;
      columns.forEach(col => {
        html += `<td class="${col.wrap ? 'wrap' : ''}">${col.render(row)}</td>`;
      });
      html += '</tr>';
    });
  }
  html += '</tbody></table>';
  container.innerHTML = html;
  if (reload) {
    container.querySelectorAll('th[data-sortkey]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sortkey;
        if (tableSortState.key === key) tableSortState.dir = tableSortState.dir === 'asc' ? 'desc' : 'asc';
        else { tableSortState.key = key; tableSortState.dir = 'asc'; }
        reload();
      });
    });
  }
}

function populateSelectPreserving(select, values, placeholder) {
  const current = select.value;
  const opts = Array.from(new Set(values.filter(v => v !== undefined && v !== null && v !== ''))).sort();
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + opts.map(o => `<option value="${escapeAttr(o)}">${escapeHtml(o)}</option>`).join('');
  select.value = opts.includes(current) ? current : '';
}

// ---------- Houses ----------
function getFilteredHouses() {
  const q = document.getElementById('houseSearch').value.trim().toLowerCase();
  const statusF = document.getElementById('houseStatusFilter').value;
  const cityF = document.getElementById('houseCityFilter').value;
  const tagF = document.getElementById('houseTagFilter').value;
  let list = state.houses.filter(h => {
    if (statusF && h.status !== statusF) return false;
    if (cityF && h.city !== cityF) return false;
    if (tagF && !(h.tags || []).includes(tagF)) return false;
    if (q) {
      const hay = [h.address, h.city, h.notes, h.pros, h.cons, (h.tags || []).join(' ')].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const { key, dir } = sortState.houses;
  return list.slice().sort((a, b) => compareValues(a[key], b[key], dir));
}

function populateHouseFilterOptions() {
  populateSelectPreserving(document.getElementById('houseStatusFilter'), HOUSE_STATUSES, 'All statuses');
  populateSelectPreserving(document.getElementById('houseCityFilter'), state.houses.map(h => h.city), 'All cities');
  populateSelectPreserving(document.getElementById('houseTagFilter'), state.houses.flatMap(h => h.tags || []), 'All tags');
}

function schoolNameById(id) { const s = state.schools.find(x => x.id === id); return s ? s.name : null; }

function renderHouses() {
  populateHouseFilterOptions();
  const rows = getFilteredHouses();
  const scores = computeHouseScores(state.houses, state.weights.house);
  const columns = [
    { label: 'Address', sortKey: 'address', wrap: true, render: h => `<a href="${escapeAttr(h.listingUrl || '#')}" target="_blank" rel="noopener">${escapeHtml(h.address)}</a>` },
    { label: 'City', sortKey: 'city', render: h => escapeHtml(h.city || '') },
    { label: 'Price', sortKey: 'price', render: h => fmtMoney(h.price) },
    { label: 'Status', sortKey: 'status', render: h => escapeHtml(h.status || '') },
    { label: 'Commute', sortKey: 'commuteTimeMin', render: h => h.commuteTimeMin ? h.commuteTimeMin + ' min' : '—' },
    { label: 'Bed/Bath', sortKey: 'bedrooms', render: h => `${h.bedrooms ?? '—'} / ${h.bathrooms ?? '—'}` },
    { label: 'Sqft', sortKey: 'sqft', render: h => h.sqft ? Number(h.sqft).toLocaleString() : '—' },
    { label: 'Tags', wrap: true, render: h => (h.tags || []).map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('') || '—' },
    { label: 'Offer', wrap: true, render: h => h.offerPrice ? `${fmtMoney(h.offerPrice)} <span class="muted-note">(${escapeHtml(h.financingStatus || '—')})</span>` : '—' },
    { label: 'Showing', sortKey: 'showingDate', render: h => fmtDate(h.showingDate) },
    { label: 'Follow-up', sortKey: 'followUpDate', render: h => fmtDate(h.followUpDate) },
    { label: 'House Score', wrap: true, render: h => renderScoreCell(scores[h.id], getScoreHistoryPoints('house', h.id)) },
    { label: '', render: h => `<button class="btn small edit-btn" data-id="${h.id}">Edit</button> <button class="btn small print-btn" data-id="${h.id}">Print</button>` },
  ];
  renderTable(document.getElementById('housesTable'), columns, rows, sortState.houses, renderHouses);
  document.getElementById('housesTable').querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openHouseModal(state.houses.find(x => x.id === btn.dataset.id)));
  });
  document.getElementById('housesTable').querySelectorAll('.print-btn').forEach(btn => {
    btn.addEventListener('click', () => printHouseReport(state.houses.find(x => x.id === btn.dataset.id)));
  });
}

function exportHouses() {
  const rows = getFilteredHouses();
  const headers = ['Address', 'Listing URL', 'City', 'Price', 'Est Monthly Payment', 'Property Tax', 'HOA', 'Sqft', 'Bedrooms', 'Bathrooms', 'Lot Size', 'Year Built', 'Condition', 'Required Repairs', 'Elementary School', 'Middle School', 'High School', 'Commute (min)', 'Showing Date', 'Status', 'Follow-up Date', 'Tags', 'Offer Price', 'Offer Date', 'Counter Price', 'Contingencies', 'Closing Date', 'Financing Status', 'Pros', 'Cons', 'Notes'];
  downloadCsv('houses.csv', headers, rows.map(h => [h.address, h.listingUrl, h.city, h.price, h.estMonthlyPayment, h.propertyTax, h.hoa, h.sqft, h.bedrooms, h.bathrooms, h.lotSize, h.yearBuilt, h.condition, h.requiredRepairs, schoolNameById(h.elementarySchoolId), schoolNameById(h.middleSchoolId), schoolNameById(h.highSchoolId), h.commuteTimeMin, h.showingDate, h.status, h.followUpDate, (h.tags || []).join('; '), h.offerPrice, h.offerDate, h.counterPrice, h.contingencies, h.closingDate, h.financingStatus, h.pros, h.cons, h.notes]));
}

// ---------- Apartments ----------
function getFilteredApartments() {
  const q = document.getElementById('apartmentSearch').value.trim().toLowerCase();
  const statusF = document.getElementById('apartmentStatusFilter').value;
  const cityF = document.getElementById('apartmentCityFilter').value;
  const leaseTermF = document.getElementById('apartmentLeaseTermFilter').value;
  const rentMaxF = (() => { const v = document.getElementById('apartmentRentMaxFilter')?.value; return v === '' ? null : Number(v); })();

  let list = state.apartments.filter(a => {
    if (statusF && a.status !== statusF) return false;
    if (cityF && a.city !== cityF) return false;
    if (leaseTermF && a.leaseTerm !== leaseTermF) return false;
    if (rentMaxF !== null && (a.rent === null || a.rent === undefined || a.rent > rentMaxF)) return false;
    if (q) {
      const hay = [a.name, a.address, a.city, a.leasingCompany, a.notes].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const { key, dir } = sortState.apartments;
  return list.slice().sort((a, b) => compareValues(a[key], b[key], dir));
}

function populateApartmentFilterOptions() {
  populateSelectPreserving(document.getElementById('apartmentStatusFilter'), APARTMENT_STATUSES, 'All statuses');
  populateSelectPreserving(document.getElementById('apartmentCityFilter'), [...new Set(state.apartments.map(a => a.city).filter(Boolean))].sort(), 'All cities');
  populateSelectPreserving(document.getElementById('apartmentLeaseTermFilter'), [...new Set(state.apartments.map(a => a.leaseTerm).filter(Boolean))], 'All lease terms');
}

function renderApartments() {
  populateApartmentFilterOptions();
  const rows = getFilteredApartments();
  const columns = [
    { label: 'Complex Name', sortKey: 'name', wrap: true, render: a => escapeHtml(a.name || a.address || '') },
    { label: 'Address', sortKey: 'address', wrap: true, render: a => escapeHtml(a.address || '') },
    { label: 'City', sortKey: 'city', render: a => escapeHtml(a.city || '') },
    { label: 'Rent/mo', sortKey: 'rent', render: a => fmtMoney(a.rent) },
    { label: 'Lease Term', sortKey: 'leaseTerm', render: a => escapeHtml(a.leaseTerm || '') },
    { label: 'Available', sortKey: 'availabilityDate', render: a => fmtDate(a.availabilityDate) },
    { label: 'Status', sortKey: 'status', render: a => escapeHtml(a.status || '') },
    { label: 'Contact', wrap: true, render: a => {
      const parts = [];
      if (a.leasingCompany) parts.push(`<strong>${escapeHtml(a.leasingCompany)}</strong>`);
      if (a.contactEmail) parts.push(`<a href="mailto:${escapeAttr(a.contactEmail)}">${escapeHtml(a.contactEmail)}</a>`);
      if (a.contactPhone) parts.push(`<a href="tel:${escapeAttr(a.contactPhone)}">${escapeHtml(a.contactPhone)}</a>`);
      return parts.join('<br>') || '—';
    }},
    { label: '', render: a => `<button class="btn small edit-btn" data-id="${a.id}">Edit</button>` },
  ];
  renderTable(document.getElementById('apartmentsTable'), columns, rows, sortState.apartments, renderApartments);
  document.getElementById('apartmentsTable').querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openApartmentModal(state.apartments.find(x => x.id === btn.dataset.id)));
  });
}

function exportApartments() {
  const rows = getFilteredApartments();
  const headers = ['Complex Name', 'Address', 'City', 'Zip', 'Listing URL', 'Rent', 'Bedrooms', 'Bathrooms', 'Sqft', 'Lease Term', 'Early Termination', 'Early Termination Details', 'School District', 'Availability Date', 'Status', 'Leasing Company', 'Contact Email', 'Contact Phone', 'Pros', 'Cons', 'Notes', 'Tags'];
  downloadCsv('apartments.csv', headers, rows.map(a => [a.name, a.address, a.city, a.zip, a.listingUrl, a.rent, a.bedrooms, a.bathrooms, a.sqft, a.leaseTerm, a.earlyTermination, a.earlyTerminationDetails, a.schoolDistrict, a.availabilityDate, a.status, a.leasingCompany, a.contactEmail, a.contactPhone, a.pros, a.cons, a.notes, (a.tags || []).join('; ')]));
}

// ---------- Schools ----------
function getFilteredSchools() {
  const q = document.getElementById('schoolSearch').value.trim().toLowerCase();
  const typeF = document.getElementById('schoolTypeFilter').value;
  const cityF = document.getElementById('schoolCityFilter').value;
  const priorityF = document.getElementById('schoolPriorityFilter').value;
  const commuteMaxF = (() => { const v = document.getElementById('schoolCommuteMaxFilter')?.value; return v === '' ? null : Number(v); })();
  const mathMinF = (() => { const v = document.getElementById('schoolMathMinFilter')?.value; return v === '' ? null : Number(v); })();
  const readingMinF = (() => { const v = document.getElementById('schoolReadingMinFilter')?.value; return v === '' ? null : Number(v); })();

  let list = state.schools.filter(s => {
    if (typeF && s.type !== typeF) return false;
    if (cityF && s.city !== cityF) return false;
    if (priorityF && s.priority !== priorityF) return false;
    if (commuteMaxF !== null && (s.commute === null || s.commute === undefined || s.commute > commuteMaxF)) return false;
    if (mathMinF !== null && (s.mathProficiency === null || s.mathProficiency === undefined || s.mathProficiency < mathMinF)) return false;
    if (readingMinF !== null && (s.readingProficiency === null || s.readingProficiency === undefined || s.readingProficiency < readingMinF)) return false;
    if (q) {
      const hay = [s.name, s.notes, s.pros, s.cons].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const { key, dir } = sortState.schools;
  return list.slice().sort((a, b) => compareValues(a[key], b[key], dir));
}

function populateSchoolFilterOptions() {
  populateSelectPreserving(document.getElementById('schoolTypeFilter'), SCHOOL_TYPES, 'All types');

  // Get unique cities from schools
  const cities = [...new Set(state.schools.map(s => s.city).filter(Boolean))].sort();
  populateSelectPreserving(document.getElementById('schoolCityFilter'), cities, 'All cities');

  // Get unique priorities from schools
  const priorities = [...new Set(state.schools.map(s => s.priority).filter(Boolean))];
  const priorityOrder = ['Very High', 'High', 'Moderate-High', 'Medium', 'Low'];
  const sortedPriorities = priorityOrder.filter(p => priorities.includes(p));
  populateSelectPreserving(document.getElementById('schoolPriorityFilter'), sortedPriorities, 'All priorities');
}

function renderSchools() {
  populateSchoolFilterOptions();
  const rows = getFilteredSchools();
  const scores = computeSchoolScores(state.schools, state.weights.school);
  const enroll = computeEnrollmentScores(state.schools, state.weights.enrollment);
  const columns = [
    { label: 'Name', sortKey: 'name', wrap: true, render: s => escapeHtml(s.name) },
    { label: 'City', sortKey: 'city', render: s => escapeHtml(s.city || '') },
    { label: 'Commute', sortKey: 'commute', render: s => (s.commute ? `${s.commute} min` : '—') },
    { label: 'Math %', sortKey: 'mathProficiency', render: s => (s.mathProficiency ? `${s.mathProficiency}%` : '—') },
    { label: 'Reading %', sortKey: 'readingProficiency', render: s => (s.readingProficiency ? `${s.readingProficiency}%` : '—') },
    { label: 'Type', sortKey: 'type', render: s => escapeHtml(s.type || '') },
    { label: 'Rankings', sortKey: 'greatSchoolsRating', render: s => {
      const gs = s.greatSchoolsRating ? `GS: ${s.greatSchoolsRating}/10` : '';
      const niche = s.nicheRanking ? `Niche: ${s.nicheRanking}` : '';
      return [gs, niche].filter(x => x).join(' | ') || '—';
    } },
    { label: 'Priority', sortKey: 'priority', render: s => escapeHtml(s.priority || '') },
    { label: 'Enrollment', sortKey: 'enrollmentMethod', render: s => escapeHtml(s.enrollmentMethod || '') },
    { label: 'Tour Date', sortKey: 'tourDate', render: s => fmtDate(s.tourDate) },
    { label: 'School Score', wrap: true, render: s => renderScoreCell(scores[s.id], getScoreHistoryPoints('school', s.id)) },
    { label: 'Enroll. Prob.', wrap: true, render: s => renderScoreCell(enroll[s.id], getScoreHistoryPoints('enrollment', s.id)) },
    { label: '', render: s => `<button class="btn small edit-btn" data-id="${s.id}">Edit</button>` },
  ];
  renderTable(document.getElementById('schoolsTable'), columns, rows, sortState.schools, renderSchools);
  document.getElementById('schoolsTable').querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openSchoolModal(state.schools.find(x => x.id === btn.dataset.id)));
  });
}

function exportSchools() {
  const rows = getFilteredSchools();
  const headers = ['Name', 'Type', 'Grades Served', 'Curriculum Model', 'CSPF Rating', 'Academic Achievement', 'Academic Growth', 'Transportation', 'Enrollment Method', 'Application Deadline', 'Waitlist Status', 'Tour Date', 'Pros', 'Cons', 'Notes'];
  downloadCsv('schools.csv', headers, rows.map(s => [s.name, s.type, s.gradesServed, s.curriculumModel, s.cspfRating, s.academicAchievement, s.academicGrowth, s.transportation, s.enrollmentMethod, s.applicationDeadline, s.waitlistStatus, s.tourDate, s.pros, s.cons, s.notes]));
}

// ---------- Tasks ----------
function getFilteredTasks() {
  const q = document.getElementById('taskSearch').value.trim().toLowerCase();
  const ownerF = document.getElementById('taskOwnerFilter').value;
  const statusF = document.getElementById('taskStatusFilter').value;
  const priorityF = document.getElementById('taskPriorityFilter').value;
  let list = state.tasks.filter(t => {
    if (ownerF && t.owner !== ownerF) return false;
    if (statusF && t.status !== statusF) return false;
    if (priorityF && t.priority !== priorityF) return false;
    if (q) {
      const hay = [t.task, t.notes].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const { key, dir } = sortState.tasks;
  return list.slice().sort((a, b) => compareValues(a[key], b[key], dir));
}

function populateTaskFilterOptions() {
  populateSelectPreserving(document.getElementById('taskOwnerFilter'), state.tasks.map(t => t.owner), 'All owners');
  populateSelectPreserving(document.getElementById('taskStatusFilter'), TASK_STATUSES, 'All statuses');
  populateSelectPreserving(document.getElementById('taskPriorityFilter'), TASK_PRIORITIES, 'All priorities');
}

function taskRowClass(t) {
  if (!t.dueDate || t.status === 'Done') return '';
  const today = todayStr();
  if (t.dueDate < today) return 'overdue';
  if (t.dueDate <= addDays(today, 7)) return 'due-soon';
  return '';
}

function relatedLabel(t) {
  if (t.relatedType === 'House') { const h = state.houses.find(x => x.id === t.relatedId); return h ? h.address : '—'; }
  if (t.relatedType === 'School') { const s = state.schools.find(x => x.id === t.relatedId); return s ? s.name : '—'; }
  return 'General';
}

function renderTasks() {
  populateTaskFilterOptions();
  const rows = getFilteredTasks();
  const columns = [
    { label: 'Task', sortKey: 'task', wrap: true, render: t => escapeHtml(t.task) },
    { label: 'Related', sortKey: 'relatedType', render: t => escapeHtml(relatedLabel(t)) },
    { label: 'Owner', sortKey: 'owner', render: t => escapeHtml(t.owner || '') },
    { label: 'Due Date', sortKey: 'dueDate', render: t => fmtDate(t.dueDate) },
    { label: 'Status', sortKey: 'status', render: t => escapeHtml(t.status || '') },
    { label: 'Priority', sortKey: 'priority', render: t => escapeHtml(t.priority || '') },
    { label: 'Notes', wrap: true, render: t => escapeHtml(truncate(t.notes, 60)) },
    { label: '', render: t => `<button class="btn small edit-btn" data-id="${t.id}">Edit</button>` },
  ];
  renderTable(document.getElementById('tasksTable'), columns, rows, sortState.tasks, renderTasks, taskRowClass);
  document.getElementById('tasksTable').querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openTaskModal(state.tasks.find(x => x.id === btn.dataset.id)));
  });
}

function exportTasks() {
  const rows = getFilteredTasks();
  const headers = ['Task', 'Related Type', 'Related Item', 'Owner', 'Due Date', 'Status', 'Priority', 'Notes'];
  downloadCsv('tasks.csv', headers, rows.map(t => [t.task, t.relatedType, relatedLabel(t), t.owner, t.dueDate, t.status, t.priority, t.notes]));
}

// ---------- Calendar ----------
function getCalendarEvents() {
  const items = [];
  state.houses.forEach(h => {
    if (h.showingDate) items.push({ date: h.showingDate, type: 'Showing', label: `Showing — ${h.address}`, open: () => openHouseModal(h) });
    if (h.followUpDate) items.push({ date: h.followUpDate, type: 'Follow-up', label: `Follow-up — ${h.address}`, open: () => openHouseModal(h) });
  });
  state.schools.forEach(s => {
    if (s.tourDate) items.push({ date: s.tourDate, type: 'Tour', label: `Tour — ${s.name}`, open: () => openSchoolModal(s) });
  });
  state.tasks.forEach(t => {
    if (t.dueDate && t.status !== 'Done') items.push({ date: t.dueDate, type: 'Task', label: `Task due — ${t.task}`, open: () => openTaskModal(t) });
  });
  return items;
}

function renderCalendar() {
  const { year, month } = calendarState;
  document.getElementById('calMonthLabel').textContent = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const eventsByDate = {};
  getCalendarEvents().forEach(e => { (eventsByDate[e.date] = eventsByDate[e.date] || []).push(e); });

  const startDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayStr();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let html = '<div class="cal-weekday-row">' + dayNames.map(d => `<div class="cal-weekday">${d}</div>`).join('') + '</div><div class="cal-days">';
  for (let i = 0; i < startDow; i++) html += '<div class="cal-day empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayEvents = eventsByDate[dateStr] || [];
    html += `<div class="cal-day ${dateStr === today ? 'is-today' : ''}">
      <div class="cal-day-num">${d}</div>
      <div class="cal-day-events">${dayEvents.map((e, i) => `<div class="cal-event" data-date="${dateStr}" data-idx="${i}" style="background:${CALENDAR_EVENT_COLORS[e.type]}" title="${escapeAttr(e.label)}">${escapeHtml(truncate(e.label, 24))}</div>`).join('')}</div>
    </div>`;
  }
  html += '</div>';
  const el = document.getElementById('calendarGrid');
  el.innerHTML = html;
  el.querySelectorAll('.cal-event').forEach(row => {
    row.addEventListener('click', () => {
      const dayEvents = eventsByDate[row.dataset.date] || [];
      const ev = dayEvents[Number(row.dataset.idx)];
      if (ev) ev.open();
    });
  });
}

function calChangeMonth(delta) {
  calendarState.month += delta;
  if (calendarState.month < 0) { calendarState.month = 11; calendarState.year--; }
  if (calendarState.month > 11) { calendarState.month = 0; calendarState.year++; }
  renderCalendar();
}
function calGoToday() {
  const now = new Date();
  calendarState.year = now.getFullYear();
  calendarState.month = now.getMonth();
  renderCalendar();
}

function icsEscape(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
function exportIcs() {
  const events = getCalendarEvents();
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//House Hunt Tracker//EN', 'CALSCALE:GREGORIAN'];
  events.forEach((e, i) => {
    const dateCompact = e.date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:hht-${i}-${dateCompact}@house-hunt-tracker`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${dateCompact}`);
    lines.push(`SUMMARY:${icsEscape(e.label)}`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'house-hunt-calendar.ics';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- Activity ----------
function renderActivity() {
  const el = document.getElementById('activityList');
  const items = state.activity || [];
  el.innerHTML = items.length
    ? items.map(a => `<div class="list-item"><span>${escapeHtml(a.summary)} <span class="muted-note">— ${escapeHtml(a.who)}</span></span><span class="li-date">${relativeTime(a.ts)}</span></div>`).join('')
    : '<div class="empty-note">No activity logged yet — changes you make will show up here.</div>';
}

// ---------- Global search ----------
function globalSearchResults(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const results = [];
  state.houses.forEach(h => {
    const hay = [h.address, h.city, h.notes, h.pros, h.cons, (h.tags || []).join(' ')].join(' ').toLowerCase();
    if (hay.includes(q)) results.push({ tab: 'houses', label: `House — ${h.address}`, open: () => openHouseModal(h) });
  });
  state.schools.forEach(s => {
    const hay = [s.name, s.notes, s.pros, s.cons].join(' ').toLowerCase();
    if (hay.includes(q)) results.push({ tab: 'schools', label: `School — ${s.name}`, open: () => openSchoolModal(s) });
  });
  state.tasks.forEach(t => {
    const hay = [t.task, t.notes].join(' ').toLowerCase();
    if (hay.includes(q)) results.push({ tab: 'tasks', label: `Task — ${t.task}`, open: () => openTaskModal(t) });
  });
  return results.slice(0, 20);
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tabName));
}

function renderGlobalSearchResults() {
  const input = document.getElementById('globalSearch');
  const resultsEl = document.getElementById('globalSearchResults');
  const results = globalSearchResults(input.value);
  if (!results.length) { resultsEl.classList.add('hidden'); resultsEl.innerHTML = ''; return; }
  resultsEl.innerHTML = results.map((r, i) => `<div class="global-search-result" data-idx="${i}">${escapeHtml(r.label)}</div>`).join('');
  resultsEl.classList.remove('hidden');
  resultsEl.querySelectorAll('.global-search-result').forEach((row, i) => {
    row.addEventListener('click', () => {
      switchTab(results[i].tab);
      results[i].open();
      resultsEl.classList.add('hidden');
      input.value = '';
    });
  });
}

// ---------- CSV ----------
function toCsvValue(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function downloadCsv(filename, headers, rows) {
  const lines = [headers.map(toCsvValue).join(',')];
  rows.forEach(r => lines.push(r.map(toCsvValue).join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- Reminders ----------
function getReminderCounts() {
  const today = todayStr();
  const weekEnd = addDays(today, 7);
  let overdue = 0, dueToday = 0, dueWeek = 0;
  state.tasks.forEach(t => {
    if (!t.dueDate || t.status === 'Done') return;
    if (t.dueDate < today) overdue++;
    else if (t.dueDate === today) dueToday++;
    else if (t.dueDate <= weekEnd) dueWeek++;
  });
  state.houses.forEach(h => {
    if (!h.followUpDate || ['Rejected', 'Purchased'].includes(h.status)) return;
    if (h.followUpDate < today) overdue++;
    else if (h.followUpDate === today) dueToday++;
    else if (h.followUpDate <= weekEnd) dueWeek++;
  });
  return { overdue, dueToday, dueWeek };
}

function renderReminderBanner() {
  const { overdue, dueToday, dueWeek } = getReminderCounts();
  const el = document.getElementById('reminderBanner');
  const notifSupported = typeof Notification !== 'undefined';
  const notifEnabled = notifSupported && localStorage.getItem('remindersEnabled') === 'true' && Notification.permission === 'granted';
  const notifControl = !notifSupported ? '' : notifEnabled
    ? `<button class="btn small" id="disableNotifBtn">Disable browser reminders</button>`
    : `<button class="btn small" id="enableNotifBtn">Enable browser reminders</button>`;
  if (overdue === 0 && dueToday === 0 && dueWeek === 0) {
    el.className = 'reminder-banner ok';
    el.innerHTML = `<span>All caught up — nothing overdue or due soon.</span>${notifControl}`;
  } else {
    const severity = overdue > 0 ? 'severe' : (dueToday > 0 ? 'warn' : 'mild');
    el.className = `reminder-banner ${severity}`;
    el.innerHTML = `<span>${overdue} overdue &middot; ${dueToday} due today &middot; ${dueWeek} due this week</span>${notifControl}`;
  }
  const enableBtn = document.getElementById('enableNotifBtn');
  if (enableBtn) enableBtn.addEventListener('click', () => {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') { localStorage.setItem('remindersEnabled', 'true'); maybeNotifyDueToday(); }
      renderReminderBanner();
    });
  });
  const disableBtn = document.getElementById('disableNotifBtn');
  if (disableBtn) disableBtn.addEventListener('click', () => {
    localStorage.setItem('remindersEnabled', 'false');
    renderReminderBanner();
  });
}

function maybeNotifyDueToday() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (localStorage.getItem('remindersEnabled') !== 'true') return;
  const today = todayStr();
  if (localStorage.getItem('lastNotifiedDate') === today) return;
  const { dueToday } = getReminderCounts();
  if (dueToday === 0) return;
  new Notification('House Hunt Tracker', { body: `${dueToday} item${dueToday === 1 ? '' : 's'} due today.` });
  localStorage.setItem('lastNotifiedDate', today);
}

// ---------- Integrations card ----------
function renderIntegrationsCard() {
  const input = document.getElementById('commuteDestinationInput');
  if (document.activeElement !== input) input.value = state.settings.commuteDestination || '';
  const geoLabel = appConfig.geocodingProvider === 'google'
    ? 'Google Maps (API key configured)'
    : 'OpenStreetMap Nominatim — free, no API key (rate-limited; fine for occasional lookups)';
  const commuteLabel = appConfig.commuteAvailable
    ? 'Available'
    : 'Not available — set the GEOCODE_API_KEY environment variable to a Google Maps API key to enable live commute time lookups.';
  document.getElementById('integrationsStatus').innerHTML =
    `Geocoding provider: <strong>${escapeHtml(geoLabel)}</strong><br>Live commute time: <strong>${escapeHtml(commuteLabel)}</strong>`;
}

// ---------- Dashboard ----------
function renderDashboard() {
  renderReminderBanner();
  renderIntegrationsCard();
  renderStatusChart();
  renderUpcoming();
  renderOverdue();
  renderTopHouses();
  renderComboTable();
  renderCompareSelect();
  renderCompareTable();
}

function renderStatusChart() {
  const counts = {};
  HOUSE_STATUSES.forEach(s => counts[s] = 0);
  state.houses.forEach(h => { if (h.status in counts) counts[h.status]++; });
  const max = Math.max(1, ...Object.values(counts));
  const el = document.getElementById('statusChart');
  el.innerHTML = HOUSE_STATUSES.map(s => {
    const c = counts[s] || 0;
    const pct = c / max * 100;
    return `<div class="bar-row">
      <span class="bar-label">${s}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${pct}%; background:${STATUS_COLORS[s]}"></span></span>
      <span class="bar-count">${c}</span>
    </div>`;
  }).join('');
}

function renderUpcoming() {
  const today = todayStr();
  const horizon = addDays(today, 30);
  const items = [];
  state.houses.forEach(h => { if (h.showingDate && h.showingDate >= today && h.showingDate <= horizon) items.push({ date: h.showingDate, label: `Showing — ${h.address}` }); });
  state.schools.forEach(s => { if (s.tourDate && s.tourDate >= today && s.tourDate <= horizon) items.push({ date: s.tourDate, label: `Tour — ${s.name}` }); });
  items.sort((a, b) => a.date.localeCompare(b.date));
  const el = document.getElementById('upcomingList');
  el.innerHTML = items.length
    ? items.map(i => `<div class="list-item"><span>${escapeHtml(i.label)}</span><span class="li-date">${fmtDate(i.date)}</span></div>`).join('')
    : '<div class="empty-note">No upcoming showings or tours in the next 30 days.</div>';
}

function renderOverdue() {
  const today = todayStr();
  const items = [];
  state.tasks.forEach(t => { if (t.dueDate && t.dueDate < today && t.status !== 'Done') items.push({ date: t.dueDate, label: `Task — ${t.task}` }); });
  state.houses.forEach(h => { if (h.followUpDate && h.followUpDate < today && !['Rejected', 'Purchased'].includes(h.status)) items.push({ date: h.followUpDate, label: `Follow-up — ${h.address}` }); });
  items.sort((a, b) => a.date.localeCompare(b.date));
  const el = document.getElementById('overdueList');
  el.innerHTML = items.length
    ? items.map(i => `<div class="list-item"><span>${escapeHtml(i.label)}</span><span class="li-date">${fmtDate(i.date)}</span></div>`).join('')
    : '<div class="empty-note">Nothing overdue. Nice work.</div>';
}

function renderTopHouses() {
  const scores = computeHouseScores(state.houses, state.weights.house);
  const top = state.houses.slice().sort((a, b) => (scores[b.id]?.score || 0) - (scores[a.id]?.score || 0)).slice(0, 5);
  const columns = [
    { label: 'Address', render: h => escapeHtml(h.address) },
    { label: 'City', render: h => escapeHtml(h.city || '') },
    { label: 'Price', render: h => fmtMoney(h.price) },
    { label: 'House Score', wrap: true, render: h => renderScoreCell(scores[h.id]) },
  ];
  renderTable(document.getElementById('topHousesTable'), columns, top, null, null);
}

function renderComboTable() {
  const houseScores = computeHouseScores(state.houses, state.weights.house);
  const schoolScores = computeSchoolScores(state.schools, state.weights.school);
  const enrollScores = computeEnrollmentScores(state.schools, state.weights.enrollment);
  const schoolById = Object.fromEntries(state.schools.map(s => [s.id, s]));
  const LEVELS = [['elementarySchoolId', 'Elementary'], ['middleSchoolId', 'Middle'], ['highSchoolId', 'High']];
  const combos = [];
  state.houses.forEach(h => {
    LEVELS.forEach(([field, levelLabel]) => {
      const school = schoolById[h[field]];
      if (!school) return;
      const dist = (school.distances || []).find(d => d.houseId === h.id);
      combos.push({
        house: h, school, levelLabel,
        houseScore: houseScores[h.id]?.score || 0,
        schoolScore: schoolScores[school.id]?.score || 0,
        enrollmentProb: enrollScores[school.id]?.score || 0,
        distance: dist ? dist.miles : null,
      });
    });
  });
  const el = document.getElementById('comboTable');
  if (combos.length === 0) { el.innerHTML = '<div class="empty-note">Assign schools to houses to see combinations.</div>'; return; }
  const sortBy = document.getElementById('comboSortBy').value || 'houseScore';
  combos.sort((a, b) => {
    if (sortBy === 'distance') { const da = a.distance ?? Infinity, db = b.distance ?? Infinity; return da - db; }
    return b[sortBy] - a[sortBy];
  });
  const top = combos.slice(0, 5);
  el.innerHTML = `<table><thead><tr><th>House</th><th>School</th><th>House Score</th><th>School Score</th><th>Enrollment Prob.</th><th>Distance</th></tr></thead><tbody>${
    top.map(c => `<tr>
      <td class="wrap">${escapeHtml(c.house.address)}</td>
      <td class="wrap">${escapeHtml(c.school.name)} <span class="muted-note">(${c.levelLabel})</span></td>
      <td>${Math.round(c.houseScore)}</td>
      <td>${Math.round(c.schoolScore)}</td>
      <td>${Math.round(c.enrollmentProb)}</td>
      <td>${c.distance != null ? c.distance + ' mi' : '—'}</td>
    </tr>`).join('')
  }</tbody></table>`;
}

function renderCompareSelect() {
  const el = document.getElementById('compareSelect');
  el.innerHTML = state.houses.map(h =>
    `<label><input type="checkbox" class="compare-cb" value="${h.id}" ${compareSelection.has(h.id) ? 'checked' : ''}> ${escapeHtml(h.address)}</label>`
  ).join('') || '<span class="empty-note">Add a house to enable comparison.</span>';
  el.querySelectorAll('.compare-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) compareSelection.add(cb.value); else compareSelection.delete(cb.value);
      renderCompareTable();
    });
  });
}

function renderCompareTable() {
  renderCompareRadar();
  const houses = state.houses.filter(h => compareSelection.has(h.id));
  const el = document.getElementById('compareTable');
  if (houses.length === 0) { el.innerHTML = '<div class="empty-note">Select two or more houses above to compare them side by side.</div>'; return; }
  const houseScores = computeHouseScores(state.houses, state.weights.house);
  const schoolScores = computeSchoolScores(state.schools, state.weights.school);
  const enrollScores = computeEnrollmentScores(state.schools, state.weights.enrollment);
  const schoolById = Object.fromEntries(state.schools.map(s => [s.id, s]));
  function schoolCell(sid) {
    const s = schoolById[sid];
    if (!s) return '—';
    const sc = Math.round(schoolScores[s.id]?.score || 0);
    const ep = Math.round(enrollScores[s.id]?.score || 0);
    return `${s.name} (School ${sc}, Enroll ${ep})`;
  }
  const rows = [
    { label: 'City', get: h => h.city },
    { label: 'Price', get: h => fmtMoney(h.price) },
    { label: 'Est. Monthly Payment', get: h => fmtMoney(h.estMonthlyPayment) },
    { label: 'HOA', get: h => (h.hoa || h.hoa === 0) ? fmtMoney(h.hoa) + '/mo' : '—' },
    { label: 'Sqft', get: h => h.sqft ? Number(h.sqft).toLocaleString() : '—' },
    { label: 'Beds / Baths', get: h => `${h.bedrooms ?? '—'} / ${h.bathrooms ?? '—'}` },
    { label: 'Year Built', get: h => h.yearBuilt },
    { label: 'Condition', get: h => (h.condition ?? '—') + '/5' },
    { label: 'Commute', get: h => (h.commuteTimeMin ?? '—') + ' min' },
    { label: 'Status', get: h => h.status },
    { label: 'House Score', get: h => Math.round(houseScores[h.id]?.score || 0) },
    { label: 'Elementary', get: h => schoolCell(h.elementarySchoolId) },
    { label: 'Middle', get: h => schoolCell(h.middleSchoolId) },
    { label: 'High', get: h => schoolCell(h.highSchoolId) },
    { label: 'Pros', get: h => h.pros },
    { label: 'Cons', get: h => h.cons },
  ];
  let html = '<table><thead><tr><th></th>' + houses.map(h => `<th>${escapeHtml(h.address)}</th>`).join('') + '</tr></thead><tbody>';
  rows.forEach(r => {
    html += `<tr><td>${r.label}</td>` + houses.map(h => `<td class="wrap">${escapeHtml(String(r.get(h) ?? '—'))}</td>`).join('') + '</tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

// ---------- radar chart ----------
function buildRadarSvg(factorLabels, series) {
  const size = 220, center = size / 2, maxR = 82;
  const n = factorLabels.length;
  const angleFor = i => (-90 + i * 360 / n) * Math.PI / 180;

  let gridSvg = '';
  [25, 50, 75, 100].forEach(pct => {
    const r = maxR * pct / 100;
    const pts = factorLabels.map((_, i) => {
      const a = angleFor(i);
      return `${(center + r * Math.cos(a)).toFixed(1)},${(center + r * Math.sin(a)).toFixed(1)}`;
    }).join(' ');
    gridSvg += `<polygon points="${pts}" fill="none" stroke="var(--gridline)" stroke-width="1"/>`;
  });

  let axesSvg = '';
  factorLabels.forEach((label, i) => {
    const a = angleFor(i);
    const x2 = center + maxR * Math.cos(a), y2 = center + maxR * Math.sin(a);
    axesSvg += `<line x1="${center}" y1="${center}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--gridline)" stroke-width="1"/>`;
    const lx = center + (maxR + 16) * Math.cos(a), ly = center + (maxR + 16) * Math.sin(a);
    const anchor = Math.cos(a) > 0.3 ? 'start' : (Math.cos(a) < -0.3 ? 'end' : 'middle');
    axesSvg += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="10" fill="var(--text-muted)" text-anchor="${anchor}" dominant-baseline="middle">${escapeHtml(label)}</text>`;
  });

  let seriesSvg = '';
  series.forEach(s => {
    const pts = s.values.map((v, i) => {
      const a = angleFor(i);
      const r = maxR * Math.max(0, Math.min(100, v)) / 100;
      return `${(center + r * Math.cos(a)).toFixed(1)},${(center + r * Math.sin(a)).toFixed(1)}`;
    }).join(' ');
    seriesSvg += `<polygon points="${pts}" fill="${s.color}" fill-opacity="0.15" stroke="${s.color}" stroke-width="2"/>`;
  });

  const legend = series.map(s => `<span class="radar-legend-item"><span class="radar-swatch" style="background:${s.color}"></span>${escapeHtml(s.label)}</span>`).join('');
  return `<div class="radar-wrap"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${gridSvg}${axesSvg}${seriesSvg}</svg><div class="radar-legend">${legend}</div></div>`;
}

const RADAR_COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)'];

function renderCompareRadar() {
  const el = document.getElementById('compareRadar');
  const houses = state.houses.filter(h => compareSelection.has(h.id));
  if (houses.length === 0) { el.innerHTML = ''; return; }
  const scores = computeHouseScores(state.houses, state.weights.house);
  const factorLabels = HOUSE_FACTORS.map(f => f.label);
  const series = houses.map((h, i) => ({
    label: h.address,
    color: RADAR_COLORS[i % RADAR_COLORS.length],
    values: (scores[h.id]?.breakdown || []).map(b => b.normalized),
  }));
  el.innerHTML = buildRadarSvg(factorLabels, series);
}

// ---------- printable reports ----------
function buildHouseReportHtml(h) {
  const schoolRows = [['Elementary', h.elementarySchoolId], ['Middle', h.middleSchoolId], ['High', h.highSchoolId]]
    .filter(([, id]) => id)
    .map(([label, id]) => `<tr><td>${label} School</td><td>${escapeHtml(schoolNameById(id) || '—')}</td></tr>`).join('');
  return `<div class="print-report">
    <h1>${escapeHtml(h.address)}</h1>
    <p class="print-meta">${escapeHtml(h.city || '')} &middot; ${fmtMoney(h.price)} &middot; ${h.sqft ? Number(h.sqft).toLocaleString() + ' sqft' : '—'} &middot; ${h.bedrooms ?? '—'} bd / ${h.bathrooms ?? '—'} ba</p>
    <table class="print-table">
      <tr><td>Status</td><td>${escapeHtml(h.status || '—')}</td></tr>
      <tr><td>Est. Monthly Payment</td><td>${fmtMoney(h.estMonthlyPayment)}</td></tr>
      <tr><td>HOA</td><td>${(h.hoa || h.hoa === 0) ? fmtMoney(h.hoa) + '/mo' : '—'}</td></tr>
      <tr><td>Year Built</td><td>${h.yearBuilt || '—'}</td></tr>
      <tr><td>Condition</td><td>${h.condition ?? '—'}/5</td></tr>
      <tr><td>Commute</td><td>${h.commuteTimeMin ?? '—'} min</td></tr>
      <tr><td>Showing Date</td><td>${fmtDate(h.showingDate)}</td></tr>
      <tr><td>Follow-up Date</td><td>${fmtDate(h.followUpDate)}</td></tr>
      ${schoolRows}
      <tr><td>Offer Price</td><td>${fmtMoney(h.offerPrice)}</td></tr>
      <tr><td>Financing Status</td><td>${escapeHtml(h.financingStatus || '—')}</td></tr>
      <tr><td>Closing Date</td><td>${fmtDate(h.closingDate)}</td></tr>
    </table>
    ${(h.tags || []).length ? `<p><strong>Tags:</strong> ${(h.tags || []).map(escapeHtml).join(', ')}</p>` : ''}
    <h3>Pros</h3><p>${escapeHtml(h.pros || '—')}</p>
    <h3>Cons</h3><p>${escapeHtml(h.cons || '—')}</p>
    <h3>Notes</h3><p>${escapeHtml(h.notes || '—')}</p>
    <p class="print-footer">Generated ${fmtDate(todayStr())} — House Hunt &amp; School Tracker</p>
  </div>`;
}

function buildComparisonReportHtml(houses) {
  const houseScores = computeHouseScores(state.houses, state.weights.house);
  const schoolScores = computeSchoolScores(state.schools, state.weights.school);
  const enrollScores = computeEnrollmentScores(state.schools, state.weights.enrollment);
  const schoolById = Object.fromEntries(state.schools.map(s => [s.id, s]));
  const schoolCell = sid => {
    const s = schoolById[sid];
    if (!s) return '—';
    return `${s.name} (School ${Math.round(schoolScores[s.id]?.score || 0)}, Enroll ${Math.round(enrollScores[s.id]?.score || 0)})`;
  };
  const rows = [
    { label: 'City', get: h => h.city },
    { label: 'Price', get: h => fmtMoney(h.price) },
    { label: 'Sqft', get: h => h.sqft ? Number(h.sqft).toLocaleString() : '—' },
    { label: 'Beds / Baths', get: h => `${h.bedrooms ?? '—'} / ${h.bathrooms ?? '—'}` },
    { label: 'Commute', get: h => (h.commuteTimeMin ?? '—') + ' min' },
    { label: 'House Score', get: h => Math.round(houseScores[h.id]?.score || 0) },
    { label: 'Elementary', get: h => schoolCell(h.elementarySchoolId) },
    { label: 'Middle', get: h => schoolCell(h.middleSchoolId) },
    { label: 'High', get: h => schoolCell(h.highSchoolId) },
  ];
  let rowsHtml = '';
  rows.forEach(r => { rowsHtml += `<tr><td>${r.label}</td>${houses.map(h => `<td>${escapeHtml(String(r.get(h) ?? '—'))}</td>`).join('')}</tr>`; });
  return `<div class="print-report">
    <h1>House Comparison</h1>
    <table class="print-table print-compare-table">
      <tr><th></th>${houses.map(h => `<th>${escapeHtml(h.address)}</th>`).join('')}</tr>
      ${rowsHtml}
    </table>
    <p class="print-footer">Generated ${fmtDate(todayStr())} — House Hunt &amp; School Tracker</p>
  </div>`;
}

function printHouseReport(house) {
  document.getElementById('printArea').innerHTML = buildHouseReportHtml(house);
  window.print();
}
function printComparisonReport() {
  const houses = state.houses.filter(h => compareSelection.has(h.id));
  if (!houses.length) { alert('Select at least one house in the comparison section first.'); return; }
  document.getElementById('printArea').innerHTML = buildComparisonReportHtml(houses);
  window.print();
}
window.addEventListener('afterprint', () => { document.getElementById('printArea').innerHTML = ''; });

// ---------- weights ----------
function updateWeightTotal(group) {
  const w = state.weights[group];
  const total = Object.values(w).reduce((s, v) => s + Number(v || 0), 0);
  const elx = document.querySelector(`.weight-total[data-group="${group}"]`);
  if (elx) elx.textContent = `Weights sum to ${total}%${total !== 100 ? ' (auto-normalized to 100% when scoring)' : ''}`;
}

function renderPresetBar() {
  const el = document.getElementById('presetBar');
  const presets = state.weightPresets || [];
  const options = presets.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  el.innerHTML = `
    <select id="presetSelect">${presets.length ? '<option value="">— Select preset —</option>' + options : '<option value="">No saved presets yet</option>'}</select>
    <button class="btn small" id="applyPresetBtn" ${presets.length ? '' : 'disabled'}>Apply</button>
    <button class="btn small danger" id="deletePresetBtn" ${presets.length ? '' : 'disabled'}>Delete</button>
    <input type="text" id="presetNameInput" placeholder="New preset name…">
    <button class="btn small primary" id="savePresetBtn">Save current as preset</button>`;
  document.getElementById('applyPresetBtn').addEventListener('click', () => {
    const preset = presets.find(p => p.id === document.getElementById('presetSelect').value);
    if (!preset) return;
    state.weights = JSON.parse(JSON.stringify(preset.weights));
    logActivity('applied', `Applied weight preset — ${preset.name}`);
    scheduleSave();
    renderWeightsGrid(); renderDashboard(); renderHouses(); renderSchools();
  });
  document.getElementById('deletePresetBtn').addEventListener('click', () => {
    const preset = presets.find(p => p.id === document.getElementById('presetSelect').value);
    if (!preset) return;
    if (!confirm(`Delete preset "${preset.name}"?`)) return;
    state.weightPresets = presets.filter(p => p.id !== preset.id);
    logActivity('deleted', `Deleted weight preset — ${preset.name}`);
    scheduleSave();
    renderPresetBar();
    renderActivity();
  });
  document.getElementById('savePresetBtn').addEventListener('click', () => {
    const nameInput = document.getElementById('presetNameInput');
    const name = nameInput.value.trim();
    if (!name) { alert('Enter a name for this preset.'); return; }
    state.weightPresets = presets.concat([{ id: uid('wp'), name, weights: JSON.parse(JSON.stringify(state.weights)) }]);
    logActivity('added', `Saved weight preset — ${name}`);
    scheduleSave();
    renderPresetBar();
    renderActivity();
  });
}

function renderWeightsGrid() {
  renderPresetBar();
  const groups = [
    { key: 'house', title: 'House Score', factors: HOUSE_FACTORS.map(f => ({ key: f.key, label: f.label })) },
    { key: 'school', title: 'School Score', factors: SCHOOL_FACTORS.map(f => ({ key: f.key, label: f.label })) },
    { key: 'enrollment', title: 'Enrollment Probability', factors: [{ key: 'method', label: 'Enrollment Method' }, { key: 'waitlist', label: 'Waitlist Status' }] },
  ];
  const el = document.getElementById('weightsGrid');
  el.innerHTML = groups.map(g => {
    const w = state.weights[g.key];
    const total = Object.values(w).reduce((s, v) => s + Number(v || 0), 0);
    const rows = g.factors.map(f => `
      <div class="weight-row">
        <span>${f.label}</span>
        <input type="range" min="0" max="100" value="${w[f.key]}" data-group="${g.key}" data-factor="${f.key}">
        <span class="weight-val">${w[f.key]}%</span>
      </div>`).join('');
    return `<div class="weight-group">
      <h3>${g.title}</h3>
      <div class="weight-total" data-group="${g.key}">Weights sum to ${total}%${total !== 100 ? ' (auto-normalized to 100% when scoring)' : ''}</div>
      ${rows}
    </div>`;
  }).join('');
  el.querySelectorAll('input[type=range]').forEach(inp => {
    inp.addEventListener('input', () => {
      state.weights[inp.dataset.group][inp.dataset.factor] = Number(inp.value);
      inp.nextElementSibling.textContent = inp.value + '%';
      updateWeightTotal(inp.dataset.group);
      scheduleSave();
      renderHouses();
      renderSchools();
      renderTopHouses();
      renderComboTable();
      renderCompareTable();
    });
  });
}

// ---------- modal / editing ----------
const modalRoot = document.getElementById('modalRoot');
const modalTitleEl = document.getElementById('modalTitle');
const modalBodyEl = document.getElementById('modalBody');
const modalDeleteBtn = document.getElementById('modalDeleteBtn');
let currentModalSave = null;
let currentModalDelete = null;

function closeModal() { modalRoot.classList.add('hidden'); currentModalSave = null; currentModalDelete = null; }
function openModal(title, bodyHtml, { onSave, onDelete }) {
  modalTitleEl.textContent = title;
  modalBodyEl.innerHTML = bodyHtml;
  currentModalSave = onSave;
  currentModalDelete = onDelete;
  modalDeleteBtn.classList.toggle('hidden', !onDelete);
  modalRoot.classList.remove('hidden');
}

function fieldHtml({ key, label, type, value, options, full }) {
  const idAttr = `id="f_${key}"`;
  value = value ?? '';
  let input;
  if (type === 'select') {
    input = `<select ${idAttr}>${options.map(o => {
      const ov = (o && typeof o === 'object') ? o.value : o;
      const ol = (o && typeof o === 'object') ? o.label : o;
      return `<option value="${escapeAttr(ov)}" ${String(value) === String(ov) ? 'selected' : ''}>${escapeHtml(ol)}</option>`;
    }).join('')}</select>`;
  } else if (type === 'textarea') {
    input = `<textarea ${idAttr}>${escapeHtml(value)}</textarea>`;
  } else {
    input = `<input ${idAttr} type="${type}" value="${escapeAttr(value)}">`;
  }
  return `<div class="form-field ${full ? 'full' : ''}"><label for="f_${key}">${label}</label>${input}</div>`;
}

// ---------- house file attachments ----------
async function fetchHouseFiles(houseId) {
  const res = await fetch(`/api/houses/${encodeURIComponent(houseId)}/files`, { credentials: 'include' });
  return res.ok ? res.json() : [];
}
async function uploadHouseFile(houseId, file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`/api/houses/${encodeURIComponent(houseId)}/files`, { method: 'POST', credentials: 'include', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.error || `Upload failed for ${file.name}.`);
  }
}
async function deleteHouseFile(houseId, filename) {
  await fetch(`/api/houses/${encodeURIComponent(houseId)}/files/${encodeURIComponent(filename)}`, { method: 'DELETE', credentials: 'include' });
}
async function deleteAllHouseFiles(houseId) {
  await fetch(`/api/houses/${encodeURIComponent(houseId)}/files`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
}
function fileDisplayName(name) { return name.replace(/^\d+-/, ''); }
function fileUrl(houseId, name) { return `/uploads/${encodeURIComponent(houseId)}/${encodeURIComponent(name)}`; }

function renderFileGallery(container, houseId, files) {
  const photos = files.filter(f => f.kind === 'photo');
  const docs = files.filter(f => f.kind === 'document');
  let html = '';
  if (photos.length) {
    html += `<div class="file-thumbs">${photos.map(f => `
      <div class="file-thumb">
        <a href="${fileUrl(houseId, f.name)}" target="_blank" rel="noopener"><img src="${fileUrl(houseId, f.name)}" alt="${escapeAttr(fileDisplayName(f.name))}"></a>
        <button type="button" class="file-delete-btn" data-name="${escapeAttr(f.name)}" title="Delete">&times;</button>
      </div>`).join('')}</div>`;
  }
  if (docs.length) {
    html += `<div class="file-doc-list">${docs.map(f => `
      <div class="file-doc-row">
        <a href="${fileUrl(houseId, f.name)}" target="_blank" rel="noopener">${escapeHtml(fileDisplayName(f.name))}</a>
        <span class="muted-note">${(f.size / 1024).toFixed(0)} KB</span>
        <button type="button" class="file-delete-btn" data-name="${escapeAttr(f.name)}" title="Delete">&times;</button>
      </div>`).join('')}</div>`;
  }
  container.innerHTML = html || '<div class="empty-note">No files uploaded yet.</div>';
  container.querySelectorAll('.file-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this file?')) return;
      await deleteHouseFile(houseId, btn.dataset.name);
      renderFileGallery(container, houseId, await fetchHouseFiles(houseId));
    });
  });
}

// ---------- optional integrations: geocoding / commute / listing import ----------
function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeAddress(address) {
  const res = await fetch('/api/geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ address }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Geocoding failed.');
  return data;
}
async function fetchCommuteTime(origin, destination) {
  const res = await fetch('/api/commute-time', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ origin, destination }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Commute time lookup failed.');
  return data.minutes;
}
async function importListing(url) {
  const res = await fetch('/api/import-listing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ url }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Import failed.');
  return data;
}

function wireGeocodeButton(btnId, statusId, addressFn, onResult) {
  document.getElementById(btnId).addEventListener('click', async () => {
    const statusEl = document.getElementById(statusId);
    const address = addressFn();
    if (!address.trim()) { alert('Enter an address first.'); return; }
    statusEl.textContent = 'Geocoding…';
    try {
      const result = await geocodeAddress(address);
      onResult(result);
      statusEl.textContent = `Located at ${result.lat.toFixed(4)}, ${result.lng.toFixed(4)} (${appConfig.geocodingProvider === 'google' ? 'Google Maps' : 'OpenStreetMap'})`;
    } catch (e) {
      statusEl.textContent = e.message;
    }
  });
}

// ---------- map tab ----------
function getHouseAddress(h) {
  return `${h.address}${h.city ? ', ' + h.city + ', CO' : ', Colorado'}`;
}
function getSchoolAddress(s) {
  const addr = s.location || s.address || '';
  const city = s.city;
  if (!city || addr.includes(city)) return addr;
  return addr ? `${addr}, ${city}` : city;
}
async function geocodeMissingItems(items, addressFn, onProgress) {
  const missing = items.filter(item => typeof item.lat !== 'number' || typeof item.lng !== 'number');
  let done = 0;
  for (const item of missing) {
    try {
      const addr = addressFn(item);
      if (addr) {
        const result = await geocodeAddress(addr);
        item.lat = result.lat;
        item.lng = result.lng;
      }
    } catch (e) {
      // skip this item, don't abort
    }
    done++;
    onProgress(done, missing.length);
    if (appConfig.geocodingProvider === 'nominatim' && done < missing.length) {
      await new Promise(r => setTimeout(r, 1100));
    }
  }
}
async function geocodeAllMissing() {
  const missingHouses = state.houses.filter(h => h.address && (typeof h.lat !== 'number' || typeof h.lng !== 'number'));
  const missingSchools = state.schools.filter(s => getSchoolAddress(s) && (typeof s.lat !== 'number' || typeof s.lng !== 'number'));
  const totalMissing = missingHouses.length + missingSchools.length;

  if (totalMissing === 0) {
    document.getElementById('geocodeAllStatus').textContent = state.houses.length + state.schools.length === 0 ? 'Nothing to geocode.' : 'Everything is already geocoded.';
    return;
  }

  let globalDone = 0;
  const statusEl = document.getElementById('geocodeAllStatus');
  const updateProgress = (done, total) => {
    globalDone++;
    statusEl.textContent = `Geocoding ${globalDone} of ${totalMissing}…`;
  };

  await geocodeMissingItems(missingHouses, getHouseAddress, updateProgress);
  await geocodeMissingItems(missingSchools, getSchoolAddress, updateProgress);

  scheduleSave();
  renderMapMarkers();
  populateDistanceSelects();
  const newMissing = state.houses.filter(h => h.address && (typeof h.lat !== 'number' || typeof h.lng !== 'number')).length +
                     state.schools.filter(s => getSchoolAddress(s) && (typeof s.lat !== 'number' || typeof s.lng !== 'number')).length;
  const geocoded = totalMissing - newMissing;
  statusEl.textContent = `Geocoded ${geocoded} of ${totalMissing}${newMissing > 0 ? ` (${newMissing} could not be located)` : ''}.`;
}
function initMapTabOnce() {
  if (mapInitialized) return;
  mapInitialized = true;

  mapInstance = L.map('mapContainer');
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(mapInstance);
  mapInstance.setView([39.5, -104.9], 10);

  mapHouseLayer = L.layerGroup().addTo(mapInstance);
  mapSchoolLayer = L.layerGroup().addTo(mapInstance);

  renderMapMarkers();
}
function renderMapMarkers() {
  if (!mapInstance) return;

  mapHouseLayer.clearLayers();
  mapSchoolLayer.clearLayers();

  const bounds = [];

  state.houses.forEach(h => {
    if (typeof h.lat === 'number' && typeof h.lng === 'number') {
      const marker = L.circleMarker([h.lat, h.lng], {
        radius: 8,
        color: '#2a78d6',
        fillColor: '#2a78d6',
        fillOpacity: 0.85,
        weight: 2
      }).bindPopup(`<strong>${escapeHtml(h.address)}</strong><br>${escapeHtml(h.city || '')}`);
      mapHouseLayer.addLayer(marker);
      bounds.push([h.lat, h.lng]);
    }
  });

  state.schools.forEach(s => {
    if (typeof s.lat === 'number' && typeof s.lng === 'number') {
      const marker = L.circleMarker([s.lat, s.lng], {
        radius: 8,
        color: '#1baf7a',
        fillColor: '#1baf7a',
        fillOpacity: 0.85,
        weight: 2
      }).bindPopup(`<strong>${escapeHtml(s.name)}</strong><br>${escapeHtml(getSchoolAddress(s))}`);
      mapSchoolLayer.addLayer(marker);
      bounds.push([s.lat, s.lng]);
    }
  });

  if (bounds.length > 0) {
    mapInstance.fitBounds(L.latLngBounds(bounds), { padding: [30, 30] });
  }
}
function populateDistanceSelects() {
  const houseSelect = document.getElementById('distanceHouseSelect');
  const schoolSelect = document.getElementById('distanceSchoolSelect');

  const houseOpts = [{ value: '', label: '— select a house —' }, ...state.houses.map(h => ({ value: h.id, label: getHouseAddress(h) }))];
  const schoolOpts = [{ value: '', label: '— select a school —' }, ...state.schools.map(s => ({ value: s.id, label: s.name }))];

  const currentHouse = houseSelect.value;
  const currentSchool = schoolSelect.value;

  houseSelect.innerHTML = houseOpts.map(o => `<option value="${escapeAttr(o.value)}">${escapeHtml(o.label)}</option>`).join('');
  schoolSelect.innerHTML = schoolOpts.map(o => `<option value="${escapeAttr(o.value)}">${escapeHtml(o.label)}</option>`).join('');

  if (houseOpts.some(o => o.value === currentHouse)) houseSelect.value = currentHouse;
  if (schoolOpts.some(o => o.value === currentSchool)) schoolSelect.value = currentSchool;
}
async function renderDistancePanel() {
  const houseId = document.getElementById('distanceHouseSelect').value;
  const schoolId = document.getElementById('distanceSchoolSelect').value;
  const resultEl = document.getElementById('distanceResult');

  if (!houseId || !schoolId) {
    resultEl.innerHTML = 'Select a house and a school to see the straight-line distance.';
    return;
  }

  const house = state.houses.find(h => h.id === houseId);
  const school = state.schools.find(s => s.id === schoolId);

  if (!house || !school) return;

  // Geocode on the fly if needed
  if (typeof house.lat !== 'number' || typeof house.lng !== 'number') {
    resultEl.innerHTML = '<div class="empty-note">Locating house…</div>';
    try {
      const result = await geocodeAddress(getHouseAddress(house));
      house.lat = result.lat;
      house.lng = result.lng;
      scheduleSave();
      renderMapMarkers();
    } catch (e) {
      resultEl.innerHTML = `<div class="empty-note">Could not locate house: ${escapeHtml(e.message)}</div>`;
      return;
    }
  }

  if (typeof school.lat !== 'number' || typeof school.lng !== 'number') {
    resultEl.innerHTML = '<div class="empty-note">Locating school…</div>';
    try {
      const result = await geocodeAddress(getSchoolAddress(school));
      school.lat = result.lat;
      school.lng = result.lng;
      scheduleSave();
      renderMapMarkers();
    } catch (e) {
      resultEl.innerHTML = `<div class="empty-note">Could not locate school: ${escapeHtml(e.message)}</div>`;
      return;
    }
  }

  // Both have coordinates now, compute distance
  const miles = haversineMiles(house.lat, house.lng, school.lat, school.lng);
  resultEl.innerHTML = `<div class="distance-result-value">${miles.toFixed(1)} mi</div><div class="distance-result-sub">Straight-line distance from ${escapeHtml(house.address)} to ${escapeHtml(school.name)}</div>`;
}
function renderMap() {
  populateDistanceSelects();
  renderMapMarkers();
}

function openHouseModal(house) {
  const isNew = !house;
  const h = house ? { ...house } : {
    id: uid('h'), address: '', listingUrl: '', city: '', price: '', estMonthlyPayment: '', propertyTax: '', hoa: '',
    sqft: '', bedrooms: '', bathrooms: '', lotSize: '', yearBuilt: '', condition: 3, requiredRepairs: '',
    elementarySchoolId: '', middleSchoolId: '', highSchoolId: '', commuteTimeMin: '', showingDate: '',
    status: 'Researching', followUpDate: '', pros: '', cons: '', notes: '', tags: [],
    offerPrice: '', offerDate: '', counterPrice: '', contingencies: '', closingDate: '', financingStatus: 'Not Started',
    lat: null, lng: null,
  };
  const elemOptions = [{ value: '', label: '— none —' }, ...state.schools.filter(s => s.type === 'Elementary').map(s => ({ value: s.id, label: s.name }))];
  const midOptions = [{ value: '', label: '— none —' }, ...state.schools.filter(s => s.type === 'Middle').map(s => ({ value: s.id, label: s.name }))];
  const highOptions = [{ value: '', label: '— none —' }, ...state.schools.filter(s => s.type === 'High').map(s => ({ value: s.id, label: s.name }))];
  const body = `<div class="form-grid">
    ${fieldHtml({ key: 'address', label: 'Address', type: 'text', value: h.address, full: true })}
    <div class="form-field full">
      <input type="hidden" id="f_lat" value="${h.lat ?? ''}">
      <input type="hidden" id="f_lng" value="${h.lng ?? ''}">
      <div class="inline-btn-row">
        <button type="button" class="btn small" id="geocodeHouseBtn">Geocode Address</button>
        <span id="geocodeHouseStatus" class="muted-note">${h.lat != null ? `Located at ${Number(h.lat).toFixed(4)}, ${Number(h.lng).toFixed(4)}` : 'Not geocoded yet'}</span>
      </div>
    </div>
    ${fieldHtml({ key: 'listingUrl', label: 'Listing URL', type: 'text', value: h.listingUrl, full: true })}
    <div class="form-field full">
      <div class="inline-btn-row">
        <button type="button" class="btn small" id="importListingBtn">Import from Listing URL</button>
        <span id="importListingStatus" class="muted-note"></span>
      </div>
      <div id="importListingResult"></div>
    </div>
    ${fieldHtml({ key: 'city', label: 'City', type: 'text', value: h.city })}
    ${fieldHtml({ key: 'price', label: 'Price ($)', type: 'number', value: h.price })}
    ${fieldHtml({ key: 'estMonthlyPayment', label: 'Est. Monthly Payment ($)', type: 'number', value: h.estMonthlyPayment })}
    ${fieldHtml({ key: 'propertyTax', label: 'Property Tax ($/yr)', type: 'number', value: h.propertyTax })}
    ${fieldHtml({ key: 'hoa', label: 'HOA ($/mo)', type: 'number', value: h.hoa })}
    ${fieldHtml({ key: 'sqft', label: 'Square Footage', type: 'number', value: h.sqft })}
    ${fieldHtml({ key: 'bedrooms', label: 'Bedrooms', type: 'number', value: h.bedrooms })}
    ${fieldHtml({ key: 'bathrooms', label: 'Bathrooms', type: 'number', value: h.bathrooms })}
    ${fieldHtml({ key: 'lotSize', label: 'Lot Size', type: 'text', value: h.lotSize })}
    ${fieldHtml({ key: 'yearBuilt', label: 'Year Built', type: 'number', value: h.yearBuilt })}
    ${fieldHtml({ key: 'condition', label: 'Condition (1=poor, 5=excellent)', type: 'select', value: h.condition, options: [1, 2, 3, 4, 5] })}
    ${fieldHtml({ key: 'commuteTimeMin', label: 'Commute Time (min)', type: 'number', value: h.commuteTimeMin })}
    <div class="form-field">
      <label>&nbsp;</label>
      <div class="inline-btn-row">
        <button type="button" class="btn small" id="refreshCommuteBtn" ${appConfig.commuteAvailable ? '' : 'disabled title="Set GEOCODE_API_KEY (a Google Maps API key) on the server to enable this."'}>Refresh Commute Time</button>
      </div>
    </div>
    ${fieldHtml({ key: 'elementarySchoolId', label: 'Elementary School', type: 'select', value: h.elementarySchoolId, options: elemOptions })}
    ${fieldHtml({ key: 'middleSchoolId', label: 'Middle School', type: 'select', value: h.middleSchoolId, options: midOptions })}
    ${fieldHtml({ key: 'highSchoolId', label: 'High School', type: 'select', value: h.highSchoolId, options: highOptions })}
    <div class="form-field full">
      <div class="inline-btn-row">
        <button type="button" class="btn small" id="suggestSchoolsBtn">Suggest Nearby Schools</button>
        <span class="muted-note">Straight-line distance only — always verify against official DCSD boundaries.</span>
      </div>
      <div id="suggestSchoolsResult"></div>
    </div>
    ${fieldHtml({ key: 'status', label: 'Status', type: 'select', value: h.status, options: HOUSE_STATUSES })}
    ${fieldHtml({ key: 'showingDate', label: 'Showing Date', type: 'date', value: h.showingDate })}
    ${fieldHtml({ key: 'followUpDate', label: 'Follow-up Date', type: 'date', value: h.followUpDate })}
    ${fieldHtml({ key: 'tags', label: 'Tags (comma-separated)', type: 'text', value: (h.tags || []).join(', '), full: true })}
    ${fieldHtml({ key: 'requiredRepairs', label: 'Required Repairs', type: 'textarea', value: h.requiredRepairs, full: true })}
    ${fieldHtml({ key: 'pros', label: 'Pros', type: 'textarea', value: h.pros, full: true })}
    ${fieldHtml({ key: 'cons', label: 'Cons', type: 'textarea', value: h.cons, full: true })}
    ${fieldHtml({ key: 'notes', label: 'Notes', type: 'textarea', value: h.notes, full: true })}
  </div>
  <h4 style="margin:16px 0 8px;font-size:13px;">Offer Tracking</h4>
  <div class="form-grid">
    ${fieldHtml({ key: 'offerPrice', label: 'Offer Price ($)', type: 'number', value: h.offerPrice })}
    ${fieldHtml({ key: 'offerDate', label: 'Offer Date', type: 'date', value: h.offerDate })}
    ${fieldHtml({ key: 'counterPrice', label: 'Counter Price ($)', type: 'number', value: h.counterPrice })}
    ${fieldHtml({ key: 'closingDate', label: 'Closing Date', type: 'date', value: h.closingDate })}
    ${fieldHtml({ key: 'financingStatus', label: 'Financing Status', type: 'select', value: h.financingStatus, options: FINANCING_STATUSES })}
    ${fieldHtml({ key: 'contingencies', label: 'Contingencies', type: 'textarea', value: h.contingencies, full: true })}
  </div>
  ${isNew ? '' : `
  <h4 style="margin:16px 0 8px;font-size:13px;">Photos &amp; Documents</h4>
  <input type="file" id="fileUploadInput" class="file-upload-input" multiple accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.txt,.xlsx,.xls">
  <div id="fileGallery" class="file-gallery"><span class="empty-note">Loading…</span></div>`}`;
  openModal(isNew ? 'Add House' : 'Edit House', body, {
    onSave: () => {
      const updated = {
        id: h.id, address: val('address'), listingUrl: val('listingUrl'), city: val('city'),
        price: numVal('price'), estMonthlyPayment: numVal('estMonthlyPayment'), propertyTax: numVal('propertyTax'), hoa: numVal('hoa'),
        sqft: numVal('sqft'), bedrooms: numVal('bedrooms'), bathrooms: numVal('bathrooms'), lotSize: val('lotSize'),
        yearBuilt: numVal('yearBuilt'), condition: numVal('condition'), requiredRepairs: val('requiredRepairs'),
        elementarySchoolId: val('elementarySchoolId'), middleSchoolId: val('middleSchoolId'), highSchoolId: val('highSchoolId'),
        commuteTimeMin: numVal('commuteTimeMin'), showingDate: val('showingDate'), status: val('status'),
        followUpDate: val('followUpDate'), pros: val('pros'), cons: val('cons'), notes: val('notes'),
        tags: parseTags(val('tags')),
        offerPrice: numVal('offerPrice'), offerDate: val('offerDate'), counterPrice: numVal('counterPrice'),
        contingencies: val('contingencies'), closingDate: val('closingDate'), financingStatus: val('financingStatus'),
        lat: numVal('lat'), lng: numVal('lng'),
      };
      if (!updated.address) { alert('Address is required.'); return; }
      if (isNew) { state.houses.push(updated); logActivity('added', `Added house — ${updated.address}`); }
      else { Object.assign(house, updated); logActivity('edited', `Edited house — ${updated.address}`); }
      closeModal(); scheduleSave(); renderAll();
    },
    onDelete: isNew ? null : () => {
      state.houses = state.houses.filter(x => x.id !== house.id);
      compareSelection.delete(house.id);
      logActivity('deleted', `Deleted house — ${house.address}`);
      deleteAllHouseFiles(house.id);
      closeModal(); scheduleSave(); renderAll();
    }
  });
  if (!isNew) {
    const galleryEl = document.getElementById('fileGallery');
    fetchHouseFiles(h.id).then(files => renderFileGallery(galleryEl, h.id, files));
    document.getElementById('fileUploadInput').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) await uploadHouseFile(h.id, file);
      e.target.value = '';
      renderFileGallery(galleryEl, h.id, await fetchHouseFiles(h.id));
    });
  }

  wireGeocodeButton('geocodeHouseBtn', 'geocodeHouseStatus',
    () => `${val('address')}${val('city') ? ', ' + val('city') : ''}`,
    (result) => { document.getElementById('f_lat').value = result.lat; document.getElementById('f_lng').value = result.lng; });

  document.getElementById('refreshCommuteBtn').addEventListener('click', async () => {
    const destination = state.settings.commuteDestination;
    if (!destination) { alert('Set a commute destination address first, in the Dashboard\'s Integrations card.'); return; }
    if (!val('address')) { alert('Enter an address first.'); return; }
    const btn = document.getElementById('refreshCommuteBtn');
    const origAddress = `${val('address')}${val('city') ? ', ' + val('city') : ''}`;
    btn.disabled = true; btn.textContent = 'Refreshing…';
    try {
      document.getElementById('f_commuteTimeMin').value = await fetchCommuteTime(origAddress, destination);
    } catch (e) {
      alert(e.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Refresh Commute Time';
    }
  });

  document.getElementById('suggestSchoolsBtn').addEventListener('click', () => {
    const resultEl = document.getElementById('suggestSchoolsResult');
    const lat = numVal('lat'), lng = numVal('lng');
    if (lat == null || lng == null) { resultEl.innerHTML = '<div class="empty-note">Geocode this house\'s address first.</div>'; return; }
    const withCoords = state.schools.filter(s => typeof s.lat === 'number' && typeof s.lng === 'number');
    if (!withCoords.length) { resultEl.innerHTML = '<div class="empty-note">No schools have been geocoded yet — open a school and click "Geocode School".</div>'; return; }
    const levels = [['Elementary', 'elementarySchoolId'], ['Middle', 'middleSchoolId'], ['High', 'highSchoolId']];
    let html = '';
    levels.forEach(([type, fieldKey]) => {
      const nearest = withCoords.filter(s => s.type === type)
        .map(s => ({ s, dist: haversineMiles(lat, lng, s.lat, s.lng) }))
        .sort((a, b) => a.dist - b.dist)[0];
      if (!nearest) return;
      html += `<div class="import-row">
        <div><strong>${type}:</strong> ${escapeHtml(nearest.s.name)} (${nearest.dist.toFixed(1)} mi)</div>
        <button type="button" class="btn small" data-field="${fieldKey}" data-schoolid="${nearest.s.id}">Apply</button>
      </div>`;
    });
    resultEl.innerHTML = html || '<div class="empty-note">No geocoded schools of any type found.</div>';
    resultEl.querySelectorAll('button[data-field]').forEach(btn => {
      btn.addEventListener('click', () => { document.getElementById('f_' + btn.dataset.field).value = btn.dataset.schoolid; });
    });
  });

  document.getElementById('importListingBtn').addEventListener('click', async () => {
    const url = val('listingUrl');
    const statusEl = document.getElementById('importListingStatus');
    const resultEl = document.getElementById('importListingResult');
    if (!url) { alert('Enter a listing URL first.'); return; }
    statusEl.textContent = 'Fetching…';
    resultEl.innerHTML = '';
    try {
      const data = await importListing(url);
      statusEl.textContent = '';
      const rows = [];
      if (data.ogTitle || data.title) rows.push({ label: 'Title', value: data.ogTitle || data.title, apply: () => { document.getElementById('f_address').value = data.ogTitle || data.title; } });
      if (data.priceGuess) rows.push({ label: 'Price guess', value: data.priceGuess, apply: () => { document.getElementById('f_price').value = data.priceGuess.replace(/[^0-9]/g, ''); } });
      if (data.description) rows.push({ label: 'Description', value: data.description, apply: () => { const notesEl = document.getElementById('f_notes'); notesEl.value = (notesEl.value ? notesEl.value + '\n\n' : '') + data.description; } });
      if (!rows.length) { resultEl.innerHTML = '<div class="empty-note">Nothing usable found on that page — this site may block imports or not expose the right tags.</div>'; return; }
      resultEl.innerHTML = rows.map((r, i) => `
        <div class="import-row">
          <div><strong>${escapeHtml(r.label)}:</strong> ${escapeHtml(truncate(r.value, 120))}</div>
          <button type="button" class="btn small" data-idx="${i}">Apply</button>
        </div>`).join('') + (data.image ? `<div class="import-image-preview"><img src="${escapeAttr(data.image)}" alt=""></div>` : '');
      resultEl.querySelectorAll('button[data-idx]').forEach(btn => {
        btn.addEventListener('click', () => rows[Number(btn.dataset.idx)].apply());
      });
    } catch (e) {
      statusEl.textContent = e.message;
    }
  });
}

function openApartmentModal(apartment) {
  const isNew = !apartment;
  const a = apartment ? { ...apartment } : {
    id: uid('apt'), name: '', address: '', city: '', zip: '', listingUrl: '',
    rent: '', bedrooms: 1, bathrooms: '', sqft: '',
    leaseTerm: 'Month-to-Month', earlyTermination: 'Unknown — Ask Leasing Office', earlyTerminationDetails: '',
    schoolDistrict: 'Douglas County RE-1', availabilityDate: '', status: 'Researching',
    leasingCompany: '', contactEmail: '', contactPhone: '',
    pros: '', cons: '', notes: '', tags: [],
  };
  const body = `<div class="form-grid">
    ${fieldHtml({ key: 'name', label: 'Complex Name', type: 'text', value: a.name, full: true })}
    ${fieldHtml({ key: 'address', label: 'Address', type: 'text', value: a.address, full: true })}
    ${fieldHtml({ key: 'city', label: 'City', type: 'text', value: a.city })}
    ${fieldHtml({ key: 'zip', label: 'Zip Code', type: 'text', value: a.zip })}
    ${fieldHtml({ key: 'listingUrl', label: 'Listing URL', type: 'text', value: a.listingUrl, full: true })}
    ${fieldHtml({ key: 'rent', label: 'Monthly Rent ($)', type: 'number', value: a.rent })}
    ${fieldHtml({ key: 'bedrooms', label: 'Bedrooms', type: 'number', value: a.bedrooms })}
    ${fieldHtml({ key: 'bathrooms', label: 'Bathrooms', type: 'number', value: a.bathrooms })}
    ${fieldHtml({ key: 'sqft', label: 'Square Footage', type: 'number', value: a.sqft })}
    ${fieldHtml({ key: 'leaseTerm', label: 'Lease Term', type: 'select', value: a.leaseTerm, options: LEASE_TERM_OPTIONS })}
    ${fieldHtml({ key: 'earlyTermination', label: 'Early Termination Option', type: 'select', value: a.earlyTermination, options: EARLY_TERMINATION_OPTIONS })}
    ${fieldHtml({ key: 'earlyTerminationDetails', label: 'Early Termination Details', type: 'textarea', value: a.earlyTerminationDetails, full: true })}
    ${fieldHtml({ key: 'schoolDistrict', label: 'School District', type: 'text', value: a.schoolDistrict })}
    ${fieldHtml({ key: 'availabilityDate', label: 'Availability Date', type: 'date', value: a.availabilityDate })}
    ${fieldHtml({ key: 'status', label: 'Status', type: 'select', value: a.status, options: APARTMENT_STATUSES })}
    ${fieldHtml({ key: 'leasingCompany', label: 'Leasing Company Name', type: 'text', value: a.leasingCompany })}
    ${fieldHtml({ key: 'contactEmail', label: 'Leasing Contact Email', type: 'email', value: a.contactEmail })}
    ${fieldHtml({ key: 'contactPhone', label: 'Leasing Contact Phone', type: 'tel', value: a.contactPhone })}
    ${fieldHtml({ key: 'tags', label: 'Tags (comma-separated)', type: 'text', value: (a.tags || []).join(', '), full: true })}
    ${fieldHtml({ key: 'pros', label: 'Pros', type: 'textarea', value: a.pros, full: true })}
    ${fieldHtml({ key: 'cons', label: 'Cons', type: 'textarea', value: a.cons, full: true })}
    ${fieldHtml({ key: 'notes', label: 'Notes', type: 'textarea', value: a.notes, full: true })}
  </div>`;
  openModal(isNew ? 'Add Apartment' : 'Edit Apartment', body, {
    onSave: () => {
      const updated = {
        id: a.id, name: val('name'), address: val('address'), city: val('city'), zip: val('zip'),
        listingUrl: val('listingUrl'), rent: numVal('rent'), bedrooms: numVal('bedrooms'),
        bathrooms: val('bathrooms'), sqft: numVal('sqft'), leaseTerm: val('leaseTerm'),
        earlyTermination: val('earlyTermination'), earlyTerminationDetails: val('earlyTerminationDetails'),
        schoolDistrict: val('schoolDistrict'), availabilityDate: val('availabilityDate'),
        status: val('status'), leasingCompany: val('leasingCompany'), contactEmail: val('contactEmail'),
        contactPhone: val('contactPhone'), pros: val('pros'), cons: val('cons'), notes: val('notes'),
        tags: parseTags(val('tags')),
      };
      if (!updated.address) { alert('Address is required.'); return; }
      if (isNew) { state.apartments.push(updated); logActivity('added', `Added apartment — ${updated.address}`); }
      else { Object.assign(apartment, updated); logActivity('edited', `Edited apartment — ${updated.address}`); }
      closeModal(); scheduleSave(); renderAll();
    },
    onDelete: isNew ? null : () => {
      state.apartments = state.apartments.filter(x => x.id !== apartment.id);
      logActivity('deleted', `Deleted apartment — ${apartment.address}`);
      closeModal(); scheduleSave(); renderAll();
    }
  });
}

function openSchoolModal(school) {
  const isNew = !school;
  const s = school ? { ...school } : {
    id: uid('s'), name: '', type: 'Elementary', gradesServed: '', curriculumModel: '', cspfRating: 'Accredited',
    academicAchievement: '', academicGrowth: '', transportation: 'Bus Provided', enrollmentMethod: 'Boundary',
    applicationDeadline: '', waitlistStatus: 'None', tourDate: '', distances: [], pros: '', cons: '', notes: '',
    address: '', lat: null, lng: null,
  };
  const distMap = Object.fromEntries((s.distances || []).map(d => [d.houseId, d.miles]));
  const distanceRows = state.houses.map(h => `
    <div class="form-field">
      <label for="dist_${h.id}">Distance to ${escapeHtml(h.address)} (mi)</label>
      <input id="dist_${h.id}" type="number" step="0.1" value="${distMap[h.id] ?? ''}">
    </div>`).join('');
  const body = `<div class="form-grid">
    ${fieldHtml({ key: 'name', label: 'School Name', type: 'text', value: s.name, full: true })}
    ${fieldHtml({ key: 'address', label: 'Address (for geocoding)', type: 'text', value: s.address, full: true })}
    <div class="form-field full">
      <input type="hidden" id="f_lat" value="${s.lat ?? ''}">
      <input type="hidden" id="f_lng" value="${s.lng ?? ''}">
      <div class="inline-btn-row">
        <button type="button" class="btn small" id="geocodeSchoolBtn">Geocode School</button>
        <span id="geocodeSchoolStatus" class="muted-note">${s.lat != null ? `Located at ${Number(s.lat).toFixed(4)}, ${Number(s.lng).toFixed(4)}` : 'Not geocoded yet'}</span>
      </div>
    </div>
    ${fieldHtml({ key: 'type', label: 'School Type', type: 'select', value: s.type, options: SCHOOL_TYPES })}
    ${fieldHtml({ key: 'gradesServed', label: 'Grades Served', type: 'text', value: s.gradesServed })}
    ${fieldHtml({ key: 'curriculumModel', label: 'Curriculum Model', type: 'text', value: s.curriculumModel })}
    ${fieldHtml({ key: 'cspfRating', label: 'CSPF Rating', type: 'select', value: s.cspfRating, options: CSPF_RATINGS })}
    ${fieldHtml({ key: 'academicAchievement', label: 'Academic Achievement (0-100)', type: 'number', value: s.academicAchievement })}
    ${fieldHtml({ key: 'academicGrowth', label: 'Academic Growth (0-100)', type: 'number', value: s.academicGrowth })}
    ${fieldHtml({ key: 'transportation', label: 'Transportation', type: 'select', value: s.transportation, options: TRANSPORT_OPTIONS })}
    ${fieldHtml({ key: 'enrollmentMethod', label: 'Enrollment Method', type: 'select', value: s.enrollmentMethod, options: ENROLLMENT_METHODS })}
    ${fieldHtml({ key: 'applicationDeadline', label: 'Application Deadline', type: 'date', value: s.applicationDeadline })}
    ${fieldHtml({ key: 'waitlistStatus', label: 'Waitlist Status (None / Waitlisted #N / Closed)', type: 'text', value: s.waitlistStatus })}
    ${fieldHtml({ key: 'tourDate', label: 'Tour Date', type: 'date', value: s.tourDate })}
    ${fieldHtml({ key: 'pros', label: 'Pros', type: 'textarea', value: s.pros, full: true })}
    ${fieldHtml({ key: 'cons', label: 'Cons', type: 'textarea', value: s.cons, full: true })}
    ${fieldHtml({ key: 'notes', label: 'Notes', type: 'textarea', value: s.notes, full: true })}
  </div>
  <h4 style="margin:16px 0 8px;font-size:13px;">Distance From Each House</h4>
  <div class="form-grid">${distanceRows || '<div class="empty-note">Add houses first to record distances.</div>'}</div>`;
  openModal(isNew ? 'Add School' : 'Edit School', body, {
    onSave: () => {
      const distances = state.houses.map(h => {
        const raw = document.getElementById('dist_' + h.id);
        if (!raw || raw.value === '') return null;
        return { houseId: h.id, miles: Number(raw.value) };
      }).filter(Boolean);
      const updated = {
        id: s.id, name: val('name'), type: val('type'), gradesServed: val('gradesServed'), curriculumModel: val('curriculumModel'),
        cspfRating: val('cspfRating'), academicAchievement: numVal('academicAchievement'), academicGrowth: numVal('academicGrowth'),
        transportation: val('transportation'), enrollmentMethod: val('enrollmentMethod'), applicationDeadline: val('applicationDeadline'),
        waitlistStatus: val('waitlistStatus'), tourDate: val('tourDate'), distances, pros: val('pros'), cons: val('cons'), notes: val('notes'),
        address: val('address'), lat: numVal('lat'), lng: numVal('lng'),
      };
      if (!updated.name) { alert('School name is required.'); return; }
      if (isNew) { state.schools.push(updated); logActivity('added', `Added school — ${updated.name}`); }
      else { Object.assign(school, updated); logActivity('edited', `Edited school — ${updated.name}`); }
      closeModal(); scheduleSave(); renderAll();
    },
    onDelete: isNew ? null : () => {
      state.schools = state.schools.filter(x => x.id !== school.id);
      logActivity('deleted', `Deleted school — ${school.name}`);
      closeModal(); scheduleSave(); renderAll();
    }
  });
  wireGeocodeButton('geocodeSchoolBtn', 'geocodeSchoolStatus',
    () => val('address'),
    (result) => { document.getElementById('f_lat').value = result.lat; document.getElementById('f_lng').value = result.lng; });
}

function relatedIdOptions(type) {
  if (type === 'House') return [{ value: '', label: '— none —' }, ...state.houses.map(h => ({ value: h.id, label: h.address }))];
  if (type === 'School') return [{ value: '', label: '— none —' }, ...state.schools.map(s => ({ value: s.id, label: s.name }))];
  return [{ value: '', label: 'n/a' }];
}

function openTaskModal(task) {
  const isNew = !task;
  const t = task ? { ...task } : { id: uid('t'), task: '', relatedType: 'General', relatedId: '', owner: '', dueDate: '', status: 'Not Started', priority: 'Medium', notes: '' };
  const body = `<div class="form-grid">
    ${fieldHtml({ key: 'task', label: 'Task', type: 'text', value: t.task, full: true })}
    ${fieldHtml({ key: 'relatedType', label: 'Related Type', type: 'select', value: t.relatedType, options: TASK_RELATED_TYPES })}
    ${fieldHtml({ key: 'relatedId', label: 'Related Item', type: 'select', value: t.relatedId, options: relatedIdOptions(t.relatedType) })}
    ${fieldHtml({ key: 'owner', label: 'Owner', type: 'text', value: t.owner })}
    ${fieldHtml({ key: 'dueDate', label: 'Due Date', type: 'date', value: t.dueDate })}
    ${fieldHtml({ key: 'status', label: 'Status', type: 'select', value: t.status, options: TASK_STATUSES })}
    ${fieldHtml({ key: 'priority', label: 'Priority', type: 'select', value: t.priority, options: TASK_PRIORITIES })}
    ${fieldHtml({ key: 'notes', label: 'Notes', type: 'textarea', value: t.notes, full: true })}
  </div>`;
  openModal(isNew ? 'Add Task' : 'Edit Task', body, {
    onSave: () => {
      const updated = {
        id: t.id, task: val('task'), relatedType: val('relatedType'), relatedId: val('relatedId'),
        owner: val('owner'), dueDate: val('dueDate'), status: val('status'), priority: val('priority'), notes: val('notes'),
      };
      if (!updated.task) { alert('Task description is required.'); return; }
      if (isNew) { state.tasks.push(updated); logActivity('added', `Added task — ${updated.task}`); }
      else { Object.assign(task, updated); logActivity('edited', `Edited task — ${updated.task}`); }
      closeModal(); scheduleSave(); renderAll();
    },
    onDelete: isNew ? null : () => {
      state.tasks = state.tasks.filter(x => x.id !== task.id);
      logActivity('deleted', `Deleted task — ${task.task}`);
      closeModal(); scheduleSave(); renderAll();
    }
  });
  document.getElementById('f_relatedType').addEventListener('change', (e) => {
    const opts = relatedIdOptions(e.target.value);
    const sel = document.getElementById('f_relatedId');
    sel.innerHTML = opts.map(o => `<option value="${escapeAttr(o.value)}">${escapeHtml(o.label)}</option>`).join('');
  });
}

// ---------- render-all / init ----------
function renderAll() {
  renderWeightsGrid();
  renderDashboard();
  renderHouses();
  renderApartments();
  renderSchools();
  renderTasks();
  renderCalendar();
  renderActivity();
  renderMap();
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'map') {
        initMapTabOnce();
        setTimeout(() => mapInstance && mapInstance.invalidateSize(), 0);
      }
    });
  });
}

function initToolbars() {
  document.getElementById('houseSearch').addEventListener('input', renderHouses);
  document.getElementById('houseStatusFilter').addEventListener('change', renderHouses);
  document.getElementById('houseCityFilter').addEventListener('change', renderHouses);
  document.getElementById('houseTagFilter').addEventListener('change', renderHouses);
  document.getElementById('addHouseBtn').addEventListener('click', () => openHouseModal(null));
  document.getElementById('exportHousesBtn').addEventListener('click', exportHouses);

  document.getElementById('apartmentSearch').addEventListener('input', renderApartments);
  document.getElementById('apartmentStatusFilter').addEventListener('change', renderApartments);
  document.getElementById('apartmentCityFilter').addEventListener('change', renderApartments);
  document.getElementById('apartmentLeaseTermFilter').addEventListener('change', renderApartments);
  document.getElementById('apartmentRentMaxFilter').addEventListener('input', renderApartments);
  document.getElementById('addApartmentBtn').addEventListener('click', () => openApartmentModal(null));
  document.getElementById('exportApartmentsBtn').addEventListener('click', exportApartments);

  document.getElementById('schoolSearch').addEventListener('input', renderSchools);
  document.getElementById('schoolTypeFilter').addEventListener('change', renderSchools);
  document.getElementById('schoolCityFilter').addEventListener('change', renderSchools);
  document.getElementById('schoolPriorityFilter').addEventListener('change', renderSchools);
  document.getElementById('schoolCommuteMaxFilter').addEventListener('input', renderSchools);
  document.getElementById('schoolMathMinFilter').addEventListener('input', renderSchools);
  document.getElementById('schoolReadingMinFilter').addEventListener('input', renderSchools);
  document.getElementById('addSchoolBtn').addEventListener('click', () => openSchoolModal(null));
  document.getElementById('exportSchoolsBtn').addEventListener('click', exportSchools);

  document.getElementById('geocodeAllBtn').addEventListener('click', geocodeAllMissing);
  document.getElementById('distanceHouseSelect').addEventListener('change', renderDistancePanel);
  document.getElementById('distanceSchoolSelect').addEventListener('change', renderDistancePanel);

  document.getElementById('taskSearch').addEventListener('input', renderTasks);
  document.getElementById('taskOwnerFilter').addEventListener('change', renderTasks);
  document.getElementById('taskStatusFilter').addEventListener('change', renderTasks);
  document.getElementById('taskPriorityFilter').addEventListener('change', renderTasks);
  document.getElementById('addTaskBtn').addEventListener('click', () => openTaskModal(null));
  document.getElementById('exportTasksBtn').addEventListener('click', exportTasks);

  document.getElementById('comboSortBy').addEventListener('change', renderComboTable);

  document.getElementById('calPrevBtn').addEventListener('click', () => calChangeMonth(-1));
  document.getElementById('calNextBtn').addEventListener('click', () => calChangeMonth(1));
  document.getElementById('calTodayBtn').addEventListener('click', calGoToday);
  document.getElementById('exportIcsBtn').addEventListener('click', exportIcs);

  document.getElementById('printCompareBtn').addEventListener('click', printComparisonReport);

  document.getElementById('commuteDestinationInput').addEventListener('change', (e) => {
    state.settings.commuteDestination = e.target.value.trim();
    scheduleSave();
  });

  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
  document.getElementById('modalSaveBtn').addEventListener('click', () => { if (currentModalSave) currentModalSave(); });
  modalDeleteBtn.addEventListener('click', () => { if (currentModalDelete && confirm('Delete this item? This cannot be undone.')) currentModalDelete(); });
  modalRoot.addEventListener('click', (e) => { if (e.target === modalRoot) closeModal(); });
}

function initHeader() {
  const actingAsInput = document.getElementById('actingAsInput');
  actingAsInput.value = getActingAs();
  actingAsInput.addEventListener('change', () => setActingAs(actingAsInput.value.trim()));

  const searchInput = document.getElementById('globalSearch');
  const resultsEl = document.getElementById('globalSearchResults');
  searchInput.addEventListener('input', renderGlobalSearchResults);
  searchInput.addEventListener('focus', renderGlobalSearchResults);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.global-search-wrap')) resultsEl.classList.add('hidden');
  });
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') { resultsEl.classList.add('hidden'); searchInput.blur(); } });
}

async function main() {
  initTabs();
  initToolbars();
  initHeader();
  await loadState();
  renderAll();
  maybeNotifyDueToday();
  setInterval(maybeNotifyDueToday, 30 * 60 * 1000);
}
main();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
