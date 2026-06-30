const API_BASE = window.location.origin;
const POLL_INTERVAL = 30000;
let dashboardData = null, tasksData = null, mrData = null, confData = null;
let currentPage = 'dashboard';

function getMonthOptions() {
    const months = [];
    const now = new Date();
    let d = new Date(2026, 0, 1);
    while (d <= now) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const val = `${year}-${month}`;
        const label = d.toLocaleDateString(getDateLocale(), { year: 'numeric', month: 'long' });
        months.push({ val, label });
        d.setMonth(d.getMonth() + 1);
    }
    return months.reverse();
}

document.addEventListener('DOMContentLoaded', () => {
    applyStaticTranslations();
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
    applyStaticTranslations();
    if (page === 'dashboard') fetchDashboard();
    if (page === 'tasks') loadTasks();
    if (page === 'merge-requests') loadMergeRequests();
    if (page === 'confluence') loadConfluence();
    if (page === 'candidates') loadCandidates();
}

function initMonthFilter(id, onChange) {
    const el = document.getElementById(id);
    if (!el || el.dataset.init) return;
    el.dataset.init = '1';
    const months = getMonthOptions();
    el.innerHTML = `<option value="">${t('filter.current_month')}</option><option value="all">${t('filter.all_period')}</option>` +
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

        // Also fetch workload for the same month
        const wlUrl = month ? `${API_BASE}/api/workload?month=${month}` : `${API_BASE}/api/workload`;
        try {
            const wlResp = await fetch(wlUrl, { cache: 'no-store' });
            if (wlResp.ok) dashboardData._workload = await wlResp.json();
        } catch(e) {}

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
            overlay.innerHTML = `<div class="loading-overlay-content"><div class="spinner"></div><span>${t('dashboard.loading')}</span></div>`;
            document.getElementById('page-dashboard').appendChild(overlay);
        }
        overlay.style.display = 'flex';
    } else {
        if (overlay) overlay.style.display = 'none';
    }
}

function renderDashboard(data) {
    document.getElementById('totalActive').textContent = data.summary.total_active_tasks;
    document.getElementById('totalCompleted').textContent = data.summary.total_completed_month;
    document.getElementById('totalMRs').textContent = data.summary.total_mrs_month;
    document.getElementById('totalAlerts').textContent = data.summary.total_alerts;

    renderGauges(data.employees, data.summary);
    renderAlerts(data.alerts);
    renderEmployees(data.employees);
    renderDashboardConclusion(data);

    const dt = new Date(data.last_updated);
    document.getElementById('lastUpdated').textContent = dt.toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' });
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
        ${createGauge(t('gauge.completion'), completionRate, 'green', `${totalCompleted} / ${total} ${t('gauge.tasks_completed')}`)}
        ${createGauge(t('gauge.no_stale'), noStaleRate, noStaleRate > 70 ? 'green' : noStaleRate > 40 ? 'orange' : 'red', `${totalStale} ${t('gauge.tasks_stale')}`)}
        ${createGauge(t('gauge.mr_merged'), mrMergeRate, 'blue', `${totalMRMerged} / ${totalMR} ${t('gauge.mrs_merged')}`)}
        ${createGauge(t('gauge.workload'), Math.min(100, Math.round(totalActive / Math.max(employees.length, 1) * 10)), 'purple', `~${Math.round(totalActive / Math.max(employees.length, 1))} ${t('gauge.tasks_per_person')}`)}
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
    if (totalStale > 0) issues.push(`${totalStale} ${t('conclusion.tasks_stale')}`);
    if (totalNoActivity > 0) issues.push(`${totalNoActivity} ${t('conclusion.no_git_activity')}`);
    if (data.summary.critical_alerts > 0) issues.push(`${data.summary.critical_alerts} ${t('conclusion.critical_alerts')}`);

    el.style.display = 'block';
    if (issues.length === 0) {
        el.className = 'conclusion-banner';
        el.innerHTML = `<div class="conclusion-title"><i class="fas fa-check-circle"></i> ${t('conclusion.title')}</div><div class="conclusion-items"><div class="conclusion-item"><span class="issue-text" style="color:var(--accent-green)">${t('conclusion.ok')}</span></div></div>`;
    } else {
        el.className = 'conclusion-banner has-issues';
        el.innerHTML = `<div class="conclusion-title"><i class="fas fa-exclamation-circle"></i> ${t('conclusion.title_issues')}</div><div class="conclusion-items">${issues.map(i => `<div class="conclusion-item"><span class="issue-text">${i}</span></div>`).join('')}</div>`;
    }
}

function renderAlerts(alerts) {
    const section = document.getElementById('alertsSection');
    const list = document.getElementById('alertsList');
    if (!alerts || alerts.length === 0) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    list.innerHTML = alerts.map(a => {
        const msg = I18N.lang === 'en' && a.message_en ? a.message_en : a.message;
        return `<div class="alert-item ${a.severity}"><span class="alert-badge ${a.severity}">${a.severity==='critical'?t('alerts.critical'):t('alerts.warning')}</span><span class="alert-employee">${a.employee}</span><span class="alert-message">${msg}</span>${a.task_url?`<a href="${a.task_url}" target="_blank" class="alert-link"><i class="fas fa-external-link-alt"></i></a>`:''}</div>`;
    }).join('');
}

function renderEmployees(employees) {
    const grid = document.getElementById('employeesGrid');
    if (!employees || employees.length === 0) { grid.innerHTML = `<div class="loading-state"><p>${t('no_data')}</p></div>`; return; }

    // Get workload data if available
    const wlEmps = (dashboardData && dashboardData._workload && dashboardData._workload.employees) || [];

    grid.innerHTML = employees.map(emp => {
        const initials = getInitials(emp.employee.name);
        const hasAlerts = emp.alerts && emp.alerts.length > 0;

        // Find matching workload entry
        const wl = wlEmps.find(w => w.name === emp.employee.name);
        let loadPct = 0, loadVerdict = 'low';
        if (wl) {
            loadPct = wl.percent;
            loadVerdict = wl.verdict;
        }
        const loadColor = loadVerdict === 'overload' ? 'var(--accent-red)' : loadVerdict === 'high' ? 'var(--accent-orange)' : loadVerdict === 'normal' ? 'var(--accent-green)' : 'var(--accent-blue)';

        return `<div class="employee-card ${hasAlerts?'has-alerts':''}">
            <div class="employee-header">
                <div class="employee-info"><div class="employee-avatar">${initials}</div><div><div class="employee-name">${emp.employee.name}</div><div class="employee-role">${emp.employee.role}</div></div></div>
                ${hasAlerts?`<span class="employee-alerts-badge"><i class="fas fa-exclamation-triangle"></i> ${emp.alerts.length}</span>`:''}
            </div>
            <div class="metrics-grid">
                <div class="metric-item"><div class="metric-value">${emp.tasks.active_tasks}</div><div class="metric-label">${t('emp.active')}</div></div>
                <div class="metric-item"><div class="metric-value">${emp.tasks.completed_month}</div><div class="metric-label">${t('emp.completed')}</div></div>
                <div class="metric-item"><div class="metric-value">${emp.tasks.total_tasks}</div><div class="metric-label">${t('emp.total')}</div></div>
                <div class="metric-item"><div class="metric-value">${emp.gitlab.mrs_merged_month}</div><div class="metric-label">${t('emp.mr_merged')}</div></div>
                <div class="metric-item"><div class="metric-value" style="color:${emp.tasks.stale_tasks>0?'var(--accent-red)':'var(--accent-green)'}">${emp.tasks.stale_tasks}</div><div class="metric-label">${t('emp.stale')}</div></div>
                <div class="metric-item"><div class="metric-value" style="color:${loadColor};font-size:14px">${loadPct}%</div><div class="metric-label">${t('emp.workload')}</div></div>
            </div>
        </div>`;
    }).join('');
}

// === TASKS ===
async function loadTasks() {
    initMonthFilter('tasksMonthFilter', () => loadTasks());
    const month = document.getElementById('tasksMonthFilter')?.value || '';
    const lang = I18N.lang;
    const url = month ? `${API_BASE}/api/tasks?month=${month}&lang=${lang}` : `${API_BASE}/api/tasks?lang=${lang}`;
    try { const r = await fetch(url); tasksData = await r.json(); renderTasksPage(tasksData); } catch(e) { console.error(e); }
}
function renderTasksPage(data) {
    const emps = new Set(), stats = new Set(), types = new Set();
    let all = [];
    data.forEach(d => { emps.add(d.employee); (d.issues||[]).forEach(i => { stats.add(i.status); types.add(i.type); all.push({...i, employee: d.employee}); }); });

    initMultiSelect('tasksFilterEmployee', [...emps], t('tasks.all_employees'), filterTasks);
    initMultiSelect('tasksFilterStatus', [...stats], t('tasks.all_statuses'), filterTasks);
    initMultiSelect('tasksFilterType', [...types], t('tasks.all_types'), filterTasks);

    renderTasksConclusion(data);
    filterTasks();
}
function filterTasks() {
    if (!tasksData) return;
    let all = []; tasksData.forEach(d=>{(d.issues||[]).forEach(i=>{all.push({...i,employee:d.employee});});});
    const selEmps = getMultiSelectValues('tasksFilterEmployee');
    const selStats = getMultiSelectValues('tasksFilterStatus');
    const selTypes = getMultiSelectValues('tasksFilterType');
    const search = (document.getElementById('tasksSearch')?.value || '').toLowerCase();
    if(selEmps.length) all=all.filter(i=>selEmps.includes(i.employee));
    if(selStats.length) all=all.filter(i=>selStats.includes(i.status));
    if(selTypes.length) all=all.filter(i=>selTypes.includes(i.type));
    if(search) all=all.filter(i=>(i.key+' '+i.summary+' '+i.employee+' '+i.status+' '+i.type).toLowerCase().includes(search));
    renderTasksTable(all);
}

function renderTasksConclusion(data) {
    const el = document.getElementById('tasksConclusion'); if(!el) return;
    const items = data.filter(d=>d.conclusion&&!d.conclusion.startsWith('Задачи обрабатываются')&&!d.conclusion.startsWith('Tasks are being'));
    if(items.length===0){el.style.display='block';el.className='conclusion-banner';el.innerHTML=`<div class="conclusion-title"><i class="fas fa-check-circle"></i> ${t('conclusion.section_title')}</div><div class="conclusion-items"><div class="conclusion-item"><span class="issue-text" style="color:var(--accent-green)">${t('tasks.ok')}</span></div></div>`;return;}
    el.style.display='block';el.className='conclusion-banner has-issues';
    el.innerHTML=`<div class="conclusion-title"><i class="fas fa-exclamation-circle"></i> ${t('conclusion.section_title_issues')}</div><div class="conclusion-items">${data.map(d=>d.conclusion&&!d.conclusion.startsWith('Задачи обрабатываются')&&!d.conclusion.startsWith('Tasks are being')?`<div class="conclusion-item"><span class="emp-name">${d.employee}</span><span class="issue-text">${d.conclusion}</span></div>`:'').filter(Boolean).join('')}</div>`;
}
function renderTasksTable(issues) {
    const tb = document.getElementById('tasksTableBody');
    if(!issues||!issues.length){tb.innerHTML=`<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-secondary)">${t('tasks.no_tasks')}</td></tr>`;return;}
    // Sort: active statuses first (На анализе/Analysis/В работе), then rest
    issues.sort((a, b) => {
        const priority = (status) => {
            const s = (status||'').toLowerCase();
            if (s.includes('на анализе') || s === 'analysis' || s === 'analytics' || s === 'анализ') return 0;
            if (s.includes('в работе') || s.includes('in progress')) return 1;
            if (s.includes('открыт') || s.includes('open')) return 2;
            return 3;
        };
        return priority(a.status) - priority(b.status);
    });
    tb.innerHTML=issues.map(i=>{
        const d=getDays(i.updated||i.status_since);
        const statusLower = (i.status||'').toLowerCase();
        const activeStatuses = ['открытый','на анализе','в работе','анализ','analysis','analytics'];
        const isActive = activeStatuses.some(s => statusLower.includes(s));
        const dc = isActive ? (d>=10?'critical':d>=5?'warning':'ok') : 'ok';
        const c = [];
        if (isActive && d>=5) c.push(`${t('tasks.stale_label')} ${d}${t('tasks.stale_suffix')}`);
        const sc = getStatusColorClass(statusLower);
        const createdDate = i.created ? new Date(i.created).toLocaleDateString(getDateLocale()) : '-';
        const updatedDate = i.updated ? new Date(i.updated).toLocaleDateString(getDateLocale()) : '-';
        return`<tr><td><a href="${i.url}" target="_blank" class="task-key">${i.key}</a></td><td style="font-size:12px">${i.employee}</td><td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i.summary}</td><td style="font-size:12px;color:var(--text-secondary)">${i.type}</td><td><span class="task-status-badge ${sc}">${i.status}</span></td><td style="font-size:12px">${createdDate}</td><td style="font-size:12px">${updatedDate}</td><td><span class="days-badge ${dc}">${isActive?d+t('tasks.stale_suffix'):''}</span></td><td>${c.length?`<span class="task-comment"><i class="fas fa-exclamation-circle"></i> ${c.join('; ')}</span>`:''}</td><td><button class="btn-icon" onclick="loadTaskComments('${i.key}',this)" title="${t('comments.none')}"><i class="fas fa-comment"></i></button></td></tr>`;
    }).join('');
}

function getStatusColorClass(status) {
    if (status.includes('готово') || status.includes('done') || status.includes('выполнено') || status.includes('ready for development') || status.includes('resolved') || status.includes('закрыт') || status.includes('завершено')) return 'status-green';
    if (status.includes('анализ') || status.includes('в работе') || status.includes('открыт') || status.includes('analysis') || status.includes('analytics') || status.includes('in progress')) return 'status-blue';
    if (status.includes('отмен') || status.includes('cancel') || status.includes('rejected')) return 'status-red';
    if (status.includes('backlog') || status.includes('сделать') || status.includes('to do')) return 'status-gray';
    if (status.includes('block')) return 'status-orange';
    return 'status-purple';
}

// === MERGE REQUESTS ===
async function loadMergeRequests() {
    initMonthFilter('mrMonthFilter', () => loadMergeRequests());
    const month = document.getElementById('mrMonthFilter')?.value || '';
    const lang = I18N.lang;
    const url = month ? `${API_BASE}/api/merge-requests?month=${month}&lang=${lang}` : `${API_BASE}/api/merge-requests?lang=${lang}`;
    try { const r = await fetch(url); mrData = await r.json(); renderMRPage(mrData); } catch(e) { console.error(e); }
}
function renderMRPage(data) {
    const empFilter = document.getElementById('mrFilterEmployee');
    const prevEmp = empFilter.value;

    empFilter.innerHTML=`<option value="all">${t('mr.all_employees')}</option>`+data.map(d=>`<option value="${d.employee}">${d.employee}</option>`).join('');

    if (prevEmp && [...empFilter.options].some(o => o.value === prevEmp)) empFilter.value = prevEmp;

    renderMRConclusion(data);
    let all=[]; data.forEach(d=>{(d.mrs||[]).forEach(m=>{all.push({...m,employee:d.employee});});});

    const stateVal = document.getElementById('mrFilterState').value;
    const pipelineVal = document.getElementById('mrFilterPipeline').value;
    if (empFilter.value !== 'all') all = all.filter(m => m.employee === empFilter.value);
    if (stateVal !== 'all') all = all.filter(m => m.state === stateVal);
    if (pipelineVal !== 'all') all = all.filter(m => m.pipeline_status === pipelineVal);

    renderMRTable(all);
}

function filterMRs(){if(!mrData)return;let all=[];mrData.forEach(d=>{(d.mrs||[]).forEach(m=>{all.push({...m,employee:d.employee});});});const e=document.getElementById('mrFilterEmployee').value,s=document.getElementById('mrFilterState').value,p=document.getElementById('mrFilterPipeline').value;
    const search = (document.getElementById('mrSearch')?.value || '').toLowerCase();
    if(e!=='all')all=all.filter(m=>m.employee===e);if(s!=='all')all=all.filter(m=>m.state===s);if(p!=='all')all=all.filter(m=>m.pipeline_status===p);
    if(search) all=all.filter(m=>(m.title+' '+m.employee+' '+(m.project||'')+' '+(m.source_branch||'')).toLowerCase().includes(search));
    renderMRTable(all);}
function renderMRTable(mrs){const tb=document.getElementById('mrTableBody');if(!mrs||!mrs.length){tb.innerHTML=`<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-secondary)">${t('mr.no_data')}</td></tr>`;return;}
// Sort: opened first, then merged, then closed
mrs.sort((a, b) => {
    const priority = (state) => state === 'opened' ? 0 : state === 'merged' ? 1 : 2;
    return priority(a.state) - priority(b.state);
});
tb.innerHTML=mrs.map(m=>{
    const sl=m.state==='opened'?'Open':m.state==='merged'?'Merged':'Closed';
    const pl=pipLabel(m.pipeline_status);const pi=pipIcon(m.pipeline_status);const pc=m.pipeline_status||'pending';
    const dc=m.days_open>7?'critical':m.days_open>3?'warning':'ok';
    const rv=m.reviewers&&m.reviewers.length?`<div class="reviewers-list">${m.reviewers.map(r=>`<span class="reviewer-tag">${r}</span>`).join('')}</div>`:`<span class="no-reviewer">${t('mr.no_reviewer')}</span>`;
    const createdDate = m.created_at ? new Date(m.created_at).toLocaleDateString(getDateLocale()) : '-';
    const isContracts = (m.project||'').includes('contracts') || (m.project_path||'').includes('contracts');
    const reviewBtn = isContracts && m.state === 'opened' ? `<button class="btn-icon btn-review" onclick="reviewMR('${m.project_path||m.project}',${m.iid||m.id})" title="Review Contract"><i class="fas fa-search-plus"></i></button>` : '';
    const rowClass = m.has_conflicts ? 'row-conflicts' : '';
    const conflictLabel = m.has_conflicts ? '<span style="font-size:11px;vertical-align:middle;margin-left:4px">⛔</span>' : '';
    return`<tr class="${rowClass}"><td><a href="${m.url}" target="_blank" class="task-key">!${m.iid||m.id}</a>${conflictLabel}</td><td style="font-size:12px">${m.employee}</td><td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.title}</td><td style="font-size:11px;color:var(--text-secondary)">${m.project||m.source_branch}</td><td><span class="mr-state-badge ${m.state}">${sl}</span></td><td><span class="pipeline-badge ${pc}"><i class="fas ${pi}"></i> ${pl}</span></td><td style="font-size:12px">${createdDate}</td><td><span class="days-badge ${dc}">${m.days_open}${t('tasks.stale_suffix')}</span></td><td>${rv}</td><td>${reviewBtn}</td></tr>`;}).join('');}

function renderMRConclusion(data){const el=document.getElementById('mrConclusion');const items=data.filter(d=>d.conclusion&&!d.conclusion.startsWith('Всё в порядке')&&!d.conclusion.startsWith('All good'));
if(!items.length){el.style.display='block';el.className='conclusion-banner';el.innerHTML=`<div class="conclusion-title"><i class="fas fa-check-circle"></i> ${t('conclusion.section_title')}</div><div class="conclusion-items"><div class="conclusion-item"><span class="issue-text" style="color:var(--accent-green)">${t('mr.ok')}</span></div></div>`;return;}
el.style.display='block';el.className='conclusion-banner has-issues';el.innerHTML=`<div class="conclusion-title"><i class="fas fa-exclamation-circle"></i> ${t('conclusion.section_title')}</div><div class="conclusion-items">${data.map(d=>d.conclusion&&!d.conclusion.startsWith('Всё в порядке')&&!d.conclusion.startsWith('All good')?`<div class="conclusion-item"><span class="emp-name">${d.employee}</span><span class="issue-text">${d.conclusion}</span></div>`:'').filter(Boolean).join('')}</div>`;}
function pipLabel(s){
    const map = {success:t('pipeline.success'),failed:t('pipeline.failed'),running:t('pipeline.running'),pending:t('pipeline.pending')};
    return map[s]||s||t('pipeline.na');
}
function pipIcon(s){return{success:'fa-check-circle',failed:'fa-times-circle',running:'fa-spinner',pending:'fa-clock'}[s]||'fa-question-circle';}

// === CONFLUENCE ===
async function loadConfluence() {
    initMonthFilter('confMonthFilter', () => loadConfluence());
    const month = document.getElementById('confMonthFilter')?.value || '';
    const lang = I18N.lang;
    const url = month ? `${API_BASE}/api/confluence?month=${month}&lang=${lang}` : `${API_BASE}/api/confluence?lang=${lang}`;
    try { const r = await fetch(url); confData = await r.json(); renderConfPage(confData); } catch(e) { console.error(e); }
}

function renderConfPage(data) {
    const empFilter = document.getElementById('confFilterEmployee');
    const spaceFilter = document.getElementById('confFilterSpace');
    const prevEmp = empFilter.value;
    const prevSpace = spaceFilter.value;

    empFilter.innerHTML=`<option value="all">${t('conf.all_employees')}</option>`+data.map(d=>`<option value="${d.employee}">${d.employee}</option>`).join('');
    const spaces=new Set(); data.forEach(d=>{(d.pages||[]).forEach(p=>{if(p.space)spaces.add(p.space+'|'+(p.space_name||p.space));});});
    spaceFilter.innerHTML=`<option value="all">${t('conf.all_spaces')}</option>`+[...spaces].map(s=>{const[k,n]=s.split('|');return`<option value="${k}">${k} — ${n}</option>`;}).join('');

    if (prevEmp && [...empFilter.options].some(o => o.value === prevEmp)) empFilter.value = prevEmp;
    if (prevSpace && [...spaceFilter.options].some(o => o.value === prevSpace)) spaceFilter.value = prevSpace;

    renderConfConclusion(data);
    let all=[]; data.forEach(d=>{(d.pages||[]).forEach(p=>{all.push({...p,employee:d.employee});});});

    if (empFilter.value !== 'all') all = all.filter(p => p.employee === empFilter.value);
    if (spaceFilter.value !== 'all') all = all.filter(p => p.space === spaceFilter.value);

    renderConfTable(all);
}
function filterConfluence(){if(!confData)return;let all=[];confData.forEach(d=>{(d.pages||[]).forEach(p=>{all.push({...p,employee:d.employee});});});const e=document.getElementById('confFilterEmployee').value,s=document.getElementById('confFilterSpace').value;
    const search = (document.getElementById('confSearch')?.value || '').toLowerCase();
    if(e!=='all')all=all.filter(p=>p.employee===e);if(s!=='all')all=all.filter(p=>p.space===s);
    if(search) all=all.filter(p=>(p.title+' '+p.employee+' '+p.space+' '+(p.space_name||'')+' '+(p.changes||'')).toLowerCase().includes(search));
    renderConfTable(all);}
function renderConfTable(pages){const tb=document.getElementById('confTableBody');if(!pages||!pages.length){tb.innerHTML=`<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-secondary)">${t('conf.no_data')}</td></tr>`;return;}
pages.sort((a,b)=>new Date(b.last_updated)-new Date(a.last_updated));
tb.innerHTML=pages.map(p=>{const dt=p.last_updated?new Date(p.last_updated).toLocaleDateString(getDateLocale()):'-';
return`<tr><td><a href="${p.url}" target="_blank" class="task-key" style="max-width:200px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.title}</a></td><td style="font-size:12px">${p.employee}</td><td><span style="font-size:11px;background:var(--bg-secondary);padding:2px 6px;border-radius:4px">${p.space}</span></td><td style="text-align:center">v${p.version||1}</td><td>${dt}</td><td style="font-size:12px;color:var(--text-secondary);max-width:240px">${p.changes||'-'}</td></tr>`;}).join('');}

function renderConfConclusion(data){const el=document.getElementById('confConclusion');if(!el)return;const items=data.filter(d=>d.conclusion&&!d.conclusion.startsWith('Документация ведётся')&&!d.conclusion.startsWith('Documentation is'));
if(!items.length){el.style.display='block';el.className='conclusion-banner';el.innerHTML=`<div class="conclusion-title"><i class="fas fa-check-circle"></i> ${t('conclusion.section_title')}</div><div class="conclusion-items"><div class="conclusion-item"><span class="issue-text" style="color:var(--accent-green)">${t('conf.ok')}</span></div></div>`;return;}
el.style.display='block';el.className='conclusion-banner has-issues';el.innerHTML=`<div class="conclusion-title"><i class="fas fa-exclamation-circle"></i> ${t('conclusion.section_title')}</div><div class="conclusion-items">${data.map(d=>d.conclusion&&!d.conclusion.startsWith('Документация ведётся')&&!d.conclusion.startsWith('Documentation is')?`<div class="conclusion-item"><span class="emp-name">${d.employee}</span><span class="issue-text">${d.conclusion}</span></div>`:'').filter(Boolean).join('')}</div>`;}

// === HELPERS ===
function getInitials(n){const p=n.split(' ');return p.length>=2?(p[0][0]+p[1][0]).toUpperCase():n.substring(0,2).toUpperCase();}
function getDays(d){if(!d)return 0;return Math.floor((new Date()-new Date(d))/(86400000));}
function updateConnectionStatus(c){const el=document.getElementById('connectionStatus');if(c){el.innerHTML='<span class="status-dot"></span><span>Live</span>';el.style.color='var(--accent-green)';}else{el.innerHTML='<span class="status-dot" style="background:var(--accent-red)"></span><span>Offline</span>';el.style.color='var(--accent-red)';}}
function toggleAlerts(){const l=document.getElementById('alertsList'),i=document.getElementById('alertsToggleIcon');if(l.style.display==='none'){l.style.display='flex';i.className='fas fa-chevron-down';}else{l.style.display='none';i.className='fas fa-chevron-right';}}

// === EXPORT ===
function exportAlertsToExcel() {
    if (!dashboardData || !dashboardData.alerts || dashboardData.alerts.length === 0) {
        alert(t('alerts.no_data'));
        return;
    }

    const rows = dashboardData.alerts.map(a => ({
        [t('export.employee')]: a.employee,
        [t('export.type')]: getAlertTypeLabel(a.type),
        [t('export.severity')]: a.severity === 'critical' ? t('export.severity_critical') : t('export.severity_warning'),
        [t('export.description')]: a.message,
        [t('export.task')]: a.task_key || '-',
        [t('export.link')]: a.task_url || '-',
        [t('export.days_in_status')]: a.days_in_status || '-',
        [t('export.date')]: new Date(a.created_at).toLocaleDateString(getDateLocale())
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const colWidths = Object.keys(rows[0]).map(key => ({
        wch: Math.max(key.length, ...rows.map(r => String(r[key]).length)) + 2
    }));
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t('export.sheet_alerts'));

    const month = document.getElementById('dashboardMonthFilter')?.value || 'current';
    const filename = `alerts_${month || 'current'}_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, filename);
}

function getAlertTypeLabel(type) {
    const map = {
        'stale_task': t('alert_type.stale_task'),
        'no_activity': t('alert_type.no_activity'),
        'mr_no_review': t('alert_type.mr_no_review'),
        'overdue': t('alert_type.overdue')
    };
    return map[type] || type;
}

// === CANDIDATES ===
let candidatesData = null;
const COMPETENCIES = ['Способы интеграции систем','Проектирование интеграций (SOAP, REST, gRPC, очереди)','Описание ТЗ на разработку','Проектирование БД (SQL, связи, индексы, нормализация)','Синхронное/асинхронное взаимодействие','Брокеры сообщений (Kafka/RabbitMQ)','Разбор архитектуры (монолит/микросервис/SOA)'];
const COMPETENCIES_EN = ['System Integration Methods','Integration Design (SOAP, REST, gRPC, queues)','Writing Technical Specs','DB Design (SQL, relations, indexes, normalization)','Sync/Async Communication','Message Brokers (Kafka/RabbitMQ)','Architecture Analysis (monolith/microservice/SOA)'];

function getCompetencies() { return I18N.lang === 'en' ? COMPETENCIES_EN : COMPETENCIES; }

async function loadCandidates() {
    initMonthFilter('candidatesMonthFilter', () => loadCandidates());
    const month = document.getElementById('candidatesMonthFilter')?.value || '';
    const lang = I18N.lang;
    const url = month ? `${API_BASE}/api/candidates?month=${month}&lang=${lang}` : `${API_BASE}/api/candidates?lang=${lang}`;
    try { const r = await fetch(url, {cache:'no-store'}); candidatesData = await r.json(); renderCandidatesPage(candidatesData); } catch(e) { console.error(e); }
}

function renderCandidatesPage(data) {
    const s = data.stats;
    document.getElementById('candidatesStats').innerHTML = `
        <div class="summary-card"><div class="summary-icon blue"><i class="fas fa-users"></i></div><div class="summary-content"><span class="summary-value">${s.total}</span><span class="summary-label">${t('cand.stat_total')}</span></div></div>
        <div class="summary-card"><div class="summary-icon green"><i class="fas fa-user-check"></i></div><div class="summary-content"><span class="summary-value">${s.accepted}</span><span class="summary-label">${t('cand.stat_accepted')}</span></div></div>
        <div class="summary-card"><div class="summary-icon red"><i class="fas fa-user-times"></i></div><div class="summary-content"><span class="summary-value">${s.rejected}</span><span class="summary-label">${t('cand.stat_rejected')}</span></div></div>
        <div class="summary-card"><div class="summary-icon orange"><i class="fas fa-percentage"></i></div><div class="summary-content"><span class="summary-value">${s.conversion}%</span><span class="summary-label">${t('cand.stat_conversion')}</span></div></div>
        <div class="summary-card"><div class="summary-icon purple"><i class="fas fa-star-half-alt"></i></div><div class="summary-content"><span class="summary-value">${s.avg_score}</span><span class="summary-label">${t('cand.stat_avg_score')}</span></div></div>
    `;
    const el = document.getElementById('candidatesConclusion');
    el.style.display = 'block';
    const hasIssues = s.conversion < 30 || s.total === 0;
    el.className = `conclusion-banner ${hasIssues ? 'has-issues' : ''}`;
    el.innerHTML = `<div class="conclusion-title"><i class="fas ${hasIssues?'fa-exclamation-circle':'fa-check-circle'}"></i> ${t('conclusion.section_title')}</div><div class="conclusion-items"><div class="conclusion-item"><span class="issue-text">${data.conclusion}</span></div></div>`;
    let candidates = data.candidates || [];
    const resultFilter = document.getElementById('candidatesResultFilter').value;
    if (resultFilter !== 'all') candidates = candidates.filter(c => c.result === resultFilter);
    renderCandidatesTable(candidates);
}

function filterCandidates() {
    if (!candidatesData) return;
    let candidates = candidatesData.candidates || [];
    const resultFilter = document.getElementById('candidatesResultFilter').value;
    const search = (document.getElementById('candidatesSearch')?.value || '').toLowerCase();
    if (resultFilter !== 'all') candidates = candidates.filter(c => c.result === resultFilter);
    if (search) candidates = candidates.filter(c => (c.name + ' ' + c.conclusion + ' ' + c.level + ' ' + c.result).toLowerCase().includes(search));
    renderCandidatesTable(candidates);
}

function getResultLabel(result) {
    const map = {
        'accepted': t('cand.result_accepted'),
        'accepted_no_sb': t('cand.result_no_sb'),
        'pending': t('cand.result_pending'),
        'rejected': t('cand.result_rejected')
    };
    return map[result] || t('cand.result_rejected');
}

function renderCandidatesTable(candidates) {
    const tb = document.getElementById('candidatesTableBody');
    if (!candidates || !candidates.length) { tb.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-secondary)">${t('cand.no_data')}</td></tr>`; return; }
    tb.innerHTML = candidates.map(c => {
        const date = new Date(c.date).toLocaleDateString(getDateLocale());
        const resultLabel = getResultLabel(c.result);
        const resultClass = c.result === 'accepted' ? 'done' : c.result === 'accepted_no_sb' ? 'review' : c.result === 'pending' ? 'status-blue' : 'stale';
        const scores = c.competencies ? c.competencies.map(comp => `<span title="${comp.name}: ${comp.comment||''}" style="display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;border-radius:3px;font-size:10px;margin-right:2px;background:${comp.score>=4?'rgba(52,211,153,0.2)':comp.score>=3?'rgba(251,191,36,0.2)':'rgba(248,113,113,0.2)'};color:${comp.score>=4?'var(--accent-green)':comp.score>=3?'var(--accent-yellow)':'var(--accent-red)'}">${comp.score}</span>`).join('') : '';
        return `<tr>
            <td><strong style="font-size:13px">${c.name}</strong><div style="margin-top:4px">${scores}</div></td>
            <td style="font-size:12px">${date}</td>
            <td style="font-size:14px;font-weight:600">${c.avg_score}</td>
            <td><span class="task-status-badge in-progress">${c.level}</span></td>
            <td><span class="task-status-badge ${resultClass}">${resultLabel}</span></td>
            <td><span class="editable-conclusion" onclick="editConclusion('${c.id}', this)" title="${t('cand.click_to_edit')}">${c.conclusion || '—'}</span></td>
            <td>
                <div style="display:flex;gap:4px">
                    <button class="btn-icon" onclick="editCandidate('${c.id}')" title="${t('cand.form.save')}"><i class="fas fa-pen"></i></button>
                    <button class="btn-icon btn-icon-danger" onclick="deleteCandidate('${c.id}','${c.name}')" title="${t('cand.delete_confirm')}"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function showAddCandidateForm() {
    document.getElementById('candidateFormOverlay').style.display = 'flex';
    document.getElementById('cf_name').value = '';
    document.getElementById('cf_date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('cf_result').value = 'rejected';
    document.getElementById('cf_conclusion').value = '';
    document.getElementById('cf_name').dataset.editId = '';
    const comps = document.getElementById('cf_competencies');
    const compNames = getCompetencies();
    comps.innerHTML = compNames.map((name, i) => `
        <div class="form-comp-row">
            <span class="form-comp-name">${name}</span>
            <input type="number" min="1" max="8" value="1" id="cf_score_${i}" class="form-input-sm">
            <input type="text" placeholder="${t('cand.form.comment')}" id="cf_comment_${i}" class="form-input" style="flex:1">
        </div>
    `).join('');
    applyStaticTranslations();
}

function editCandidate(id) {
    const candidates = candidatesData?.candidates || [];
    const c = candidates.find(x => x.id === id);
    if (!c) return;

    document.getElementById('candidateFormOverlay').style.display = 'flex';
    document.getElementById('cf_name').value = c.name;
    document.getElementById('cf_name').dataset.editId = c.id;
    document.getElementById('cf_date').value = c.date ? c.date.slice(0, 10) : '';
    document.getElementById('cf_result').value = c.result || 'rejected';
    document.getElementById('cf_conclusion').value = c.conclusion || '';

    const comps = document.getElementById('cf_competencies');
    const compNames = getCompetencies();
    comps.innerHTML = compNames.map((name, i) => {
        const existing = (c.competencies || [])[i];
        const score = existing ? existing.score : 1;
        const comment = existing ? existing.comment : '';
        return `
        <div class="form-comp-row">
            <span class="form-comp-name">${name}</span>
            <input type="number" min="1" max="8" value="${score}" id="cf_score_${i}" class="form-input-sm">
            <input type="text" placeholder="${t('cand.form.comment')}" value="${comment}" id="cf_comment_${i}" class="form-input" style="flex:1">
        </div>`;
    }).join('');
    applyStaticTranslations();
}

function hideAddCandidateForm() { document.getElementById('candidateFormOverlay').style.display = 'none'; }

async function submitCandidate() {
    const name = document.getElementById('cf_name').value.trim();
    if (!name) { alert(t('cand.form.error_name')); return; }
    const editId = document.getElementById('cf_name').dataset.editId;
    const date = document.getElementById('cf_date').value;
    const result = document.getElementById('cf_result').value;
    const conclusion = document.getElementById('cf_conclusion').value.trim();
    // Always save competencies with Russian names (canonical key)
    const competencies = COMPETENCIES.map((compName, i) => ({
        name: compName,
        score: parseInt(document.getElementById(`cf_score_${i}`).value) || 1,
        comment: document.getElementById(`cf_comment_${i}`).value.trim()
    }));
    const body = { name, date: date + 'T00:00:00+05:00', result, conclusion, competencies };

    let url = `${API_BASE}/api/candidates/add`;
    if (editId) {
        body.id = editId;
        url = `${API_BASE}/api/candidates/update`;
    }

    try {
        const r = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
        if (r.ok) { hideAddCandidateForm(); loadCandidates(); } else { alert(t('cand.form.error_save')); }
    } catch(e) { alert(t('error.generic') + ': ' + e.message); }
}

function exportCandidatesToExcel() {
    if (!candidatesData || !candidatesData.candidates || !candidatesData.candidates.length) { alert(t('no_data')); return; }
    const rows = candidatesData.candidates.map(c => {
        const row = {
            [t('cand.export.col.name')]: c.name,
            [t('cand.export.col.date')]: new Date(c.date).toLocaleDateString(getDateLocale()),
            [t('cand.export.col.avg_score')]: c.avg_score,
            [t('cand.export.col.level')]: c.level,
            [t('cand.export.col.grade')]: c.grade,
            [t('cand.export.col.result')]: getResultLabel(c.result),
            [t('cand.export.col.conclusion')]: c.conclusion
        };
        (c.competencies || []).forEach(comp => { row[comp.name] = comp.score; });
        return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length, 12) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t('cand.export.sheet'));
    XLSX.writeFile(wb, `interviews_${new Date().toISOString().slice(0,10)}.xlsx`);
}

async function deleteCandidate(id, name) {
    if (!confirm(`${t('cand.delete_confirm')} "${name}"?`)) return;
    try {
        const r = await fetch(`${API_BASE}/api/candidates/delete`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id}) });
        if (r.ok) loadCandidates();
        else alert(t('cand.delete_error'));
    } catch(e) { alert(t('error.generic') + ': ' + e.message); }
}

function editConclusion(id, el) {
    const current = el.textContent;
    const input = document.createElement('textarea');
    input.value = current === '—' ? '' : current;
    input.className = 'form-input';
    input.style.fontSize = '12px';
    input.style.minHeight = '50px';
    input.style.width = '100%';
    el.replaceWith(input);
    input.focus();

    async function save() {
        const newText = input.value.trim();
        try {
            await fetch(`${API_BASE}/api/candidates/conclusion`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id, conclusion: newText}) });
        } catch(e) {}
        loadCandidates();
    }

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } });
}

// === THEME ===
function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
}

function updateThemeIcon(theme) {
    const icon = document.getElementById('themeIcon');
    if (icon) {
        icon.className = theme === 'light' ? 'fas fa-sun' : 'fas fa-moon';
    }
}

// Apply saved theme on load
(function() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    document.addEventListener('DOMContentLoaded', () => updateThemeIcon(saved));
})();

// === TASKS EXPORT ===
function showTasksExportDialog() {
    const employees = tasksData ? tasksData.map(d => d.employee) : [];
    const month = document.getElementById('tasksMonthFilter')?.value || '';

    const types = new Set();
    const projects = new Set();
    if (tasksData) {
        tasksData.forEach(d => {
            (d.issues || []).forEach(i => {
                types.add(i.type);
                projects.add(i.project);
            });
        });
    }

    const overlay = document.createElement('div');
    overlay.className = 'candidate-form-overlay';
    overlay.id = 'tasksExportOverlay';
    overlay.innerHTML = `
        <div class="candidate-form" style="width:480px;max-height:80vh;overflow-y:auto">
            <h3><i class="fas fa-file-excel" style="color:var(--accent-green)"></i> ${t('tasks.export.title')}</h3>
            <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">${t('tasks.export.comments_note')}</p>
            <div style="margin-bottom:14px">
                <label style="font-size:12px;color:var(--text-secondary)">${t('tasks.export.period')}</label>
                <select class="form-input" id="exportMonth" style="margin-top:4px">
                    <option value="" ${!month?'selected':''}>${t('filter.current_month')}</option>
                    <option value="all">${t('filter.all_period')}</option>
                    ${getMonthOptions().map(m => `<option value="${m.val}" ${m.val===month?'selected':''}>${m.label}</option>`).join('')}
                </select>
            </div>
            <div style="margin-bottom:14px">
                <label style="font-size:12px;color:var(--text-secondary)">${t('tasks.export.employees')}</label>
                <div style="margin-top:4px;margin-bottom:4px"><a href="#" onclick="toggleExportCheckboxes('.export-emp-cb', true);return false" style="font-size:11px;color:var(--accent-magenta);margin-right:10px">${t('tasks.export.select_all')}</a><a href="#" onclick="toggleExportCheckboxes('.export-emp-cb', false);return false" style="font-size:11px;color:var(--text-muted)">${t('tasks.export.deselect')}</a></div>
                <div style="display:flex;flex-direction:column;gap:6px">
                    ${employees.map(e => `<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="checkbox" class="export-emp-cb" value="${e}" checked> ${e}</label>`).join('')}
                </div>
            </div>
            <div style="margin-bottom:14px">
                <label style="font-size:12px;color:var(--text-secondary)">${t('tasks.export.types')}</label>
                <div style="margin-top:4px;margin-bottom:4px"><a href="#" onclick="toggleExportCheckboxes('.export-type-cb', true);return false" style="font-size:11px;color:var(--accent-magenta);margin-right:10px">${t('tasks.export.select_all')}</a><a href="#" onclick="toggleExportCheckboxes('.export-type-cb', false);return false" style="font-size:11px;color:var(--text-muted)">${t('tasks.export.deselect')}</a></div>
                <div style="display:flex;flex-direction:column;gap:6px">
                    ${[...types].map(tp => `<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="checkbox" class="export-type-cb" value="${tp}" checked> ${tp}</label>`).join('')}
                </div>
            </div>
            <div style="margin-bottom:14px">
                <label style="font-size:12px;color:var(--text-secondary)">${t('tasks.export.projects')}</label>
                <div style="margin-top:4px;margin-bottom:4px"><a href="#" onclick="toggleExportCheckboxes('.export-project-cb', true);return false" style="font-size:11px;color:var(--accent-magenta);margin-right:10px">${t('tasks.export.select_all')}</a><a href="#" onclick="toggleExportCheckboxes('.export-project-cb', false);return false" style="font-size:11px;color:var(--text-muted)">${t('tasks.export.deselect')}</a></div>
                <div style="display:flex;flex-direction:column;gap:6px;max-height:120px;overflow-y:auto">
                    ${[...projects].map(p => `<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="checkbox" class="export-project-cb" value="${p}" checked> ${p}</label>`).join('')}
                </div>
            </div>
            <div class="form-actions">
                <button class="btn-save" onclick="executeTasksExport()"><i class="fas fa-download"></i> ${t('tasks.export.download')}</button>
                <button class="btn-cancel" onclick="document.getElementById('tasksExportOverlay').remove()">${t('tasks.export.cancel')}</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

async function executeTasksExport() {
    const month = document.getElementById('exportMonth').value;
    const checkboxes = document.querySelectorAll('.export-emp-cb:checked');
    const employees = [...checkboxes].map(cb => cb.value).join(',');
    const selectedTypes = new Set([...document.querySelectorAll('.export-type-cb:checked')].map(cb => cb.value));
    const selectedProjects = new Set([...document.querySelectorAll('.export-project-cb:checked')].map(cb => cb.value));

    if (!employees) { alert(t('tasks.export.no_employee')); return; }

    const btn = document.querySelector('#tasksExportOverlay .btn-save');
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${t('tasks.export.loading')}`;
    btn.disabled = true;

    try {
        const url = `${API_BASE}/api/tasks/export?month=${month}&employees=${encodeURIComponent(employees)}`;
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) throw new Error(t('tasks.export.error'));
        let data = await resp.json();

        data = data.filter(task => selectedTypes.has(task.type) && selectedProjects.has(task.project));

        const rows = data.map(task => {
            const commentsText = (task.comments || [])
                .map(c => `[${c.created ? c.created.slice(0,10) : ''}] ${c.author}: ${c.body}`)
                .join('\n---\n');
            return {
                [t('tasks.export.col.key')]: task.key,
                [t('tasks.export.col.employee')]: task.employee,
                [t('tasks.export.col.task')]: task.summary,
                [t('tasks.export.col.type')]: task.type,
                [t('tasks.export.col.status')]: task.status,
                [t('tasks.export.col.project')]: task.project,
                [t('tasks.export.col.created')]: task.created,
                [t('tasks.export.col.updated')]: task.updated,
                [t('tasks.export.col.link')]: task.url,
                [t('tasks.export.col.comments')]: commentsText || '-'
            };
        });

        if (!rows.length) { alert(t('tasks.export.no_tasks')); btn.innerHTML = `<i class="fas fa-download"></i> ${t('tasks.export.download')}`; btn.disabled = false; return; }

        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: k === t('tasks.export.col.comments') ? 60 : k === t('tasks.export.col.task') ? 40 : k === t('tasks.export.col.link') ? 50 : 16 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, t('tasks.export.sheet'));
        const filename = `tasks_${month || 'current'}_${new Date().toISOString().slice(0,10)}.xlsx`;
        XLSX.writeFile(wb, filename);

        document.getElementById('tasksExportOverlay').remove();
    } catch(e) {
        alert(t('error.generic') + ': ' + e.message);
        btn.innerHTML = `<i class="fas fa-download"></i> ${t('tasks.export.download')}`;
        btn.disabled = false;
    }
}

// === TASK COMMENTS (by click) ===
async function loadTaskComments(key, btn) {
    const row = btn.closest('tr');
    const nextRow = row.nextElementSibling;
    if (nextRow && nextRow.classList.contains('comments-row')) {
        nextRow.remove();
        return;
    }
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
        const commResp = await fetch(`${API_BASE}/api/tasks/comments?key=${key}`, { cache: 'no-store' });
        if (!commResp.ok) throw new Error('Failed');
        const comments = await commResp.json();
        btn.innerHTML = '<i class="fas fa-comment"></i>';

        const commRow = document.createElement('tr');
        commRow.className = 'comments-row';
        if (!comments || !comments.length) {
            commRow.innerHTML = `<td colspan="10" style="padding:12px 20px;font-size:12px;color:var(--text-muted);background:var(--bg-secondary)">${t('comments.none')}</td>`;
        } else {
            const html = comments.map(c => `<div style="margin-bottom:8px;padding:6px 0;border-bottom:1px solid var(--border)"><strong style="color:var(--accent-magenta)">${c.author}</strong> <span style="color:var(--text-muted);font-size:11px">${c.created?new Date(c.created).toLocaleDateString(getDateLocale()):''}</span><div style="margin-top:4px;white-space:pre-wrap">${c.body}</div></div>`).join('');
            commRow.innerHTML = `<td colspan="10" style="padding:12px 20px;font-size:12px;background:var(--bg-secondary);max-height:200px;overflow-y:auto">${html}</td>`;
        }
        row.after(commRow);
    } catch(e) {
        btn.innerHTML = '<i class="fas fa-comment"></i>';
        alert(t('comments.error'));
    }
}

function toggleExportCheckboxes(selector, checked) {
    document.querySelectorAll(selector).forEach(cb => cb.checked = checked);
}

// === MR CONTRACT REVIEW ===
let lastReviewData = null;
let lastReviewCommits = null;

async function reviewMR(projectPath, mrIid) {
    showReviewModal(null, true);

    try {
        // Fetch commits list
        const commitsResp = await fetch(`${API_BASE}/api/mr/commits?project_path=${encodeURIComponent(projectPath)}&mr_iid=${mrIid}`);
        if (commitsResp.ok) {
            lastReviewCommits = await commitsResp.json();
        } else {
            lastReviewCommits = [];
        }

        // Review HEAD by default
        const resp = await fetch(`${API_BASE}/api/mr/review`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ project_path: projectPath, mr_iid: mrIid, force: false })
        });
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        lastReviewData = data;
        lastReviewData._projectPath = projectPath;
        lastReviewData._mrIid = mrIid;
        showReviewModal(data, false);
    } catch(e) {
        hideReviewModal();
        alert('Review error: ' + e.message);
    }
}

async function forceReviewMR() {
    if (!lastReviewData) return;
    showReviewModal(null, true);
    try {
        const resp = await fetch(`${API_BASE}/api/mr/review`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ project_path: lastReviewData._projectPath, mr_iid: lastReviewData._mrIid, force: true })
        });
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        data._projectPath = lastReviewData._projectPath;
        data._mrIid = lastReviewData._mrIid;
        lastReviewData = data;
        showReviewModal(data, false);
    } catch(e) {
        hideReviewModal();
        alert('Review error: ' + e.message);
    }
}

async function reviewByCommit(sha) {
    if (!lastReviewData) return;
    showReviewModal(null, true);
    try {
        const resp = await fetch(`${API_BASE}/api/mr/review`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ project_path: lastReviewData._projectPath, mr_iid: lastReviewData._mrIid, force: true, commit_sha: sha })
        });
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        data._projectPath = lastReviewData._projectPath;
        data._mrIid = lastReviewData._mrIid;
        lastReviewData = data;
        showReviewModal(data, false);
    } catch(e) {
        hideReviewModal();
        alert('Review error: ' + e.message);
    }
}

function showReviewModal(data, loading) {
    let overlay = document.getElementById('reviewModalOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'reviewModalOverlay';
        overlay.className = 'candidate-form-overlay';
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';

    if (loading) {
        overlay.innerHTML = `
            <div class="candidate-form" style="width:700px;max-height:85vh;overflow-y:auto">
                <h3><i class="fas fa-search-plus" style="color:var(--accent-magenta)"></i> Contract Review</h3>
                <div style="text-align:center;padding:40px"><div class="spinner"></div><p style="margin-top:12px;color:var(--text-secondary)">Analyzing OpenAPI contract...</p></div>
            </div>`;
        return;
    }

    if (!data) { overlay.style.display = 'none'; return; }

    const severityIcon = (s) => s === 'error' ? '🔴' : s === 'recommendation' ? '💡' : 'ℹ️';
    const severityLabel = (s) => s === 'error' ? 'Error' : s === 'recommendation' ? 'Recommendation' : 'Info';

    const findingsHtml = data.findings && data.findings.length > 0
        ? `<h4 style="margin:12px 0 8px;font-size:13px;color:var(--text-secondary)">Findings</h4>
           <table class="data-table" style="font-size:12px">
            <thead><tr><th>#</th><th>Line</th><th>ID</th><th>Type</th><th>Location</th><th>Description</th><th>Rule</th></tr></thead>
            <tbody>${data.findings.map((f, i) => `
                <tr>
                    <td>${i+1}</td>
                    <td style="color:var(--text-muted);font-family:monospace">${f.line || '—'}</td>
                    <td style="font-weight:600">${f.id}</td>
                    <td>${severityIcon(f.severity)} ${severityLabel(f.severity)}</td>
                    <td style="font-size:11px;color:var(--text-secondary);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${f.location}">${f.location}</td>
                    <td>${f.description}</td>
                    <td><span style="font-size:10px;background:var(--bg-secondary);padding:2px 6px;border-radius:4px">${f.rule}</span></td>
                </tr>`).join('')}
            </tbody>
           </table>`
        : '';

    const changesHtml = data.changes && data.changes.length > 0
        ? `<h4 style="margin:16px 0 8px;font-size:13px;color:var(--text-secondary)">Changes vs master (informational)</h4>
           <table class="data-table" style="font-size:12px;opacity:0.8">
            <thead><tr><th>#</th><th>ID</th><th>Location</th><th>Description</th></tr></thead>
            <tbody>${data.changes.map((f, i) => `
                <tr>
                    <td>${i+1}</td>
                    <td style="font-weight:600">${f.id}</td>
                    <td style="font-size:11px;color:var(--text-secondary);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${f.location}">${f.location}</td>
                    <td>${f.description}</td>
                </tr>`).join('')}
            </tbody>
           </table>`
        : '';

    const errorCount = (data.findings || []).filter(f => f.severity === 'error').length;
    const recoCount = (data.findings || []).filter(f => f.severity === 'recommendation').length;
    const changesCount = (data.changes || []).length;

    const cachedBadge = data.cached ? `<span style="display:inline-block;background:var(--accent-blue);color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;margin-left:8px">CACHED</span>` : '';

    // Build commit selector
    const commits = lastReviewCommits || [];
    const commitSelector = commits.length > 0 ? `
        <div style="margin-bottom:12px">
            <label style="font-size:11px;color:var(--text-muted);margin-right:8px">Commit:</label>
            <select class="filter-select" style="font-size:11px;max-width:500px" onchange="if(this.value)reviewByCommit(this.value)">
                <option value="">HEAD (latest)</option>
                ${commits.map(c => {
                    const date = c.created_at ? c.created_at.slice(0,10) : '';
                    const selected = data.commit_sha === c.sha ? 'selected' : '';
                    return `<option value="${c.sha}" ${selected}>${c.short_sha} — ${date} — ${c.title}</option>`;
                }).join('')}
            </select>
        </div>
    ` : '';

    overlay.innerHTML = `
        <div class="candidate-form" style="width:780px;max-height:85vh;overflow-y:auto">
            <h3><i class="fas fa-search-plus" style="color:var(--accent-magenta)"></i> Contract Review${cachedBadge}</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin-bottom:12px;color:var(--text-secondary)">
                <div><strong>MR:</strong> ${data.mr_title}</div>
                <div><strong>Author:</strong> ${data.mr_author}</div>
                <div><strong>Branch:</strong> ${data.source_branch} → ${data.target_branch}</div>
                <div><strong>File:</strong> ${data.file_name || '-'}</div>
            </div>
            ${commitSelector}
            <div style="padding:10px 14px;border-radius:8px;background:var(--bg-secondary);margin-bottom:12px;font-size:13px;font-weight:500">
                ${data.summary}
            </div>
            <div style="display:flex;gap:12px;margin-bottom:8px;font-size:12px">
                ${errorCount > 0 ? `<span style="color:var(--accent-red)">🔴 Errors: ${errorCount}</span>` : ''}
                ${recoCount > 0 ? `<span style="color:var(--accent-orange)">💡 Recommendations: ${recoCount}</span>` : ''}
                ${changesCount > 0 ? `<span style="color:var(--text-muted)">ℹ️ Changes vs master: ${changesCount}</span>` : ''}
                ${errorCount === 0 && recoCount === 0 ? `<span style="color:var(--accent-green)">✅ No issues</span>` : ''}
            </div>
            ${findingsHtml}
            ${changesHtml}
            <div class="form-actions" style="margin-top:16px">
                <button class="btn-save" onclick="copyReviewToClipboard()"><i class="fas fa-copy"></i> Copy</button>
                <button class="btn-export" onclick="exportReviewToExcel()"><i class="fas fa-file-excel"></i> Excel</button>
                <button class="btn-export" onclick="forceReviewMR()" title="Re-fetch from GitLab and re-validate"><i class="fas fa-redo"></i> Re-review</button>
                <button class="btn-cancel" onclick="hideReviewModal()">Close</button>
            </div>
        </div>`;
}

function hideReviewModal() {
    const overlay = document.getElementById('reviewModalOverlay');
    if (overlay) overlay.style.display = 'none';
}

function copyReviewToClipboard() {
    if (!lastReviewData) return;
    const d = lastReviewData;
    let text = `## MR Review: ${d.mr_title}\n`;
    text += `**Author:** ${d.mr_author}\n`;
    text += `**Branch:** ${d.source_branch} → ${d.target_branch}\n`;
    text += `**File:** ${d.file_name}\n`;
    text += `**Verdict:** ${d.summary}\n\n`;

    if (d.findings && d.findings.length > 0) {
        text += `### Findings\n\n`;
        text += `| # | ID | Type | Location | Description | Rule |\n`;
        text += `|---|-----|------|----------|-------------|------|\n`;
        d.findings.forEach((f, i) => {
            const sev = f.severity === 'error' ? '🔴 Error' : '💡 Recommendation';
            text += `| ${i+1} | ${f.id} | ${sev} | ${f.location} | ${f.description} | ${f.rule} |\n`;
        });
    }

    if (d.changes && d.changes.length > 0) {
        text += `\n### Changes vs master\n\n`;
        text += `| # | ID | Location | Description |\n`;
        text += `|---|-----|----------|-------------|\n`;
        d.changes.forEach((f, i) => {
            text += `| ${i+1} | ${f.id} | ${f.location} | ${f.description} |\n`;
        });
    }

    if ((!d.findings || d.findings.length === 0) && (!d.changes || d.changes.length === 0)) {
        text += `✅ No issues found. Contract is valid.\n`;
    }

    navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelector('#reviewModalOverlay .btn-save');
        if (btn) { btn.innerHTML = '<i class="fas fa-check"></i> Copied!'; setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> Copy'; }, 2000); }
    }).catch(() => {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
    });
}

function exportReviewToExcel() {
    if (!lastReviewData || !lastReviewData.findings || !lastReviewData.findings.length) { alert('No findings to export'); return; }
    const d = lastReviewData;
    const rows = d.findings.map((f, i) => ({
        '#': i + 1,
        'ID': f.id,
        'Severity': f.severity === 'critical' ? 'Critical' : f.severity === 'warning' ? 'Warning' : 'Info',
        'Location': f.location,
        'Description': f.description,
        'Rule': f.rule
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 4 }, { wch: 6 }, { wch: 10 }, { wch: 30 }, { wch: 50 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Review');
    XLSX.writeFile(wb, `review_${d.mr_title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// === MR USERS MANAGEMENT ===
async function showMRUsersDialog() {
    const overlay = document.createElement('div');
    overlay.className = 'candidate-form-overlay';
    overlay.id = 'mrUsersOverlay';
    overlay.innerHTML = `
        <div class="candidate-form" style="width:500px;max-height:80vh;overflow-y:auto">
            <h3><i class="fas fa-users" style="color:var(--accent-magenta)"></i> MR Tracked Users</h3>
            <div id="mrUsersList" style="margin-bottom:16px"><div class="spinner"></div></div>
            <h4 style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">Add User</h4>
            <div class="form-row" style="gap:8px">
                <input type="text" id="mrNewUsername" placeholder="GitLab username (e.g. AShenessary)" class="form-input" style="flex:1">
                <button class="btn-save" onclick="validateAndAddMRUser()" id="mrAddBtn"><i class="fas fa-search"></i> Check</button>
            </div>
            <div id="mrValidateResult" style="margin-top:8px;font-size:12px"></div>
            <div class="form-actions" style="margin-top:16px">
                <button class="btn-cancel" onclick="document.getElementById('mrUsersOverlay').remove()">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    loadMRUsersList();
}

async function loadMRUsersList() {
    try {
        const resp = await fetch(`${API_BASE}/api/mr/users`);
        const users = await resp.json();
        const container = document.getElementById('mrUsersList');
        if (!users || !users.length) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:12px">No additional users tracked</p>';
            return;
        }
        container.innerHTML = users.map(u => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--bg-secondary);border-radius:8px;margin-bottom:6px">
                <div>
                    <strong style="font-size:13px">${u.name || u.username}</strong>
                    <span style="font-size:11px;color:var(--text-muted);margin-left:8px">@${u.username}</span>
                </div>
                <button class="btn-icon btn-icon-danger" onclick="removeMRUser('${u.username}')" title="Remove"><i class="fas fa-times"></i></button>
            </div>
        `).join('');
    } catch(e) {
        document.getElementById('mrUsersList').innerHTML = '<p style="color:var(--accent-red)">Error loading users</p>';
    }
}

async function validateAndAddMRUser() {
    const input = document.getElementById('mrNewUsername');
    const username = input.value.trim();
    if (!username) return;

    const btn = document.getElementById('mrAddBtn');
    const resultDiv = document.getElementById('mrValidateResult');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;
    resultDiv.innerHTML = '';

    try {
        // Step 1: Validate user exists in GitLab
        const resp = await fetch(`${API_BASE}/api/mr/users/validate?username=${encodeURIComponent(username)}`);
        const data = await resp.json();

        if (!data.exists) {
            resultDiv.innerHTML = `<span style="color:var(--accent-red)"><i class="fas fa-times-circle"></i> User "${username}" not found in GitLab</span>`;
            btn.innerHTML = '<i class="fas fa-search"></i> Check';
            btn.disabled = false;
            return;
        }

        // Step 2: Show user info and confirm add
        resultDiv.innerHTML = `
            <div style="padding:8px 12px;background:var(--bg-secondary);border-radius:8px;margin-top:8px">
                <span style="color:var(--accent-green)"><i class="fas fa-check-circle"></i> Found:</span>
                <strong>${data.name}</strong> (@${data.username})
                <button class="btn-save" style="margin-left:12px;padding:4px 12px;font-size:11px" onclick="confirmAddMRUser('${data.username}','${data.name}')"><i class="fas fa-plus"></i> Add</button>
            </div>
        `;
    } catch(e) {
        resultDiv.innerHTML = `<span style="color:var(--accent-red)">Error: ${e.message}</span>`;
    }

    btn.innerHTML = '<i class="fas fa-search"></i> Check';
    btn.disabled = false;
}

async function confirmAddMRUser(username, name) {
    try {
        const resp = await fetch(`${API_BASE}/api/mr/users`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username, name, email: username + '@Fortebank.com', gitlab_groups: [] })
        });
        if (resp.status === 409) { alert('User already exists'); return; }
        if (!resp.ok) throw new Error(await resp.text());

        document.getElementById('mrNewUsername').value = '';
        document.getElementById('mrValidateResult').innerHTML = `<span style="color:var(--accent-green)"><i class="fas fa-check"></i> ${name} added!</span>`;
        loadMRUsersList();
        // Reload MR data
        loadMergeRequests();
    } catch(e) {
        alert('Error: ' + e.message);
    }
}

async function removeMRUser(username) {
    if (!confirm(`Remove @${username} from MR tracking?`)) return;
    try {
        const resp = await fetch(`${API_BASE}/api/mr/users?username=${encodeURIComponent(username)}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error(await resp.text());
        loadMRUsersList();
        loadMergeRequests();
    } catch(e) {
        alert('Error: ' + e.message);
    }
}

// === MULTI-SELECT COMPONENT ===
function initMultiSelect(containerId, options, placeholder, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Preserve existing selections if re-initializing
    const prev = container._msSelected || new Set();

    container._msOptions = options;
    container._msSelected = prev;
    container._msOnChange = onChange;
    container._msPlaceholder = placeholder;

    renderMultiSelect(container);
}

function renderMultiSelect(container) {
    const selected = container._msSelected;
    const options = container._msOptions || [];
    const placeholder = container._msPlaceholder || 'All';
    const count = selected.size;

    const label = count === 0 ? placeholder : count === 1 ? [...selected][0] : `${[...selected][0]} +${count - 1}`;

    container.innerHTML = `
        <div class="multi-select-btn" onclick="toggleMultiSelect('${container.id}')">
            <span style="overflow:hidden;text-overflow:ellipsis">${label}</span>
            ${count > 0 ? `<span class="ms-count">${count}</span>` : ''}
            <i class="fas fa-chevron-down"></i>
        </div>
        <div class="multi-select-dropdown">
            <div class="ms-actions">
                <a onclick="msSelectAll('${container.id}')">Select all</a>
                <a onclick="msClearAll('${container.id}')">Clear</a>
            </div>
            ${options.map(opt => `
                <label>
                    <input type="checkbox" value="${opt}" ${selected.has(opt)?'checked':''} onchange="msToggle('${container.id}','${opt.replace(/'/g,"\\'")}',this.checked)">
                    <span>${opt}</span>
                </label>
            `).join('')}
        </div>
    `;
}

function toggleMultiSelect(id) {
    const container = document.getElementById(id);
    const wasOpen = container.classList.contains('open');
    // Close all other multi-selects
    document.querySelectorAll('.multi-select.open').forEach(el => el.classList.remove('open'));
    if (!wasOpen) container.classList.add('open');
}

function msToggle(id, value, checked) {
    const container = document.getElementById(id);
    if (checked) container._msSelected.add(value);
    else container._msSelected.delete(value);
    renderMultiSelect(container);
    // Re-open after render
    container.classList.add('open');
    if (container._msOnChange) container._msOnChange();
}

function msSelectAll(id) {
    const container = document.getElementById(id);
    container._msSelected = new Set(container._msOptions);
    renderMultiSelect(container);
    container.classList.add('open');
    if (container._msOnChange) container._msOnChange();
}

function msClearAll(id) {
    const container = document.getElementById(id);
    container._msSelected = new Set();
    renderMultiSelect(container);
    container.classList.add('open');
    if (container._msOnChange) container._msOnChange();
}

function getMultiSelectValues(id) {
    const container = document.getElementById(id);
    if (!container || !container._msSelected) return [];
    return [...container._msSelected];
}

// Close multi-selects when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.multi-select')) {
        document.querySelectorAll('.multi-select.open').forEach(el => el.classList.remove('open'));
    }
});

// === DASHBOARD TABS ===
function switchDashTab(tab) {
    document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.dash-tab[data-tab="${tab}"]`).classList.add('active');
    document.getElementById('dashTabOverview').classList.toggle('hidden', tab !== 'overview');
    document.getElementById('dashTabWorkload').classList.toggle('hidden', tab !== 'workload');
    if (tab === 'workload') loadWorkload();
}

// === WORKLOAD ===
let workloadData = null;

async function loadWorkload() {
    initMonthFilter('workloadMonthFilter', () => loadWorkload());
    const month = document.getElementById('workloadMonthFilter')?.value || '';
    const url = month ? `${API_BASE}/api/workload?month=${month}` : `${API_BASE}/api/workload`;
    const container = document.getElementById('workloadContent');
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Расчёт загруженности...</p></div>';
    try {
        const resp = await fetch(url, {cache:'no-store'});
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        workloadData = await resp.json();
        renderWorkload(workloadData);
    } catch(e) {
        container.innerHTML = `<p style="color:var(--accent-red)">Ошибка: ${e.message}</p>`;
    }
}

async function forceRecalcWorkload() {
    const month = document.getElementById('workloadMonthFilter')?.value || '';
    const url = month ? `${API_BASE}/api/workload?month=${month}&force=true` : `${API_BASE}/api/workload?force=true`;
    const container = document.getElementById('workloadContent');
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Пересчёт загруженности...</p></div>';
    try {
        const resp = await fetch(url, {cache:'no-store'});
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        workloadData = await resp.json();
        renderWorkload(workloadData);
    } catch(e) {
        container.innerHTML = `<p style="color:var(--accent-red)">Ошибка: ${e.message}</p>`;
    }
}

function renderWorkload(data) {
    const container = document.getElementById('workloadContent');
    const sla = data.sla_info;
    const emps = data.employees || [];

    // Compact SLA info bar
    const slaHtml = `
        <div class="workload-sla-info">
            <span class="sla-title"><i class="fas fa-calculator" style="color:var(--accent-magenta)"></i> SLA:</span>
            <div class="sla-chips">
                ${sla.services.map(s => `
                    <div class="sla-chip">
                        <span class="sla-chip-name">${s.name}</span>
                        <span class="sla-chip-hours">${s.sla_hours}ч</span>
                    </div>
                `).join('')}
                <div class="sla-chip" style="border-color:var(--accent-green)">
                    <span class="sla-chip-name">Ёмкость сотрудника/мес</span>
                    <span class="sla-chip-hours" style="color:var(--accent-green)">${sla.budget}ч <span style="font-size:10px;font-weight:400;color:var(--text-muted)">(22д)</span></span>
                </div>
            </div>
            <details style="width:100%;margin-top:4px">
                <summary class="sla-rules-toggle">Правила расчёта</summary>
                <ul class="sla-rules">${sla.rules.map(r => `<li>${r}</li>`).join('')}</ul>
            </details>
        </div>
    `;

    // Table using .data-table
    const tableHtml = `
        <div class="tasks-table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Сотрудник</th>
                        <th>Анализ</th>
                        <th>ТЗ</th>
                        <th>Поддержка</th>
                        <th>Итого</th>
                        <th style="width:22%">Загрузка</th>
                        <th>Статус</th>
                    </tr>
                </thead>
                <tbody>
                    ${emps.map(e => renderWorkloadRow(e)).join('')}
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = slaHtml + tableHtml + renderWorkloadConclusion(emps);
}

function renderWorkloadConclusion(emps) {
    const overloaded = emps.filter(e => e.verdict === 'overload');
    const high = emps.filter(e => e.verdict === 'high');
    const low = emps.filter(e => e.verdict === 'low');
    const normal = emps.filter(e => e.verdict === 'normal');
    const onboarding = emps.filter(e => e.is_onboarding);
    const vacation = emps.filter(e => e.vacation_days > 0);

    const avgPct = emps.length > 0 ? Math.round(emps.reduce((s, e) => s + e.percent, 0) / emps.length) : 0;
    const totalTasks = emps.reduce((s, e) => s + (e.tasks || []).length, 0);

    const issues = [];
    if (overloaded.length > 0) issues.push(`🔴 ${overloaded.map(e => e.name.split(' ')[0]).join(', ')} — перегрузка, рекомендуется перераспределить задачи`);
    if (high.length > 0) issues.push(`🟡 ${high.map(e => e.name.split(' ')[0]).join(', ')} — высокая загрузка, мониторить`);
    if (low.length > 0) {
        const lowNames = low.filter(e => !e.is_onboarding).map(e => e.name.split(' ')[0]);
        if (lowNames.length > 0) issues.push(`🔵 ${lowNames.join(', ')} — есть свободный ресурс`);
    }
    if (onboarding.length > 0) issues.push(`⚡ ${onboarding.map(e => e.name.split(' ')[0]).join(', ')} — онбординг, нагрузка ожидаемо ниже`);
    if (vacation.length > 0) issues.push(`🏖️ ${vacation.map(e => e.name.split(' ')[0] + ' (' + e.vacation_days + 'д)').join(', ')} — отпуск, ёмкость скорректирована`);

    const hasIssues = overloaded.length > 0 || high.length > 0;
    const bannerClass = hasIssues ? 'conclusion-banner has-issues' : 'conclusion-banner';
    const icon = hasIssues ? 'fa-exclamation-circle' : 'fa-check-circle';
    const title = hasIssues ? 'Заключение по загруженности' : 'Заключение';

    let summaryText = '';
    if (!hasIssues && low.length === 0) {
        summaryText = `<div class="conclusion-item"><span class="issue-text" style="color:var(--accent-green)">Команда загружена равномерно. Средняя загрузка: ${avgPct}%, всего задач: ${totalTasks}.</span></div>`;
    } else {
        summaryText = `<div class="conclusion-item" style="margin-bottom:8px"><span class="issue-text">Средняя загрузка команды: <strong>${avgPct}%</strong> | Учтённых задач: <strong>${totalTasks}</strong> | Сотрудников: ${emps.length}</span></div>` +
            issues.map(i => `<div class="conclusion-item"><span class="issue-text">${i}</span></div>`).join('');
    }

    return `
        <div class="${bannerClass}" style="margin-top:20px">
            <div class="conclusion-title"><i class="fas ${icon}"></i> ${title}</div>
            <div class="conclusion-items">${summaryText}</div>
        </div>
    `;
}

function renderWorkloadRow(e) {
    const pctCapped = Math.min(e.percent, 100);
    const flags = [];
    if (e.is_onboarding) flags.push('<span title="Новый сотрудник (онбординг)">⚡</span>');
    if (e.vacation_days > 0) flags.push(`<span title="Отпуск ${e.vacation_days} дн.">🏖️</span>`);

    return `
        <tr style="cursor:pointer" onclick="showWorkloadDetail('${e.name}')">
            <td>
                <div style="display:flex;align-items:center;gap:6px">
                    <strong style="font-size:13px">${e.name}</strong> ${flags.join('')}
                </div>
                ${e.vacation_days > 0 ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">Ёмкость: ${e.budget}ч (отпуск ${e.vacation_days}д)</div>` : ''}
            </td>
            <td>${e.analysis_count > 0 ? `<span style="font-weight:600">${e.analysis_count}</span> <span style="color:var(--text-muted);font-size:11px">${e.analysis_hours}ч</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
            <td>${e.tz_count > 0 ? `<span style="font-weight:600">${e.tz_count}</span> <span style="color:var(--text-muted);font-size:11px">${e.tz_hours}ч</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
            <td>${e.support_count > 0 ? `<span style="font-weight:600">${e.support_count}</span> <span style="color:var(--text-muted);font-size:11px">${e.support_hours}ч</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
            <td><strong>${e.total_hours}ч</strong><span style="color:var(--text-muted);font-size:11px"> / ${e.budget}ч</span></td>
            <td>
                <div style="display:flex;align-items:center;gap:8px">
                    <div class="workload-progress" style="flex:1"><div class="workload-progress-bar ${e.verdict}" style="width:${pctCapped}%"></div></div>
                    <span style="font-size:12px;font-weight:600;min-width:36px;text-align:right">${e.percent}%</span>
                </div>
            </td>
            <td><span class="workload-badge ${e.verdict}">${e.verdict_label}</span></td>
        </tr>
    `;
}

function showWorkloadDetail(name) {
    if (!workloadData) return;
    const emp = workloadData.employees.find(e => e.name === name);
    if (!emp) return;

    const serviceLabel = (s) => s === 'analysis' ? 'Анализ' : s === 'tz' ? 'ТЗ' : 'Поддержка';
    const serviceClass = (s) => s === 'analysis' ? 'analysis' : s === 'tz' ? 'tz' : 'support';
    const statusColor = (status) => getStatusColorClass((status||'').toLowerCase());

    const tasks = emp.tasks || [];
    const flags = [];
    if (emp.is_onboarding) flags.push('⚡ Новый сотрудник (онбординг)');
    if (emp.vacation_days > 0) flags.push(`🏖️ Отпуск ${emp.vacation_days} дней`);

    const overlay = document.createElement('div');
    overlay.className = 'candidate-form-overlay';
    overlay.id = 'workloadDetailOverlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
        <div class="candidate-form" style="width:900px;max-height:85vh;overflow-y:auto">
            <h3><i class="fas fa-user-clock" style="color:var(--accent-magenta)"></i> ${emp.name}</h3>
            ${flags.length ? `<div style="margin-bottom:12px;font-size:12px">${flags.join(' &nbsp;|&nbsp; ')}</div>` : ''}
            <div style="display:flex;gap:16px;margin-bottom:16px">
                <div style="flex:1;background:var(--bg-secondary);border-radius:8px;padding:12px;text-align:center">
                    <div style="font-size:22px;font-weight:700;color:var(--accent-magenta)">${emp.percent}%</div>
                    <div style="font-size:11px;color:var(--text-muted)">Загрузка</div>
                </div>
                <div style="flex:1;background:var(--bg-secondary);border-radius:8px;padding:12px;text-align:center">
                    <div style="font-size:22px;font-weight:700">${emp.total_hours}<span style="font-size:13px;color:var(--text-muted)">/ ${emp.budget}ч</span></div>
                    <div style="font-size:11px;color:var(--text-muted)">Часы</div>
                </div>
                <div style="flex:1;background:var(--bg-secondary);border-radius:8px;padding:12px;text-align:center">
                    <div style="font-size:22px;font-weight:700">${tasks.length}</div>
                    <div style="font-size:11px;color:var(--text-muted)">Задач учтено</div>
                </div>
            </div>
            <div style="margin-bottom:12px"><span class="workload-badge ${emp.verdict}" style="font-size:12px;padding:4px 12px">${emp.verdict_label}</span></div>
            ${tasks.length > 0 ? `
            <table class="data-table" style="font-size:12px">
                <thead>
                    <tr>
                        <th>Ключ</th>
                        <th>Услуга</th>
                        <th>Статус</th>
                        <th>SLA</th>
                        <th>Задача</th>
                        <th>Примечание</th>
                    </tr>
                </thead>
                <tbody>
                    ${tasks.map(t => `
                        <tr>
                            <td><a href="${t.url}" target="_blank" class="task-key">${t.key}</a></td>
                            <td><span class="service-tag ${serviceClass(t.service)}">${serviceLabel(t.service)}</span></td>
                            <td><span class="task-status-badge ${statusColor(t.status)}" style="white-space:nowrap">${t.status}</span></td>
                            <td style="font-weight:600">${t.sla}ч</td>
                            <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.summary}</td>
                            <td style="font-size:10px;color:var(--text-muted)">${t.note || '—'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>` : '<p style="color:var(--text-muted);font-size:12px">Нет учтённых задач</p>'}
            <div style="margin-top:12px;font-size:11px;color:var(--text-muted)">Не учтено: ${emp.skipped_count} задач (другие типы / backlog / blocked без комментариев)</div>
            <div class="form-actions" style="margin-top:16px">
                <button class="btn-cancel" onclick="document.getElementById('workloadDetailOverlay').remove()">Закрыть</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}
