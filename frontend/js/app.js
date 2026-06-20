const API_BASE = window.location.origin;
const POLL_INTERVAL = 30000;
let dashboardData = null;
let tasksData = null;
let mrData = null;
let confData = null;
let currentPage = 'dashboard';
let selectedMonth = '';

// Generate month options from Jan 2026 to now
function getMonthOptions() {
    const months = [];
    const now = new Date();
    let d = new Date(2026, 0, 1);
    while (d <= now) {
        const val = d.toISOString().slice(0, 7);
        const label = d.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' });
        months.push({ val, label });
        d.setMonth(d.getMonth() + 1);
    }
    return months.reverse();
}

document.addEventListener('DOMContentLoaded', () => {
    fetchDashboard();
    setInterval(fetchDashboard, POLL_INTERVAL);
});

function navigateTo(page) {
    currentPage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById(`page-${page}`).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`[data-page="${page}"]`).classList.add('active');
    if (page === 'tasks') loadTasks();
    if (page === 'merge-requests') loadMergeRequests();
    if (page === 'confluence') loadConfluence();
}

// === DASHBOARD ===
async function fetchDashboard() {
    try {
        const resp = await fetch(`${API_BASE}/api/dashboard`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        dashboardData = await resp.json();
        renderDashboard(dashboardData);
        updateConnectionStatus(true);
    } catch (err) {
        console.error('Fetch error:', err);
        updateConnectionStatus(false);
    }
}

function renderDashboard(data) {
    document.getElementById('totalActive').textContent = data.summary.total_active_tasks;
    document.getElementById('totalCompletedToday').textContent = data.summary.total_completed_today;
    document.getElementById('totalCompletedMonth').textContent = data.summary.total_completed_month;
    document.getElementById('totalMRs').textContent = data.summary.total_mrs_month;
    document.getElementById('totalPages').textContent = data.summary.total_pages_month;
    document.getElementById('totalAlerts').textContent = data.summary.total_alerts;
    const navTB = document.getElementById('navTasksBadge');
    if (navTB) navTB.textContent = data.summary.total_active_tasks || '';
    const navMR = document.getElementById('navMRBadge');
    if (navMR) navMR.textContent = data.summary.total_mrs_month || '';
    const alertCard = document.getElementById('alertsSummaryCard');
    alertCard.style.borderColor = data.summary.critical_alerts > 0 ? 'var(--accent-red)' : '';
    renderAlerts(data.alerts);
    renderEmployees(data.employees);
    renderChart(data.employees);
    const dt = new Date(data.last_updated);
    document.getElementById('lastUpdated').textContent = dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function renderChart(employees) {
    const container = document.getElementById('chartSection');
    if (!container) return;
    const maxTasks = Math.max(...employees.map(e => e.tasks.active_tasks + e.tasks.completed_month), 1);
    container.innerHTML = `
        <h2 class="section-title">Обзор по сотрудникам</h2>
        <div class="chart-grid">
            ${employees.map(emp => {
                const total = emp.tasks.active_tasks + emp.tasks.completed_month;
                const pct = Math.round((total / maxTasks) * 100);
                return `
                <div class="chart-row">
                    <span class="chart-name">${emp.employee.name.split(' ')[0]}</span>
                    <div class="chart-bars">
                        <div class="chart-bar-track">
                            <div class="chart-bar active" style="width:${(emp.tasks.active_tasks/maxTasks*100).toFixed(0)}%" title="Активные: ${emp.tasks.active_tasks}"></div>
                        </div>
                        <div class="chart-bar-track">
                            <div class="chart-bar completed" style="width:${(emp.tasks.completed_month/maxTasks*100).toFixed(0)}%" title="Завершены: ${emp.tasks.completed_month}"></div>
                        </div>
                        <div class="chart-bar-track">
                            <div class="chart-bar mrs" style="width:${(emp.gitlab.mrs_created_month/Math.max(maxTasks/3,1)*100).toFixed(0)}%" title="MR: ${emp.gitlab.mrs_created_month}"></div>
                        </div>
                    </div>
                    <span class="chart-total">${total}</span>
                </div>`;
            }).join('')}
        </div>
        <div class="chart-legend">
            <span><span class="legend-dot active"></span> Активные</span>
            <span><span class="legend-dot completed"></span> Завершены</span>
            <span><span class="legend-dot mrs"></span> MR</span>
        </div>
    `;
}

function renderAlerts(alerts) {
    const section = document.getElementById('alertsSection');
    const list = document.getElementById('alertsList');
    if (!alerts || alerts.length === 0) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    list.innerHTML = alerts.map(a => `
        <div class="alert-item ${a.severity}">
            <span class="alert-badge ${a.severity}">${a.severity === 'critical' ? 'КРИТ' : 'ВНИМ'}</span>
            <span class="alert-employee">${a.employee}</span>
            <span class="alert-message">${a.message}</span>
            ${a.task_url ? `<a href="${a.task_url}" target="_blank" class="alert-link"><i class="fas fa-external-link-alt"></i></a>` : ''}
        </div>`).join('');
}

function renderEmployees(employees) {
    const grid = document.getElementById('employeesGrid');
    if (!employees || employees.length === 0) { grid.innerHTML = '<div class="loading-state"><p>Нет данных</p></div>'; return; }
    grid.innerHTML = employees.map(emp => createEmployeeCard(emp)).join('');
}

function createEmployeeCard(emp) {
    const initials = getInitials(emp.employee.name);
    const hasAlerts = emp.alerts && emp.alerts.length > 0;
    const confScore = emp.confluence.quality_score || 0;
    return `
        <div class="employee-card ${hasAlerts ? 'has-alerts' : ''}">
            <div class="employee-header">
                <div class="employee-info">
                    <div class="employee-avatar">${initials}</div>
                    <div><div class="employee-name">${emp.employee.name}</div><div class="employee-role">${emp.employee.role}</div></div>
                </div>
                ${hasAlerts ? `<span class="employee-alerts-badge"><i class="fas fa-exclamation-triangle"></i> ${emp.alerts.length}</span>` : ''}
            </div>
            <div class="metrics-grid">
                <div class="metric-item"><div class="metric-value">${emp.tasks.active_tasks}</div><div class="metric-label">Активные</div></div>
                <div class="metric-item"><div class="metric-value">${emp.tasks.completed_today}</div><div class="metric-label">Сегодня</div></div>
                <div class="metric-item"><div class="metric-value">${emp.tasks.completed_month}</div><div class="metric-label">За месяц</div></div>
                <div class="metric-item"><div class="metric-value">${emp.gitlab.mrs_created_month}</div><div class="metric-label">MR</div></div>
                <div class="metric-item"><div class="metric-value">${emp.confluence.pages_created_month+emp.confluence.pages_updated_month}</div><div class="metric-label">Confluence</div></div>
                <div class="metric-item"><div class="metric-value" style="color:${emp.tasks.stale_tasks>0?'var(--accent-red)':'var(--accent-green)'}">${emp.tasks.stale_tasks}</div><div class="metric-label">Зависшие</div></div>
            </div>
            <div class="progress-section">
                <div class="progress-row"><span class="progress-label">Исполнение</span><div class="progress-bar"><div class="progress-fill green" style="width:${getCompletionRate(emp)}%"></div></div><span class="progress-value">${getCompletionRate(emp)}%</span></div>
                <div class="progress-row"><span class="progress-label">Документация</span><div class="progress-bar"><div class="progress-fill purple" style="width:${confScore}%"></div></div><span class="progress-value">${confScore}%</span></div>
                <div class="progress-row"><span class="progress-label">Cycle Time</span><div class="progress-bar"><div class="progress-fill ${getCycleTimeColor(emp.tasks.avg_cycle_time_days)}" style="width:${getCycleTimePercent(emp.tasks.avg_cycle_time_days)}%"></div></div><span class="progress-value">${emp.tasks.avg_cycle_time_days>0?emp.tasks.avg_cycle_time_days.toFixed(1)+'д':'-'}</span></div>
            </div>
            ${renderStatusTags(emp.tasks.by_status)}
        </div>`;
}

// === TASKS PAGE ===
async function loadTasks() {
    const monthParam = document.getElementById('tasksMonthFilter')?.value || '';
    const url = monthParam ? `${API_BASE}/api/tasks?month=${monthParam}` : `${API_BASE}/api/tasks`;
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        tasksData = await resp.json();
        renderTasksPage(tasksData);
    } catch (err) { console.error('Tasks error:', err); }
}

function renderTasksPage(data) {
    // Month filter
    initMonthFilter('tasksMonthFilter', () => loadTasks());
    // Employee filter
    const empFilter = document.getElementById('tasksFilterEmployee');
    const statusFilter = document.getElementById('tasksFilterStatus');
    const typeFilter = document.getElementById('tasksFilterType');
    const employees = new Set(), statuses = new Set(), types = new Set();
    let allIssues = [];
    data.forEach(item => {
        employees.add(item.employee);
        (item.issues||[]).forEach(issue => { statuses.add(issue.status); types.add(issue.type); allIssues.push({...issue, employee: item.employee}); });
    });
    empFilter.innerHTML = '<option value="all">Все сотрудники</option>'+[...employees].map(e=>`<option value="${e}">${e}</option>`).join('');
    statusFilter.innerHTML = '<option value="all">Все статусы</option>'+[...statuses].map(s=>`<option value="${s}">${s}</option>`).join('');
    typeFilter.innerHTML = '<option value="all">Все типы</option>'+[...types].map(t=>`<option value="${t}">${t}</option>`).join('');
    // Conclusion
    renderTasksConclusion(data);
    renderTasksTable(allIssues);
}

function filterTasks() {
    if (!tasksData) return;
    const empVal = document.getElementById('tasksFilterEmployee').value;
    const statusVal = document.getElementById('tasksFilterStatus').value;
    const typeVal = document.getElementById('tasksFilterType').value;
    let allIssues = [];
    tasksData.forEach(item => { (item.issues||[]).forEach(issue => { allIssues.push({...issue, employee: item.employee}); }); });
    if (empVal !== 'all') allIssues = allIssues.filter(i => i.employee === empVal);
    if (statusVal !== 'all') allIssues = allIssues.filter(i => i.status === statusVal);
    if (typeVal !== 'all') allIssues = allIssues.filter(i => i.type === typeVal);
    renderTasksTable(allIssues);
}

function renderTasksConclusion(data) {
    const el = document.getElementById('tasksConclusion');
    if (!el) return;
    const conclusions = data.filter(d => d.conclusion && !d.conclusion.startsWith('Задачи обрабатываются'));
    if (conclusions.length === 0) {
        el.style.display = 'block'; el.className = 'conclusion-banner';
        el.innerHTML = `<div class="conclusion-title"><i class="fas fa-check-circle"></i> Заключение</div><div class="conclusion-items"><div class="conclusion-item"><span class="issue-text" style="color:var(--accent-green)">Задачи обрабатываются в нормальном режиме. Замечаний нет.</span></div></div>`;
        return;
    }
    el.style.display = 'block'; el.className = 'conclusion-banner has-issues';
    el.innerHTML = `<div class="conclusion-title"><i class="fas fa-exclamation-circle"></i> Заключение и рекомендации</div><div class="conclusion-items">${data.map(d => {
        if (d.conclusion && !d.conclusion.startsWith('Задачи обрабатываются')) return `<div class="conclusion-item"><span class="emp-name">${d.employee}</span><span class="issue-text">${d.conclusion.replace('Рекомендации: ','')}</span></div>`;
        return '';
    }).filter(Boolean).join('')}</div>`;
}

function renderTasksTable(issues) {
    const tbody = document.getElementById('tasksTableBody');
    if (!issues||issues.length===0) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-secondary)">Нет задач</td></tr>'; return; }
    tbody.innerHTML = issues.map(issue => {
        const days = getDaysInStatus(issue.updated||issue.status_since);
        const dayClass = days>=10?'critical':days>=5?'warning':'ok';
        const statusClass = days>=5?'stale':'in-progress';
        const comments = getTaskComments(issue, days);
        return `<tr><td><a href="${issue.url}" target="_blank" class="task-key">${issue.key}</a></td><td style="font-size:12px">${issue.employee}</td><td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${issue.summary}</td><td style="font-size:12px;color:var(--text-secondary)">${issue.type}</td><td><span class="task-status-badge ${statusClass}">${issue.status}</span></td><td><span class="days-badge ${dayClass}">${days}д</span></td><td>${comments}</td></tr>`;
    }).join('');
}

function getTaskComments(issue, days) {
    const w = [];
    if (days >= 5) w.push(`Зависла ${days}д`);
    if (!issue.summary || issue.summary.trim()==='') w.push('Нет описания');
    if (w.length===0) return '';
    return `<span class="task-comment"><i class="fas fa-exclamation-circle"></i> ${w.join('; ')}</span>`;
}

// === MERGE REQUESTS PAGE ===
async function loadMergeRequests() {
    const monthParam = document.getElementById('mrMonthFilter')?.value || '';
    const url = monthParam ? `${API_BASE}/api/merge-requests?month=${monthParam}` : `${API_BASE}/api/merge-requests`;
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        mrData = await resp.json();
        renderMRPage(mrData);
    } catch (err) { console.error('MR error:', err); }
}

function renderMRPage(data) {
    initMonthFilter('mrMonthFilter', () => loadMergeRequests());
    const empFilter = document.getElementById('mrFilterEmployee');
    empFilter.innerHTML = '<option value="all">Все сотрудники</option>'+data.map(d=>`<option value="${d.employee}">${d.employee}</option>`).join('');
    renderMRConclusion(data);
    let allMRs = [];
    data.forEach(item => { (item.mrs||[]).forEach(mr => { allMRs.push({...mr, employee: item.employee}); }); });
    renderMRTable(allMRs);
}

function filterMRs() {
    if (!mrData) return;
    const empVal = document.getElementById('mrFilterEmployee').value;
    const stateVal = document.getElementById('mrFilterState').value;
    const pipelineVal = document.getElementById('mrFilterPipeline').value;
    let allMRs = [];
    mrData.forEach(item => { (item.mrs||[]).forEach(mr => { allMRs.push({...mr, employee: item.employee}); }); });
    if (empVal!=='all') allMRs = allMRs.filter(m=>m.employee===empVal);
    if (stateVal!=='all') allMRs = allMRs.filter(m=>m.state===stateVal);
    if (pipelineVal!=='all') allMRs = allMRs.filter(m=>m.pipeline_status===pipelineVal);
    renderMRTable(allMRs);
}

function renderMRTable(mrs) {
    const tbody = document.getElementById('mrTableBody');
    if (!mrs||mrs.length===0) { tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-secondary)">Нет MR</td></tr>'; return; }
    tbody.innerHTML = mrs.map(mr => {
        const stateLabel = mr.state==='opened'?'Открыт':mr.state==='merged'?'Merged':'Закрыт';
        const pipelineLabel = getPipelineLabel(mr.pipeline_status);
        const pipelineIcon = getPipelineIcon(mr.pipeline_status);
        const pipelineClass = mr.pipeline_status||'pending';
        const daysClass = mr.days_open>7?'critical':mr.days_open>3?'warning':'ok';
        const reviewersHtml = mr.reviewers&&mr.reviewers.length>0 ? `<div class="reviewers-list">${mr.reviewers.map(r=>`<span class="reviewer-tag">${r}</span>`).join('')}</div>` : '<span class="no-reviewer">Нет ревьюера</span>';
        return `<tr><td><a href="${mr.url}" target="_blank" class="task-key">!${mr.iid||mr.id}</a></td><td style="font-size:12px">${mr.employee}</td><td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${mr.title}</td><td style="font-size:11px;color:var(--text-secondary)">${mr.project||mr.source_branch}</td><td><span class="mr-state-badge ${mr.state}">${stateLabel}</span></td><td><span class="pipeline-badge ${pipelineClass}"><i class="fas ${pipelineIcon}"></i> ${pipelineLabel}</span></td><td><span class="days-badge ${daysClass}">${mr.days_open}д</span></td><td>${reviewersHtml}</td></tr>`;
    }).join('');
}

function renderMRConclusion(data) {
    const el = document.getElementById('mrConclusion');
    const conclusions = data.filter(d=>d.conclusion&&!d.conclusion.startsWith('Всё в порядке'));
    if (conclusions.length===0) { el.style.display='block'; el.className='conclusion-banner'; el.innerHTML=`<div class="conclusion-title"><i class="fas fa-check-circle"></i> Заключение</div><div class="conclusion-items"><div class="conclusion-item"><span class="issue-text" style="color:var(--accent-green)">Всё в порядке. MR обрабатываются нормально.</span></div></div>`; return; }
    el.style.display='block'; el.className='conclusion-banner has-issues';
    el.innerHTML=`<div class="conclusion-title"><i class="fas fa-exclamation-circle"></i> Заключение — на что обратить внимание</div><div class="conclusion-items">${data.map(d=>{if(d.conclusion&&!d.conclusion.startsWith('Всё в порядке'))return`<div class="conclusion-item"><span class="emp-name">${d.employee}</span><span class="issue-text">${d.conclusion.replace('Обратить внимание: ','')}</span></div>`;return'';}).filter(Boolean).join('')}</div>`;
}

function getPipelineLabel(s){switch(s){case'success':return'Успешно';case'failed':return'Ошибка';case'running':return'Запущен';case'pending':return'Ожидает';default:return s||'Н/Д';}}
function getPipelineIcon(s){switch(s){case'success':return'fa-check-circle';case'failed':return'fa-times-circle';case'running':return'fa-spinner fa-spin';case'pending':return'fa-clock';default:return'fa-question-circle';}}

// === CONFLUENCE PAGE ===
async function loadConfluence() {
    const monthParam = document.getElementById('confMonthFilter')?.value || '';
    const url = monthParam ? `${API_BASE}/api/confluence?month=${monthParam}` : `${API_BASE}/api/confluence`;
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        confData = await resp.json();
        renderConfluencePage(confData);
    } catch (err) { console.error('Confluence error:', err); }
}

function renderConfluencePage(data) {
    initMonthFilter('confMonthFilter', () => loadConfluence());
    const empFilter = document.getElementById('confFilterEmployee');
    const spaceFilter = document.getElementById('confFilterSpace');
    empFilter.innerHTML = '<option value="all">Все сотрудники</option>'+data.map(d=>`<option value="${d.employee}">${d.employee}</option>`).join('');
    const spaces = new Set();
    data.forEach(item=>{(item.pages||[]).forEach(p=>{if(p.space)spaces.add(p.space+'|'+(p.space_name||p.space));});});
    spaceFilter.innerHTML = '<option value="all">Все пространства</option>'+[...spaces].map(s=>{const[k,n]=s.split('|');return`<option value="${k}">${k} — ${n}</option>`;}).join('');
    renderConfConclusion(data);
    let allPages = [];
    data.forEach(item=>{(item.pages||[]).forEach(page=>{allPages.push({...page, employee: item.employee});});});
    renderConfTable(allPages);
}

function filterConfluence() {
    if (!confData) return;
    const empVal = document.getElementById('confFilterEmployee').value;
    const spaceVal = document.getElementById('confFilterSpace').value;
    let allPages = [];
    confData.forEach(item=>{(item.pages||[]).forEach(page=>{allPages.push({...page,employee:item.employee});});});
    if (empVal!=='all') allPages = allPages.filter(p=>p.employee===empVal);
    if (spaceVal!=='all') allPages = allPages.filter(p=>p.space===spaceVal);
    renderConfTable(allPages);
}

function renderConfTable(pages) {
    const tbody = document.getElementById('confTableBody');
    if (!pages||pages.length===0){tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-secondary)">Нет данных</td></tr>';return;}
    pages.sort((a,b)=>new Date(b.last_updated)-new Date(a.last_updated));
    tbody.innerHTML = pages.map(page=>{
        const updDate = page.last_updated ? new Date(page.last_updated).toLocaleDateString('ru-RU') : '-';
        const bodyKb = page.body_length ? (page.body_length/1024).toFixed(1)+' KB' : '-';
        const quality = getPageQuality(page);
        return `<tr><td><a href="${page.url}" target="_blank" class="task-key" style="max-width:220px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${page.title}</a></td><td style="font-size:12px">${page.employee}</td><td><span style="font-size:11px;background:var(--bg-secondary);padding:2px 6px;border-radius:4px">${page.space}</span> <span style="font-size:11px;color:var(--text-muted)">${page.space_name||''}</span></td><td style="text-align:center">v${page.version||1}</td><td>${updDate} <span style="font-size:10px;color:${page.days_since_update>30?'var(--accent-red)':'var(--text-muted)'}"> (${page.days_since_update}д)</span></td><td>${bodyKb}</td><td>${quality}</td></tr>`;
    }).join('');
}

function getPageQuality(page) {
    let score='good',label='Хорошо';
    if (page.body_length<200){score='poor';label='Пустая';}
    else if(page.body_length<500){score='medium';label='Мало контента';}
    else if(page.days_since_update>30){score='medium';label='Устарела';}
    return `<span class="quality-indicator"><span class="quality-dot ${score}"></span> ${label}</span>`;
}

function renderConfConclusion(data) {
    const el = document.getElementById('confConclusion');
    if (!el) return;
    const conclusions = data.filter(d=>d.conclusion&&!d.conclusion.startsWith('Документация ведётся'));
    if (conclusions.length===0){el.style.display='block';el.className='conclusion-banner';el.innerHTML=`<div class="conclusion-title"><i class="fas fa-check-circle"></i> Заключение</div><div class="conclusion-items"><div class="conclusion-item"><span class="issue-text" style="color:var(--accent-green)">Документация ведётся активно. Замечаний нет.</span></div></div><div class="quality-legend"><p style="font-size:12px;color:var(--text-secondary);margin-top:12px"><b>Как определяется качество:</b> Хорошо (>500 символов, обновлена <30д) | Мало контента (<500 символов) | Пустая (<200 символов) | Устарела (>30 дней без обновлений)</p></div>`;return;}
    el.style.display='block';el.className='conclusion-banner has-issues';
    el.innerHTML=`<div class="conclusion-title"><i class="fas fa-exclamation-circle"></i> Заключение — на что обратить внимание</div><div class="conclusion-items">${data.map(d=>{if(d.conclusion&&!d.conclusion.startsWith('Документация ведётся'))return`<div class="conclusion-item"><span class="emp-name">${d.employee}</span><span class="issue-text">${d.conclusion.replace('Обратить внимание: ','')}</span></div>`;return'';}).filter(Boolean).join('')}</div><div class="quality-legend"><p style="font-size:12px;color:var(--text-secondary);margin-top:12px"><b>Критерии качества:</b> Хорошо — содержимое >500 символов и обновлено за последние 30 дней | Мало контента — <500 символов | Пустая — <200 символов | Устарела — не обновлялась >30 дней</p></div>`;
}

// === HELPERS ===
function initMonthFilter(id, onChange) {
    const el = document.getElementById(id);
    if (!el || el.dataset.initialized) return;
    el.dataset.initialized = 'true';
    const months = getMonthOptions();
    el.innerHTML = '<option value="">Текущий месяц</option>'+months.map(m=>`<option value="${m.val}">${m.label}</option>`).join('');
    el.addEventListener('change', onChange);
}

function getInitials(name){const p=name.split(' ');if(p.length>=2)return(p[0][0]+p[1][0]).toUpperCase();return name.substring(0,2).toUpperCase();}
function getCompletionRate(emp){const t=emp.tasks.total_tasks;if(t===0)return 0;return Math.min(100,Math.round((emp.tasks.completed_month/t)*100));}
function getCycleTimeColor(d){if(d<=3)return'green';if(d<=7)return'orange';return'red';}
function getCycleTimePercent(d){if(d===0)return 0;return Math.min(100,Math.round(d*10));}
function getDaysInStatus(dateStr){if(!dateStr)return 0;return Math.floor((new Date()-new Date(dateStr))/(1000*60*60*24));}
function renderStatusTags(byStatus){if(!byStatus||Object.keys(byStatus).length===0)return'';const tags=Object.entries(byStatus).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([s,c])=>`<span class="status-tag">${s}<span class="count">${c}</span></span>`).join('');return`<div class="status-tags">${tags}</div>`;}
function updateConnectionStatus(c){const el=document.getElementById('connectionStatus');if(c){el.innerHTML='<span class="status-dot"></span><span>Live</span>';el.style.color='var(--accent-green)';}else{el.innerHTML='<span class="status-dot" style="background:var(--accent-red)"></span><span>Offline</span>';el.style.color='var(--accent-red)';}}
function toggleAlerts(){const l=document.getElementById('alertsList');const i=document.getElementById('alertsToggleIcon');if(l.style.display==='none'){l.style.display='flex';i.className='fas fa-chevron-down';}else{l.style.display='none';i.className='fas fa-chevron-right';}}
