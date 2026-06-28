// n8n Code node
// Run Once for All Items

const attendanceRows = $('attendance').all().map(i => i.json || {});
const userRows = $('kbc users').all().map(i => i.json || {});

const START_FROM = '2026-03-09';
const MAX_WEEKS = 10;
const COMPANY_LABEL = 'OVERALL COMPANY';
const TIMEZONE = 'Africa/Cairo';

const EXCLUDED_GROUPS = new Set([
  'pcp - november 2025 (alfanar)',
  'me level 4 - january 2025',
]);

function norm(v) {
  return String(v == null ? '' : v).trim();
}

function lower(v) {
  return norm(v).toLowerCase();
}

function toNum01(v) {
  return Number(v == null ? 0 : v) > 0 ? 1 : 0;
}

function pct(v, t) {
  return t ? Math.round((v / t) * 10000) / 100 : 0;
}

function makeStudentKey(obj) {
  const cleanId = norm(obj.id);
  const cleanEmail = lower(obj.email);
  const cleanName = lower(obj.name);

  if (cleanId) return 'id:' + cleanId;
  if (cleanEmail) return 'email:' + cleanEmail;
  if (cleanName) return 'name:' + cleanName;
  return '';
}

function getYMDInTimeZone(date, timeZone = TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const obj = {};
  for (const p of parts) {
    if (p.type !== 'literal') obj[p.type] = p.value;
  }

  return `${obj.year}-${obj.month}-${obj.day}`;
}

function extractYMD(value) {
  if (value == null || value === '') return '';

  const s = String(value).trim();
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;

  const d = new Date(s);
  if (isNaN(d.getTime())) return '';

  return getYMDInTimeZone(d, TIMEZONE);
}

function ymdToLocalDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!m) return null;

  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

function formatYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);

  return d;
}

function startOfWeekMonday(date) {
  const d = new Date(date.getTime());
  d.setHours(12, 0, 0, 0);

  const day = d.getDay();
  const diffToMonday = (day + 6) % 7;

  d.setDate(d.getDate() - diffToMonday);
  d.setHours(12, 0, 0, 0);

  return d;
}

const startFromYMD = extractYMD(START_FROM);
const startFromDate = ymdToLocalDate(startFromYMD);

if (!startFromDate) {
  throw new Error('START_FROM is invalid');
}

const firstWeekStart = formatYMD(startOfWeekMonday(startFromDate));

const todayYMD = getYMDInTimeZone(new Date(), TIMEZONE);
const todayDate = ymdToLocalDate(todayYMD);
const currentWeekStartDate = startOfWeekMonday(todayDate);
const todayDay = todayDate.getDay();

const lastAllowedWeekStartDate =
  todayDay === 0 ? currentWeekStartDate : addDays(currentWeekStartDate, -7);

const lastAllowedWeekStart = formatYMD(lastAllowedWeekStartDate);

const completedWeekStarts = [];
let cursor = ymdToLocalDate(firstWeekStart);

while (cursor && formatYMD(cursor) <= lastAllowedWeekStart) {
  completedWeekStarts.push(formatYMD(cursor));
  cursor = addDays(cursor, 7);
}

const rollingWeekStarts = completedWeekStarts.slice(-MAX_WEEKS);
const displayWeekStarts = [...rollingWeekStarts].reverse();
const allowedWeekStarts = new Set(rollingWeekStarts);

if (rollingWeekStarts.length === 0) {
  return [];
}

const activeUsersById = new Map();
const activeUsersByEmail = new Map();
const activeCoachNames = new Set();

for (const u of userRows) {
  const programStatus = lower(u['Program-Status']);
  if (programStatus !== 'active') continue;

  const groupName = norm(u.Group || '');
  if (EXCLUDED_GROUPS.has(lower(groupName))) continue;

  const coachName = norm(u.OwnerName || '');
  if (coachName) {
    activeCoachNames.add(coachName);
  }

  const id = norm(u.ID || u.Id || u.id);
  const email = lower(u.Email || u.email);

  if (id && !activeUsersById.has(id)) {
    activeUsersById.set(id, u);
  }

  if (email && !activeUsersByEmail.has(email)) {
    activeUsersByEmail.set(email, u);
  }
}

const rawFacts = [];

for (const a of attendanceRows) {
  const attendanceId = norm(a.ID || a.Id || a.id);
  const attendanceEmail = lower(a.Email || a.email);
  const attendanceName = norm(a.FullName || a.full_name || a.name);

  let user = null;

  if (attendanceId && activeUsersById.has(attendanceId)) {
    user = activeUsersById.get(attendanceId);
  } else if (attendanceEmail && activeUsersByEmail.has(attendanceEmail)) {
    user = activeUsersByEmail.get(attendanceEmail);
  }

  if (!user) continue;

  const coach = norm(user.OwnerName || '');
  if (!coach) continue;

  const groupName = norm(user.Group || '');
  if (EXCLUDED_GROUPS.has(lower(groupName))) continue;

  const rawDate = a.date || a.class_date || a.session_date;
  const classDate = extractYMD(rawDate);

  if (!classDate) continue;
  if (classDate < firstWeekStart) continue;

  const classDateObj = ymdToLocalDate(classDate);
  if (!classDateObj) continue;

  const weekStart = formatYMD(startOfWeekMonday(classDateObj));

  if (!allowedWeekStarts.has(weekStart)) continue;

  const finalId = norm(user.ID || user.Id || user.id || attendanceId);
  const finalEmail = lower(user.Email || user.email || attendanceEmail);
  const finalName = norm(user.FullName || user.full_name || attendanceName);

  const studentKey = makeStudentKey({
    id: finalId,
    email: finalEmail,
    name: finalName,
  });

  if (!studentKey) continue;

  rawFacts.push({
    coach,
    student: studentKey,
    week_start: weekStart,
    attendance: toNum01(a.Attendance != null ? a.Attendance : a.attendance),
  });
}

const dedupeMap = new Map();

for (const f of rawFacts) {
  const key = f.coach + '__' + f.student + '__' + f.week_start;

  if (!dedupeMap.has(key)) {
    dedupeMap.set(key, {
      coach: f.coach,
      student: f.student,
      week_start: f.week_start,
      attendance: f.attendance,
    });
  } else {
    const old = dedupeMap.get(key);
    old.attendance = Math.max(old.attendance, f.attendance);
  }
}

const facts = Array.from(dedupeMap.values());

const coachWeekMap = new Map();

for (const f of facts) {
  const key = f.coach + '__' + f.week_start;

  if (!coachWeekMap.has(key)) {
    coachWeekMap.set(key, {
      coach: f.coach,
      week_start: f.week_start,
      students: new Set(),
      present_count: 0,
      absent_count: 0,
    });
  }

  const obj = coachWeekMap.get(key);
  obj.students.add(f.student);
  obj.present_count += f.attendance;

  if (f.attendance === 0) {
    obj.absent_count += 1;
  }
}

const companyWeekMap = new Map();

for (const f of facts) {
  const key = f.week_start;

  if (!companyWeekMap.has(key)) {
    companyWeekMap.set(key, {
      week_start: f.week_start,
      students: new Set(),
      present_count: 0,
      absent_count: 0,
    });
  }

  const obj = companyWeekMap.get(key);
  obj.students.add(f.student);
  obj.present_count += f.attendance;

  if (f.attendance === 0) {
    obj.absent_count += 1;
  }
}

const uniqueStudentsByCoach = new Map();
const uniqueStudentsCompany = new Set();

for (const f of facts) {
  if (!uniqueStudentsByCoach.has(f.coach)) {
    uniqueStudentsByCoach.set(f.coach, new Set());
  }

  uniqueStudentsByCoach.get(f.coach).add(f.student);
  uniqueStudentsCompany.add(f.student);
}

let companyTotalExpected = 0;
let companyTotalPresent = 0;
let companyTotalAbsent = 0;

for (const weekStart of rollingWeekStarts) {
  const data = companyWeekMap.get(weekStart);
  if (!data) continue;

  companyTotalExpected += data.students.size;
  companyTotalPresent += data.present_count;
  companyTotalAbsent += data.absent_count;
}

const result = [];

const coaches = Array.from(
  new Set([
    ...Array.from(activeCoachNames),
    ...facts.map(f => f.coach),
  ])
).filter(Boolean).sort((a, b) => a.localeCompare(b));

for (const coach of coaches) {
  const row = { coach_name: coach };

  let totalExpected = 0;
  let totalPresent = 0;
  let totalAbsent = 0;

  for (let i = 0; i < displayWeekStarts.length; i++) {
    const weekStart = displayWeekStarts[i];
    const key = coach + '__' + weekStart;
    const data = coachWeekMap.get(key);
    const idx = i + 1;
    const weekEnd = formatYMD(addDays(ymdToLocalDate(weekStart), 6));

    if (!data) {
      row['session_' + idx + '_week_start'] = weekStart;
      row['session_' + idx + '_week_end'] = weekEnd;
      row['week_' + idx + '_expected'] = '';
      row['week_' + idx + '_present'] = '';
      row['week_' + idx + '_absent'] = '';
      row['week_' + idx + '_absence_ratio'] = '';
      row['week_' + idx + '_absence_vs_company_%'] = '';
      continue;
    }

    const expected = data.students.size;
    const present = data.present_count;
    const absent = data.absent_count;
    const ratio = pct(absent, expected);

    const companyWeekData = companyWeekMap.get(weekStart);
    const companyWeekAbsent = companyWeekData ? companyWeekData.absent_count : 0;
    const absenceVsCompany = pct(absent, companyWeekAbsent);

    row['session_' + idx + '_week_start'] = weekStart;
    row['session_' + idx + '_week_end'] = weekEnd;
    row['week_' + idx + '_expected'] = expected;
    row['week_' + idx + '_present'] = present;
    row['week_' + idx + '_absent'] = absent;
    row['week_' + idx + '_absence_ratio'] = ratio;
    row['week_' + idx + '_absence_vs_company_%'] = absenceVsCompany;

    totalExpected += expected;
    totalPresent += present;
    totalAbsent += absent;
  }

  for (let i = displayWeekStarts.length; i < MAX_WEEKS; i++) {
    const idx = i + 1;

    row['session_' + idx + '_week_start'] = '';
    row['session_' + idx + '_week_end'] = '';
    row['week_' + idx + '_expected'] = '';
    row['week_' + idx + '_present'] = '';
    row['week_' + idx + '_absent'] = '';
    row['week_' + idx + '_absence_ratio'] = '';
    row['week_' + idx + '_absence_vs_company_%'] = '';
  }

  const coachStudentsCount = uniqueStudentsByCoach.has(coach)
    ? uniqueStudentsByCoach.get(coach).size
    : 0;

  row['students_count'] = coachStudentsCount;
  row['last_10_weeks_expected'] = totalExpected;
  row['last_10_weeks_present'] = totalPresent;
  row['last_10_weeks_absent'] = totalAbsent;
  row['last_10_weeks_absence_ratio'] = pct(totalAbsent, totalExpected);
  row['absence_share_of_company_absence_%'] = pct(totalAbsent, companyTotalAbsent);

  result.push(row);
}

const companyRow = { coach_name: COMPANY_LABEL };

for (let i = 0; i < displayWeekStarts.length; i++) {
  const weekStart = displayWeekStarts[i];
  const data = companyWeekMap.get(weekStart);
  const idx = i + 1;
  const weekEnd = formatYMD(addDays(ymdToLocalDate(weekStart), 6));

  if (!data) {
    companyRow['session_' + idx + '_week_start'] = weekStart;
    companyRow['session_' + idx + '_week_end'] = weekEnd;
    companyRow['week_' + idx + '_expected'] = '';
    companyRow['week_' + idx + '_present'] = '';
    companyRow['week_' + idx + '_absent'] = '';
    companyRow['week_' + idx + '_absence_ratio'] = '';
    companyRow['week_' + idx + '_absence_vs_company_%'] = '';
    continue;
  }

  const expected = data.students.size;
  const present = data.present_count;
  const absent = data.absent_count;
  const ratio = pct(absent, expected);

  companyRow['session_' + idx + '_week_start'] = weekStart;
  companyRow['session_' + idx + '_week_end'] = weekEnd;
  companyRow['week_' + idx + '_expected'] = expected;
  companyRow['week_' + idx + '_present'] = present;
  companyRow['week_' + idx + '_absent'] = absent;
  companyRow['week_' + idx + '_absence_ratio'] = ratio;
  companyRow['week_' + idx + '_absence_vs_company_%'] = absent > 0 ? 100 : 0;
}

for (let i = displayWeekStarts.length; i < MAX_WEEKS; i++) {
  const idx = i + 1;

  companyRow['session_' + idx + '_week_start'] = '';
  companyRow['session_' + idx + '_week_end'] = '';
  companyRow['week_' + idx + '_expected'] = '';
  companyRow['week_' + idx + '_present'] = '';
  companyRow['week_' + idx + '_absent'] = '';
  companyRow['week_' + idx + '_absence_ratio'] = '';
  companyRow['week_' + idx + '_absence_vs_company_%'] = '';
}

companyRow['students_count'] = uniqueStudentsCompany.size;
companyRow['last_10_weeks_expected'] = companyTotalExpected;
companyRow['last_10_weeks_present'] = companyTotalPresent;
companyRow['last_10_weeks_absent'] = companyTotalAbsent;
companyRow['last_10_weeks_absence_ratio'] = pct(companyTotalAbsent, companyTotalExpected);
companyRow['absence_share_of_company_absence_%'] = companyTotalAbsent > 0 ? 100 : 0;

result.push(companyRow);

result.sort(function(a, b) {
  if (a.coach_name === COMPANY_LABEL) return -1;
  if (b.coach_name === COMPANY_LABEL) return 1;

  const aVal = Number(a['absence_share_of_company_absence_%'] || 0);
  const bVal = Number(b['absence_share_of_company_absence_%'] || 0);

  if (bVal !== aVal) return bVal - aVal;

  return String(a.coach_name).localeCompare(String(b.coach_name));
});

return result.map(function(r) {
  return { json: r };
});