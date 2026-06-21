const API_BASE = window.location.origin;
const POLL_INTERVAL = 30000;
let dashboardData = null, tasksData = null, mrData = null, confData = null;
let currentPage = 'dashboard';

function getMonthOptions() {
    const months = [];
    const now = new Date();
    let d = new Date(2026, 0, 1);
    while (d <= now) {
        // Use local year/month to avoid timezone shift
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const val = `${year}-${month}`;
        const label = d.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' });
        months.push({ val, label });
        d.setMonth(d.getMonth() + 1);
    }
    return months.reverse();
}

document.addEventListener('DOMContentLoaded', () => {
    initMonthFilter('dashboardMonthFilter', () => fetchDashboard());
    fetchDashboard();
    setInterval(fetchDashboard, POLL_INTERVAL);
});

function navigateTo(page) {
    currentPage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById(`page-${page}`).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`[data-page="${page}"]`).classList.add('active');
    if (page === 'dashboard') fetchDashboard();
    if (page === 'tasks') loadTasks();
    if (page === 'merge-requests') loadMergeRequests();
    if (page === 'confluence') loadConfluence();
}

function initMonthFilter(id, onChange) {
    const el = document.getElementById(id);
    if (!el || el.dataset.init) return;
    el.dataset.init = '1';
    const months = getMonthOptions();
    el.innerHTML = `<option value="">Текущий месяц</option><option value="all">За весь период</option>` +
        months.map(m => `<option value="${m.val}">${m.label}</option>`).join('');
    el.addEventListener('change', onChange);
}

// === DASHBOARD ===
async function fetchDashboard() {
    try {
        showDashboardLoading(true);
        const month = document.getElementById('dashboardMonthFilter')?.value || '';
        const url = month ? `${API_BASE}/api/dashboard?month=${month}` : `${API_BASE}/api/dashboard`;
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        dashboardData = await resp.json();
        renderDashboard(dashboardData);
        updateConnectionStatus(true);
    } catch (err) { console.error('Fetch error:', err); updateConnectionStatus(false); }
    finally { showDashboardLoading(false); }
}

function showDashboardLoading(show) {
    let overlay = document.getElementById('dashboardLoadingOverlay');
    if (show) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'dashboardLoadingOverlay';
            overlay.className = 'loading-overlay';
            overlay.innerHTML = '<div class="loading-overlay-content"><div class="spinner"></div><span>Загрузка данных...</span></div>';
            document.getElementById('page-dashboard').appendChild(overlay);
        }
        overlay.style.display = 'flex';
    } else {
        if (overlay) overlay.style.display = 'none';
    }
}

function renderDashboard(data) {
    // Summary - linked to filter
    document.getElementById('totalActive').textContent = data.summary.total_active_tasks;
    document.getElementById('totalCompleted').textContent = data.summary.total_completed_month;
    document.getElementById('totalMRs').textContent = data.summary.total_mrs_month;
    document.getElementById('totalAlerts').textContent = data.summary.total_alerts;

    renderGauges(data.employees, data.summary);
    renderAlerts(data.alerts);
    renderEmployees(data.employees);
    renderDashboardConclusion(data);

    const dt = new Date(data.last_updated);
    document.getElementById('lastUpdated').textContent = dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function renderGauges(employees, summary) {
    const container = document.getElementById('gaugesSection');
    if (!container) return;

    let totalActive = 0, totalCompleted = 0, totalStale = 0, totalMR = 0, totalMRMerged = 0;
    employees.forEach(e => {
        totalActive += e.tasks.active_tasks;
        totalCompleted += e.tasks.completed_month;
        totalStale += e.tasks.stale_tasks;
        totalMR += e.gitlab.mrs_created_month;
        totalMRMerged += e.gitlab.mrs_merged_month;
    });

    const total = totalActive + totalCompleted;
    const completionRate = total > 0 ? Math.round(totalCompleted / total * 100) : 0;
    const noStaleRate = totalActive > 0 ? Math.max(0, 100 - Math.round(totalStale / totalActive * 100)) : 100;
    const mrMergeRate = totalMR > 0 ? Math.round(totalMRMerged / totalMR * 100) : 0;

    container.innerHTML = `<div class="gauges-grid">
        ${createGauge('Исполнение', completionRate, 'green', `${totalCompleted} из ${total} задач завершено`)}
        ${createGauge('Без зависаний', noStaleRate, noStaleRate > 70 ? 'green' : noStaleRate > 40 ? 'orange' : 'red', `${totalStale} задач стоят >5 дней`)}
        ${createGauge('MR Merged', mrMergeRate, 'blue', `${totalMRMerged} из ${totalMR} MR влиты`)}
        ${createGauge('Загрузка', Math.min(100, Math.round(totalActive / Math.max(employees.length, 1) * 10)), 'purple', `~${Math.round(totalActive / Math.max(employees.length, 1))} задач на человека`)}
    </div>`;
}

function createGauge(label, value, color, detail) {
    const circumference = 2 * Math.PI * 54;
    const offset = circumference - (value / 100) * circumference;
    const colorVar = `var(--accent-${color})`;
    return `<div class="gauge-item">
        <svg class="gauge-svg" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="var(--bg-primary)" stroke-width="10"/>
            <circle cx="60" cy="60" r="54" fill="none" stroke="${colorVar}" stroke-width="10" stroke-linecap="round"
                stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
                transform="rotate(-90 60 60)" style="transition:stroke-dashoffset 1s ease"/>
            <text x="60" y="56" text-anchor="middle" fill="var(--text-primary)" font-size="22" font-weight="700">${value}%</text>
            <text x="60" y="74" text-anchor="middle" fill="var(--text-secondary)" font-size="10">${label}</text>
        </svg>
        <div class="gauge-detail">${detail}</div>
    </div>`;
}

function renderDashboardConclusion(data) {
    const el = document.getElementById('dashboardConclusion');
    if (!el) return;
    const issues = [];
    let totalStale = 0, totalNoActivity = 0;
    data.employees.forEach(e => {
        totalStale += e.tasks.stale_tasks;
        if (e.gitlab.mrs_created_month === 0 && e.employee.gitlab_groups && e.employee.gitlab_groups.length > 0) totalNoActivity++;
    });
    if (totalStale > 0) issues.push(`${totalStale} задач зависли (>5 дней в одном статусе) — провести разбор`);
    if (totalNoActivity > 0) issues.push(`${totalNoActivity} сотрудников без активности в GitLab`);
    if (data.summary.critical_alerts > 0) issues.push(`${data.summary.critical_alerts} критических алертов`);

    el.style.display = 'block';
    if (issues.length === 0) {
        el.className = 'conclusion-banner';
        el.innerHTML = `<div class="conclusion-title"><i class="fas fa-check-circle"></i> Общее заключение</div><div class="conclusion-items"><div class="conclusion-item"><span class="issue-text" style="color:var(--accent-green)">Команда работает в нормальном режиме. Замечаний нет.</span></div></div>`;
    } else {
        el.className = 'conclusion-banner has-issues';
        el.innerHTML = `<div class="conclusion-title"><i class="fas fa-exclamation-circle"></i> Общее заключение и рекомендации</div><div class="conclusion-items">${issues.map(i => `<div class="conclusion-item"><span class="issue-text">${i}</span></div>`).join('')}</div>`;
    }
}

function renderAlerts(alerts) {
    const section = document.getElementById('alertsSection');
    const list = document.getElementById('alertsList');
    if (!alerts || alerts.length === 0) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    list.innerHTML = alerts.map(a => `<div class="alert-item ${a.severity}"><span class="alert-badge ${a.severity}">${a.severity==='critical'?'КРИТ':'ВНИМ'}</span><span class="alert-employee">${a.employee}</span><span class="alert-message">${a.message}</span>${a.task_url?`<a href="${a.task_url}" target="_blank" class="alert-link"><i class="fas fa-external-link-alt"></i></a>`:''}</div>`).join('');
}

function renderEmployees(employees) {
    const grid = document.getElementById('employeesGrid');
    if (!employees || employees.length === 0) { grid.innerHTML = '<div class="loading-state"><p>Нет данных</p></div>'; return; }
    grid.innerHTML = employees.map(emp => {
        const initials = getInitials(emp.employee.name);
        const hasAlerts = emp.alerts && emp.alerts.length > 0;
        const totalTasks = emp.tasks.total_tasks;
        const loadLevel = totalTasks > 15 ? 'Высокая' : totalTasks > 8 ? 'Средняя' : 'Низкая';
        const loadColor = totalTasks > 15 ? 'var(--accent-red)' : totalTasks > 8 ? 'var(--accent-orange)' : 'var(--accent-green)';
        return `<div class="employee-card ${hasAlerts?'has-alerts':''}">
            <div class="employee-header">
                <div class="employee-info"><div class="employee-avatar">${initials}</div><div><div class="employee-name">${emp.employee.name}</div><div class="employee-role">${emp.employee.role}</div></div></div>
                ${hasAlerts?`<span class="employee-alerts-badge"><i class="fas fa-exclamation-triangle"></i> ${emp.alerts.length}</span>`:''}
            </div>
            <div class="metrics-grid">
                <div class="metric-item"><div class="metric-value">${emp.tasks.active_tasks}</div><div class="metric-label">Активные</div></div>
                <div class="metric-item"><div class="metric-value">${emp.tasks.completed_month}</div><div class="metric-label">Выполнено</div></div>
                <div class="metric-item"><div class="metric-value">${emp.tasks.total_tasks}</div><div class="metric-label">Всего задач</div></div>
                <div class="metric-item"><div class="metric-value">${emp.gitlab.mrs_merged_month}</div><div class="metric-label">MR Merged</div></div>
                <div class="metric-item"><div class="metric-value" style="color:${emp.tasks.stale_tasks>0?'var(--accent-red)':'var(--accent-green)'}">${emp.tasks.stale_tasks}</div><div class="metric-label">Зависшие</div></div>
                <div class="metric-item"><div class="metric-value" style="color:${loadColor};font-size:14px">${loadLevel}</div><div class="metric-label">Загрузка</div></div>
            </div>
        </div>`;
    }).join('');
}

// === TASKS ===
async function loadTasks() {
    initMonthFilter('tasksMonthFilter', () => loadTasks());
    const month = document.getElementById('tasksMonthFilter')?.value || '';
    const url = month ? `${API_BASE}/api/tasks?month=${month}` : `${API_BASE}/api/tasks`;
    try { const r = await fetch(url); tasksData = await r.json(); renderTasksPage(tasksData); } catch(e) { console.error(e); }
}
function renderTasksPage(data) {
    const ef = document.getElementById('tasksFilterEmployee'), sf = document.getElementById('tasksFilterStatus'), tf = document.getElementById('tasksFilterType');

    // Save current filter values before rebuilding
    const prevEmp = ef.value;
    const prevStatus = sf.value;
    const prevType = tf.value;

    const emps = new Set(), stats = new Set(), types = new Set();
    let all = [];
    data.forEach(d => { emps.add(d.employee); (d.issues||[]).forEach(i => { stats.add(i.status); types.add(i.type); all.push({...i, employee: d.employee}); }); });
    ef.innerHTML = '<option value="all">Все сотрудники</option>'+[...emps].map(e=>`<option value="${e}">${e}</option>`).join('');
    sf.innerHTML = '<option value="all">Все статусы</option>'+[...stats].map(s=>`<option value="${s}">${s}</option>`).join('');
    tf.innerHTML = '<option value="all">Все типы</option>'+[...types].map(t=>`<option value="${t}">${t}</option>`).join('');

    // Restore previous filter values if they still exist in options
    if (prevEmp && [...ef.options].some(o => o.value === prevEmp)) ef.value = prevEmp;
    if (prevStatus && [...sf.options].some(o => o.value === prevStatus)) sf.value = prevStatus;
    if (prevType && [...tf.options].some(o => o.value === prevType)) tf.value = prevType;

    renderTasksConclusion(data);

    // Apply filters to the data
    if (ef.value !== 'all') all = all.filter(i => i.employee === ef.value);
    if (sf.value !== 'all') all = all.filter(i => i.status === sf.value);
    if (tf.value !== 'all') all = all.filter(i => i.type === tf.value);

    renderTasksTable(all);
}
function filterTasks() {
    if (!tasksData) return;
    let all = []; tasksData.forEach(d=>{(d.issues||[]).forEach(i=>{all.push({...i,employee:d.employee});});});
    const e=document.getElementById('tasksFilterEmployee').value, s=document.getElementById('tasksFilterStatus').value, t=document.getElementById('tasksFilterType').value;
    if(e!=='all')all=all.filter(i=>i.employee===e); if(s!=='all')all=all.filter(i=>i.status===s); if(t!=='all')all=all.filter(i=>i.type===t);
    renderTasksTable(all);
}
function renderTasksConclusion(data) {
    const el = document.getElementById('tasksConclusion'); if(!el) return;
    const items = data.filter(d=>d.conclusion&&!d.conclusion.startsWith('Задачи обрабатываются'));
    if(items.length===0){el.style.display='block';el.className='conclusion-banner';el.innerHTML=`<div class="conclusion-title"><i class="fas fa-check-circle"></i> Заключение</div><div class="conclusion-items"><div class="conclusion-item"><span class="issue-text" style="color:var(--accent-green)">Задачи обрабатываются в нормальном режиме.</span></div></div>`;return;}
    el.style.display='block';el.className='conclusion-banner has-issues';
    el.innerHTML=`<div class="conclusion-title"><i class="fas fa-exclamation-circle"></i> Заключение и рекомендации</div><div class="conclusion-items">${data.map(d=>d.conclusion&&!d.conclusion.startsWith('Задачи обрабатываются')?`<div class="conclusion-item"><span class="emp-name">${d.employee}</span><span class="issue-text">${d.conclusion.replace('Рекомендации: ','')}</span></div>`:'').filter(Boolean).join('')}</div>`;
}
function renderTasksTable(issues) {
    const tb = document.getElementById('tasksTableBody');
    if(!issues||!issues.length){tb.innerHTML='<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-secondary)">Нет задач</td></tr>';return;}
    tb.innerHTML=issues.map(i=>{const d=getDays(i.updated||i.status_since);const dc=d>=10?'critical':d>=5?'warning':'ok';const sc=d>=5?'stale':'in-progress';const c=[];if(d>=5)c.push(`Зависла ${d}д`);
    const createdDate = i.created ? new Date(i.created).toLocaleDateString('ru-RU') : '-';
    return`<tr><td><a href="${i.url}" target="_blank" class="task-key">${i.key}</a></td><td style="font-size:12px">${i.employee}</td><td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i.summary}</td><td style="font-size:12px;color:var(--text-secondary)">${i.type}</td><td><span class="task-status-badge ${sc}">${i.status}</span></td><td style="font-size:12px">${createdDate}</td><td><span class="days-badge ${dc}">${d}д</span></td><td>${c.length?`<span class="task-comment"><i class="fas fa-exclamation-circle"></i> ${c.join('; ')}</span>`:''}</td></tr>`;}).join('');
}

// === MERGE REQUESTS ===
async function loadMergeRequests() {
    initMonthFilter('mrMonthFilter', () => loadMergeRequests());
    const month = document.getElementById('mrMonthFilter')?.value || '';
    const url = month ? `${API_BASE}/api/merge-requests?month=${month}` : `${API_BASE}/api/merge-requests`;
    try { const r = await fetch(url); mrData = await r.json(); renderMRPage(mrData); } catch(e) { console.error(e); }
}
function renderMRPage(data) {
    const empFilter = document.getElementById('mrFilterEmployee');
    const prevEmp = empFilter.value;

    empFilter.innerHTML='<option value="all">Все сотрудники</option>'+data.map(d=>`<option value="${d.employee}">${d.employee}</option>`).join('');

    if (prevEmp && [...empFilter.options].some(o => o.value === prevEmp)) empFilter.value = prevEmp;

    renderMRConclusion(data);
    let all=[]; data.forEach(d=>{(d.mrs||[]).forEach(m=>{all.push({...m,employee:d.employee});});});

    // Apply existing filters
    const stateVal = document.getElementById('mrFilterState').value;
    const pipelineVal = document.getElementById('mrFilterPipeline').value;
    if (empFilter.value !== 'all') all = all.filter(m => m.employee === empFilter.value);
    if (stateVal !== 'all') all = all.filter(m => m.state === stateVal);
    if (pipelineVal !== 'all') all = all.filter(m => m.pipeline_status === pipelineVal);

    renderMRTable(all);
}
function filterMRs(){if(!mrData)return;let all=[];mrData.forEach(d=>{(d.mrs||[]).forEach(m=>{all.push({...m,employee:d.employee});});});const e=document.getElementById('mrFilterEmployee').value,s=document.getElementById('mrFilterState').value,p=document.getElementById('mrFilterPipeline').value;if(e!=='all')all=all.filter(m=>m.employee===e);if(s!=='all')all=all.filter(m=>m.state===s);if(p!=='all')all=all.filter(m=>m.pipeline_status===p);renderMRTable(all);}
function renderMRTable(mrs){const tb=document.getElementById('mrTableBody');if(!mrs||!mrs.length){tb.innerHTML='<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-secondary)">Нет MR</td></tr>';return;}
tb.innerHTML=mrs.map(m=>{const sl=m.state==='opened'?'Открыт':m.state==='merged'?'Merged':'Закрыт';const pl=pipLabel(m.pipeline_status);const pi=pipIcon(m.pipeline_status);const pc=m.pipeline_status||'pending';const dc=m.days_open>7?'critical':m.days_open>3?'warning':'ok';const rv=m.reviewers&&m.reviewers.length?`<div class="reviewers-list">${m.reviewers.map(r=>`<span class="reviewer-tag">${r}</span>`).join('')}</div>`:'<span class="no-reviewer">Нет</span>';
return`<tr><td><a href="${m.url}" target="_blank" class="task-key">!${m.iid||m.id}</a></td><td style="font-size:12px">${m.employee}</td><td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.title}</td><td style="font-size:11px;color:var(--text-secondary)">${m.project||m.source_branch}</td><td><span class="mr-state-badge ${m.state}">${sl}</span></td><td><span class="pipeline-badge ${pc}"><i class="fas ${pi}"></i> ${pl}</span></td><td><span class="days-badge ${dc}">${m.days_open}д</span></td><td>${rv}</td></tr>`;}).join('');}
function renderMRConclusion(data){const el=document.getElementById('mrConclusion');const items=data.filter(d=>d.conclusion&&!d.conclusion.startsWith('Всё в порядке'));
if(!items.length){el.style.display='block';el.className='conclusion-banner';el.innerHTML=`<div class="conclusion-title"><i class="fas fa-check-circle"></i> Заключение</div><div class="conclusion-items"><div class="conclusion-item"><span class="issue-text" style="color:var(--accent-green)">MR обрабатываются нормально.</span></div></div>`;return;}
el.style.display='block';el.className='conclusion-banner has-issues';el.innerHTML=`<div class="conclusion-title"><i class="fas fa-exclamation-circle"></i> Заключение</div><div class="conclusion-items">${data.map(d=>d.conclusion&&!d.conclusion.startsWith('Всё в порядке')?`<div class="conclusion-item"><span class="emp-name">${d.employee}</span><span class="issue-text">${d.conclusion.replace('Обратить внимание: ','')}</span></div>`:'').filter(Boolean).join('')}</div>`;}
function pipLabel(s){return{success:'Успешно',failed:'Ошибка',running:'Запущен',pending:'Ожидает'}[s]||s||'Н/Д';}
function pipIcon(s){return{success:'fa-check-circle',failed:'fa-times-circle',running:'fa-spinner',pending:'fa-clock'}[s]||'fa-question-circle';}

// === CONFLUENCE ===
async function loadConfluence() {
    initMonthFilter('confMonthFilter', () => loadConfluence());
    const month = document.getElementById('confMonthFilter')?.value || '';
    const url = month ? `${API_BASE}/api/confluence?month=${month}` : `${API_BASE}/api/confluence`;
    try { const r = await fetch(url); confData = await r.json(); renderConfPage(confData); } catch(e) { console.error(e); }
}
function renderConfPage(data) {
    const empFilter = document.getElementById('confFilterEmployee');
    const spaceFilter = document.getElementById('confFilterSpace');
    const prevEmp = empFilter.value;
    const prevSpace = spaceFilter.value;

    empFilter.innerHTML='<option value="all">Все сотрудники</option>'+data.map(d=>`<option value="${d.employee}">${d.employee}</option>`).join('');
    const spaces=new Set(); data.forEach(d=>{(d.pages||[]).forEach(p=>{if(p.space)spaces.add(p.space+'|'+(p.space_name||p.space));});});
    spaceFilter.innerHTML='<option value="all">Все пространства</option>'+[...spaces].map(s=>{const[k,n]=s.split('|');return`<option value="${k}">${k} — ${n}</option>`;}).join('');

    if (prevEmp && [...empFilter.options].some(o => o.value === prevEmp)) empFilter.value = prevEmp;
    if (prevSpace && [...spaceFilter.options].some(o => o.value === prevSpace)) spaceFilter.value = prevSpace;

    renderConfConclusion(data);
    let all=[]; data.forEach(d=>{(d.pages||[]).forEach(p=>{all.push({...p,employee:d.employee});});});

    // Apply existing filters
    if (empFilter.value !== 'all') all = all.filter(p => p.employee === empFilter.value);
    if (spaceFilter.value !== 'all') all = all.filter(p => p.space === spaceFilter.value);

    renderConfTable(all);
}
function filterConfluence(){if(!confData)return;let all=[];confData.forEach(d=>{(d.pages||[]).forEach(p=>{all.push({...p,employee:d.employee});});});const e=document.getElementById('confFilterEmployee').value,s=document.getElementById('confFilterSpace').value;if(e!=='all')all=all.filter(p=>p.employee===e);if(s!=='all')all=all.filter(p=>p.space===s);renderConfTable(all);}
function renderConfTable(pages){const tb=document.getElementById('confTableBody');if(!pages||!pages.length){tb.innerHTML='<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-secondary)">Нет данных</td></tr>';return;}
pages.sort((a,b)=>new Date(b.last_updated)-new Date(a.last_updated));
tb.innerHTML=pages.map(p=>{const dt=p.last_updated?new Date(p.last_updated).toLocaleDateString('ru-RU'):'-';
return`<tr><td><a href="${p.url}" target="_blank" class="task-key" style="max-width:200px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.title}</a></td><td style="font-size:12px">${p.employee}</td><td><span style="font-size:11px;background:var(--bg-secondary);padding:2px 6px;border-radius:4px">${p.space}</span></td><td style="text-align:center">v${p.version||1}</td><td>${dt}</td><td style="font-size:12px;color:var(--text-secondary);max-width:240px">${p.changes||'-'}</td></tr>`;}).join('');}
function renderConfConclusion(data){const el=document.getElementById('confConclusion');if(!el)return;const items=data.filter(d=>d.conclusion&&!d.conclusion.startsWith('Документация ведётся'));
if(!items.length){el.style.display='block';el.className='conclusion-banner';el.innerHTML=`<div class="conclusion-title"><i class="fas fa-check-circle"></i> Заключение</div><div class="conclusion-items"><div class="conclusion-item"><span class="issue-text" style="color:var(--accent-green)">Документация ведётся активно.</span></div></div>`;return;}
el.style.display='block';el.className='conclusion-banner has-issues';el.innerHTML=`<div class="conclusion-title"><i class="fas fa-exclamation-circle"></i> Заключение</div><div class="conclusion-items">${data.map(d=>d.conclusion&&!d.conclusion.startsWith('Документация ведётся')?`<div class="conclusion-item"><span class="emp-name">${d.employee}</span><span class="issue-text">${d.conclusion.replace('Обратить внимание: ','')}</span></div>`:'').filter(Boolean).join('')}</div>`;}

// === HELPERS ===
function getInitials(n){const p=n.split(' ');return p.length>=2?(p[0][0]+p[1][0]).toUpperCase():n.substring(0,2).toUpperCase();}
function getDays(d){if(!d)return 0;return Math.floor((new Date()-new Date(d))/(86400000));}
function updateConnectionStatus(c){const el=document.getElementById('connectionStatus');if(c){el.innerHTML='<span class="status-dot"></span><span>Live</span>';el.style.color='var(--accent-green)';}else{el.innerHTML='<span class="status-dot" style="background:var(--accent-red)"></span><span>Offline</span>';el.style.color='var(--accent-red)';}}
function toggleAlerts(){const l=document.getElementById('alertsList'),i=document.getElementById('alertsToggleIcon');if(l.style.display==='none'){l.style.display='flex';i.className='fas fa-chevron-down';}else{l.style.display='none';i.className='fas fa-chevron-right';}}
