const API_BASE = window.location.origin;
const POLL_INTERVAL = 30000; // 30 sec frontend refresh

let dashboardData = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    fetchDashboard();
    setInterval(fetchDashboard, POLL_INTERVAL);
});

async function fetchDashboard() {
    try {
        const resp = await fetch(`${API_BASE}/api/dashboard`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        
        dashboardData = await resp.json();
        renderDashboard(dashboardData);
        updateConnectionStatus(true);
    } catch (err) {
        console.error('Failed to fetch dashboard:', err);
        updateConnectionStatus(false);
    }
}

function renderDashboard(data) {
    // Summary
    document.getElementById('totalActive').textContent = data.summary.total_active_tasks;
    document.getElementById('totalCompletedToday').textContent = data.summary.total_completed_today;
    document.getElementById('totalCompletedMonth').textContent = data.summary.total_completed_month;
    document.getElementById('totalMRs').textContent = data.summary.total_mrs_month;
    document.getElementById('totalPages').textContent = data.summary.total_pages_month;
    document.getElementById('totalAlerts').textContent = data.summary.total_alerts;

    // Highlight alerts if critical
    const alertCard = document.getElementById('alertsSummaryCard');
    if (data.summary.critical_alerts > 0) {
        alertCard.style.borderColor = 'var(--accent-red)';
    } else {
        alertCard.style.borderColor = '';
    }

    // Alerts
    renderAlerts(data.alerts);

    // Employees
    renderEmployees(data.employees);

    // Last updated
    const dt = new Date(data.last_updated);
    document.getElementById('lastUpdated').textContent = dt.toLocaleTimeString('ru-RU', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

function renderAlerts(alerts) {
    const section = document.getElementById('alertsSection');
    const list = document.getElementById('alertsList');

    if (!alerts || alerts.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    list.innerHTML = alerts.map(alert => `
        <div class="alert-item ${alert.severity}">
            <span class="alert-badge ${alert.severity}">${alert.severity === 'critical' ? 'КРИТИЧНЫЙ' : 'ВНИМАНИЕ'}</span>
            <span class="alert-employee">${alert.employee}</span>
            <span class="alert-message">${alert.message}</span>
            ${alert.task_url ? `<a href="${alert.task_url}" target="_blank" class="alert-link"><i class="fas fa-external-link-alt"></i></a>` : ''}
        </div>
    `).join('');
}

function renderEmployees(employees) {
    const grid = document.getElementById('employeesGrid');
    
    if (!employees || employees.length === 0) {
        grid.innerHTML = '<div class="loading-state"><p>Нет данных о сотрудниках</p></div>';
        return;
    }

    grid.innerHTML = employees.map(emp => createEmployeeCard(emp)).join('');
}

function createEmployeeCard(emp) {
    const initials = getInitials(emp.employee.name);
    const hasAlerts = emp.alerts && emp.alerts.length > 0;
    const alertsCount = emp.alerts ? emp.alerts.length : 0;

    // Quality score for Confluence
    const confScore = emp.confluence.quality_score || 0;

    return `
        <div class="employee-card ${hasAlerts ? 'has-alerts' : ''}">
            <div class="employee-header">
                <div class="employee-info">
                    <div class="employee-avatar">${initials}</div>
                    <div>
                        <div class="employee-name">${emp.employee.name}</div>
                        <div class="employee-role">${emp.employee.role}</div>
                    </div>
                </div>
                ${hasAlerts ? `<span class="employee-alerts-badge"><i class="fas fa-exclamation-triangle"></i> ${alertsCount}</span>` : ''}
            </div>

            <div class="metrics-grid">
                <div class="metric-item">
                    <div class="metric-value">${emp.tasks.active_tasks}</div>
                    <div class="metric-label">Активные</div>
                </div>
                <div class="metric-item">
                    <div class="metric-value">${emp.tasks.completed_today}</div>
                    <div class="metric-label">Сегодня</div>
                </div>
                <div class="metric-item">
                    <div class="metric-value">${emp.tasks.completed_month}</div>
                    <div class="metric-label">За месяц</div>
                </div>
                <div class="metric-item">
                    <div class="metric-value">${emp.gitlab.mrs_created_month}</div>
                    <div class="metric-label">MR</div>
                </div>
                <div class="metric-item">
                    <div class="metric-value">${emp.confluence.pages_created_month + emp.confluence.pages_updated_month}</div>
                    <div class="metric-label">Confluence</div>
                </div>
                <div class="metric-item">
                    <div class="metric-value" style="color: ${emp.tasks.stale_tasks > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}">${emp.tasks.stale_tasks}</div>
                    <div class="metric-label">Зависшие</div>
                </div>
            </div>

            <div class="progress-section">
                <div class="progress-row">
                    <span class="progress-label">Исполнение</span>
                    <div class="progress-bar">
                        <div class="progress-fill green" style="width: ${getCompletionRate(emp)}%"></div>
                    </div>
                    <span class="progress-value">${getCompletionRate(emp)}%</span>
                </div>
                <div class="progress-row">
                    <span class="progress-label">Документация</span>
                    <div class="progress-bar">
                        <div class="progress-fill purple" style="width: ${confScore}%"></div>
                    </div>
                    <span class="progress-value">${confScore}%</span>
                </div>
                <div class="progress-row">
                    <span class="progress-label">Cycle Time</span>
                    <div class="progress-bar">
                        <div class="progress-fill ${getCycleTimeColor(emp.tasks.avg_cycle_time_days)}" style="width: ${getCycleTimePercent(emp.tasks.avg_cycle_time_days)}%"></div>
                    </div>
                    <span class="progress-value">${emp.tasks.avg_cycle_time_days > 0 ? emp.tasks.avg_cycle_time_days.toFixed(1) + 'д' : '-'}</span>
                </div>
            </div>

            ${renderStatusTags(emp.tasks.by_status)}
        </div>
    `;
}

function renderStatusTags(byStatus) {
    if (!byStatus || Object.keys(byStatus).length === 0) return '';
    
    const tags = Object.entries(byStatus)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([status, count]) => `<span class="status-tag">${status}<span class="count">${count}</span></span>`)
        .join('');
    
    return `<div class="status-tags">${tags}</div>`;
}

function getInitials(name) {
    const parts = name.split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

function getCompletionRate(emp) {
    const total = emp.tasks.total_tasks;
    if (total === 0) return 0;
    const completed = emp.tasks.completed_month;
    return Math.min(100, Math.round((completed / total) * 100));
}

function getCycleTimeColor(days) {
    if (days <= 3) return 'green';
    if (days <= 7) return 'orange';
    return 'red';
}

function getCycleTimePercent(days) {
    if (days === 0) return 0;
    // Scale: 1 day = 10%, max 100% at 10 days
    return Math.min(100, Math.round(days * 10));
}

function updateConnectionStatus(connected) {
    const el = document.getElementById('connectionStatus');
    if (connected) {
        el.innerHTML = '<span class="status-dot"></span><span>Live</span>';
        el.style.color = 'var(--accent-green)';
        el.style.background = 'rgba(52, 211, 153, 0.1)';
    } else {
        el.innerHTML = '<span class="status-dot" style="background:var(--accent-red);"></span><span>Offline</span>';
        el.style.color = 'var(--accent-red)';
        el.style.background = 'rgba(248, 113, 113, 0.1)';
    }
}

function toggleAlerts() {
    const list = document.getElementById('alertsList');
    const icon = document.getElementById('alertsToggleIcon');
    if (list.style.display === 'none') {
        list.style.display = 'flex';
        icon.className = 'fas fa-chevron-down';
    } else {
        list.style.display = 'none';
        icon.className = 'fas fa-chevron-right';
    }
}
