// i18n — Internationalization for SA Team Dashboard
const I18N = {
    _currentLang: localStorage.getItem('lang') || 'ru',

    get lang() { return this._currentLang; },

    set lang(val) {
        this._currentLang = val;
        localStorage.setItem('lang', val);
    },

    t(key) {
        const dict = this._currentLang === 'en' ? this.en : this.ru;
        return dict[key] || this.ru[key] || key;
    },

    // Russian translations (original)
    ru: {
        // Navigation
        'nav.home': 'Главная',
        'nav.tasks': 'Задачи Jira',
        'nav.mr': 'Merge Requests',
        'nav.docs': 'Документация',
        'nav.interviews': 'Собеседования',

        // Dashboard
        'dashboard.title': 'Обзор команды',
        'dashboard.subtitle': 'Системные аналитики | ForteBank',
        'dashboard.active_tasks': 'Активные задачи',
        'dashboard.completed': 'Выполнено',
        'dashboard.merge_requests': 'Merge Requests',
        'dashboard.alerts': 'Алерты',
        'dashboard.employees': 'Сотрудники',
        'dashboard.loading': 'Загрузка данных...',

        // Gauges
        'gauge.completion': 'Исполнение',
        'gauge.no_stale': 'Без зависаний',
        'gauge.mr_merged': 'MR Merged',
        'gauge.workload': 'Загрузка',
        'gauge.tasks_completed': 'задач завершено',
        'gauge.tasks_stale': 'задач стоят >5 дней',
        'gauge.mrs_merged': 'MR влиты',
        'gauge.tasks_per_person': 'задач на человека',

        // Employee cards
        'emp.active': 'Активные',
        'emp.completed': 'Выполнено',
        'emp.total': 'Всего задач',
        'emp.mr_merged': 'MR Merged',
        'emp.stale': 'Зависшие',
        'emp.workload': 'Загрузка',
        'emp.load_high': 'Высокая',
        'emp.load_medium': 'Средняя',
        'emp.load_low': 'Низкая',

        // Alerts
        'alerts.title': 'Активные алерты',
        'alerts.critical': 'КРИТ',
        'alerts.warning': 'ВНИМ',
        'alerts.export_excel': 'Excel',
        'alerts.no_data': 'Нет алертов для экспорта',

        // Alert types
        'alert_type.stale_task': 'Задача зависла',
        'alert_type.no_activity': 'Нет активности',
        'alert_type.mr_no_review': 'MR без ревью',
        'alert_type.overdue': 'Просрочена',

        // Alert export columns
        'export.employee': 'Сотрудник',
        'export.type': 'Тип',
        'export.severity': 'Серьёзность',
        'export.severity_critical': 'Критичный',
        'export.severity_warning': 'Внимание',
        'export.description': 'Описание',
        'export.task': 'Задача',
        'export.link': 'Ссылка',
        'export.days_in_status': 'Дней в статусе',
        'export.date': 'Дата',
        'export.sheet_alerts': 'Алерты',

        // Conclusions
        'conclusion.title': 'Общее заключение',
        'conclusion.title_issues': 'Общее заключение и рекомендации',
        'conclusion.ok': 'Команда работает в нормальном режиме. Замечаний нет.',
        'conclusion.tasks_stale': 'задач зависли (>5 дней в одном статусе) — провести разбор',
        'conclusion.no_git_activity': 'сотрудников без активности в GitLab',
        'conclusion.critical_alerts': 'критических алертов',
        'conclusion.section_title': 'Заключение',
        'conclusion.section_title_issues': 'Заключение и рекомендации',

        // Tasks page
        'tasks.title': 'Задачи Jira',
        'tasks.subtitle': 'Детали по задачам сотрудников',
        'tasks.all_employees': 'Все сотрудники',
        'tasks.all_statuses': 'Все статусы',
        'tasks.all_types': 'Все типы',
        'tasks.search': 'Поиск...',
        'tasks.no_tasks': 'Нет задач',
        'tasks.ok': 'Задачи обрабатываются в нормальном режиме.',
        'tasks.stale_suffix': 'д',
        'tasks.stale_label': 'Зависла',

        // Tasks table headers
        'tasks.th.key': 'Ключ',
        'tasks.th.employee': 'Сотрудник',
        'tasks.th.task': 'Задача',
        'tasks.th.type': 'Тип',
        'tasks.th.status': 'Статус',
        'tasks.th.created': 'Дата создания',
        'tasks.th.updated': 'Дата обновления',
        'tasks.th.days_in_status': 'Дней в статусе',
        'tasks.th.remarks': 'Замечания',

        // Tasks export
        'tasks.export.title': 'Экспорт задач в Excel',
        'tasks.export.comments_note': 'Комментарии будут включены в выгрузку.',
        'tasks.export.period': 'Период:',
        'tasks.export.employees': 'Сотрудники:',
        'tasks.export.types': 'Типы задач:',
        'tasks.export.projects': 'Проекты:',
        'tasks.export.select_all': 'Выбрать все',
        'tasks.export.deselect': 'Сбросить',
        'tasks.export.download': 'Выгрузить',
        'tasks.export.cancel': 'Отмена',
        'tasks.export.loading': 'Загрузка...',
        'tasks.export.no_employee': 'Выберите хотя бы одного сотрудника',
        'tasks.export.no_tasks': 'Нет задач для выгрузки',
        'tasks.export.error': 'Ошибка сервера',
        'tasks.export.col.key': 'Ключ',
        'tasks.export.col.employee': 'Сотрудник',
        'tasks.export.col.task': 'Задача',
        'tasks.export.col.type': 'Тип',
        'tasks.export.col.status': 'Статус',
        'tasks.export.col.project': 'Проект',
        'tasks.export.col.created': 'Дата создания',
        'tasks.export.col.updated': 'Дата обновления',
        'tasks.export.col.link': 'Ссылка',
        'tasks.export.col.comments': 'Комментарии',
        'tasks.export.sheet': 'Задачи',

        // Comments
        'comments.none': 'Нет комментариев',
        'comments.error': 'Ошибка загрузки комментариев',

        // MR page
        'mr.title': 'Merge Requests',
        'mr.subtitle': 'GitLab активность команды',
        'mr.all_employees': 'Все сотрудники',
        'mr.all_states': 'Все статусы',
        'mr.state_opened': 'Open',
        'mr.state_merged': 'Merged',
        'mr.state_closed': 'Closed',
        'mr.pipeline_all': 'Pipeline: все',
        'mr.pipeline_success': 'Успешный',
        'mr.pipeline_failed': 'Упавший',
        'mr.pipeline_running': 'В процессе',
        'mr.search': 'Поиск...',
        'mr.no_data': 'Нет MR',
        'mr.ok': 'MR обрабатываются нормально.',

        // MR table headers
        'mr.th.mr': 'MR',
        'mr.th.employee': 'Сотрудник',
        'mr.th.title': 'Название',
        'mr.th.project': 'Проект',
        'mr.th.status': 'Статус',
        'mr.th.pipeline': 'Pipeline',
        'mr.th.created': 'Дата создания',
        'mr.th.days': 'Дней',
        'mr.th.reviewers': 'Ревьюеры',

        // MR state labels
        'mr.label.opened': 'Open',
        'mr.label.merged': 'Merged',
        'mr.label.closed': 'Closed',
        'mr.no_reviewer': 'Нет',

        // Pipeline labels
        'pipeline.success': 'Успешно',
        'pipeline.failed': 'Ошибка',
        'pipeline.running': 'Запущен',
        'pipeline.pending': 'Ожидает',
        'pipeline.na': 'Н/Д',

        // Confluence page
        'conf.title': 'Документация Confluence',
        'conf.subtitle': 'Активность и качество документации',
        'conf.all_employees': 'Все сотрудники',
        'conf.all_spaces': 'Все пространства',
        'conf.search': 'Поиск...',
        'conf.no_data': 'Нет данных',
        'conf.ok': 'Документация ведётся активно.',

        // Confluence table headers
        'conf.th.page': 'Страница',
        'conf.th.employee': 'Сотрудник',
        'conf.th.space': 'Пространство',
        'conf.th.version': 'Версия',
        'conf.th.updated': 'Обновлено',
        'conf.th.changes': 'Изменения',

        // Candidates page
        'cand.title': 'Собеседования',
        'cand.subtitle': 'Подбор кандидатов — Системные аналитики',
        'cand.all_results': 'Все результаты',
        'cand.result_accepted': 'Принят',
        'cand.result_rejected': 'Отклонён',
        'cand.result_no_sb': 'Не прошёл СБ',
        'cand.result_pending': 'В ожидании',
        'cand.search': 'Поиск...',
        'cand.add': 'Добавить',
        'cand.no_data': 'Нет данных',

        // Candidates stats
        'cand.stat_total': 'Всего',
        'cand.stat_accepted': 'Принято',
        'cand.stat_rejected': 'Отклонено',
        'cand.stat_conversion': 'Конверсия',
        'cand.stat_avg_score': 'Средний балл',

        // Candidates table headers
        'cand.th.candidate': 'Кандидат',
        'cand.th.date': 'Дата',
        'cand.th.score': 'Балл',
        'cand.th.level': 'Уровень',
        'cand.th.result': 'Результат',
        'cand.th.conclusion': 'Заключение',
        'cand.click_to_edit': 'Нажмите для редактирования',

        // Candidates form
        'cand.form.title': 'Новый кандидат',
        'cand.form.name': 'ФИО кандидата',
        'cand.form.conclusion': 'Заключение',
        'cand.form.save': 'Сохранить',
        'cand.form.cancel': 'Отмена',
        'cand.form.error_name': 'Укажите ФИО',
        'cand.form.error_save': 'Ошибка сохранения',
        'cand.form.comment': 'Комментарий',

        // Candidates export
        'cand.export.col.name': 'ФИО',
        'cand.export.col.date': 'Дата',
        'cand.export.col.avg_score': 'Средний балл',
        'cand.export.col.level': 'Уровень',
        'cand.export.col.grade': 'Grade',
        'cand.export.col.result': 'Результат',
        'cand.export.col.conclusion': 'Заключение',
        'cand.export.sheet': 'Собеседования',

        // Delete confirmation
        'cand.delete_confirm': 'Удалить кандидата',
        'cand.delete_error': 'Ошибка удаления',

        // Month filter
        'filter.current_month': 'Текущий месяц',
        'filter.all_period': 'За весь период',

        // Theme
        'theme.toggle': 'Переключить тему',

        // No data
        'no_data': 'Нет данных',

        // Errors
        'error.generic': 'Ошибка',
    },

    // English translations
    en: {
        // Navigation
        'nav.home': 'Home',
        'nav.tasks': 'Jira Tasks',
        'nav.mr': 'Merge Requests',
        'nav.docs': 'Documentation',
        'nav.interviews': 'Interviews',

        // Dashboard
        'dashboard.title': 'Team Overview',
        'dashboard.subtitle': 'System Analysts | ForteBank',
        'dashboard.active_tasks': 'Active Tasks',
        'dashboard.completed': 'Completed',
        'dashboard.merge_requests': 'Merge Requests',
        'dashboard.alerts': 'Alerts',
        'dashboard.employees': 'Employees',
        'dashboard.loading': 'Loading data...',

        // Gauges
        'gauge.completion': 'Completion',
        'gauge.no_stale': 'No Stale',
        'gauge.mr_merged': 'MR Merged',
        'gauge.workload': 'Workload',
        'gauge.tasks_completed': 'tasks completed',
        'gauge.tasks_stale': 'tasks stale >5 days',
        'gauge.mrs_merged': 'MRs merged',
        'gauge.tasks_per_person': 'tasks per person',

        // Employee cards
        'emp.active': 'Active',
        'emp.completed': 'Completed',
        'emp.total': 'Total Tasks',
        'emp.mr_merged': 'MR Merged',
        'emp.stale': 'Stale',
        'emp.workload': 'Workload',
        'emp.load_high': 'High',
        'emp.load_medium': 'Medium',
        'emp.load_low': 'Low',

        // Alerts
        'alerts.title': 'Active Alerts',
        'alerts.critical': 'CRIT',
        'alerts.warning': 'WARN',
        'alerts.export_excel': 'Excel',
        'alerts.no_data': 'No alerts to export',

        // Alert types
        'alert_type.stale_task': 'Stale Task',
        'alert_type.no_activity': 'No Activity',
        'alert_type.mr_no_review': 'MR No Review',
        'alert_type.overdue': 'Overdue',

        // Alert export columns
        'export.employee': 'Employee',
        'export.type': 'Type',
        'export.severity': 'Severity',
        'export.severity_critical': 'Critical',
        'export.severity_warning': 'Warning',
        'export.description': 'Description',
        'export.task': 'Task',
        'export.link': 'Link',
        'export.days_in_status': 'Days in Status',
        'export.date': 'Date',
        'export.sheet_alerts': 'Alerts',

        // Conclusions
        'conclusion.title': 'Overall Conclusion',
        'conclusion.title_issues': 'Overall Conclusion & Recommendations',
        'conclusion.ok': 'Team is operating normally. No issues detected.',
        'conclusion.tasks_stale': 'tasks stale (>5 days in same status) — review needed',
        'conclusion.no_git_activity': 'employees with no GitLab activity',
        'conclusion.critical_alerts': 'critical alerts',
        'conclusion.section_title': 'Conclusion',
        'conclusion.section_title_issues': 'Conclusion & Recommendations',

        // Tasks page
        'tasks.title': 'Jira Tasks',
        'tasks.subtitle': 'Employee task details',
        'tasks.all_employees': 'All Employees',
        'tasks.all_statuses': 'All Statuses',
        'tasks.all_types': 'All Types',
        'tasks.search': 'Search...',
        'tasks.no_tasks': 'No tasks',
        'tasks.ok': 'Tasks are being processed normally.',
        'tasks.stale_suffix': 'd',
        'tasks.stale_label': 'Stale',

        // Tasks table headers
        'tasks.th.key': 'Key',
        'tasks.th.employee': 'Employee',
        'tasks.th.task': 'Task',
        'tasks.th.type': 'Type',
        'tasks.th.status': 'Status',
        'tasks.th.created': 'Created',
        'tasks.th.updated': 'Updated',
        'tasks.th.days_in_status': 'Days in Status',
        'tasks.th.remarks': 'Remarks',

        // Tasks export
        'tasks.export.title': 'Export Tasks to Excel',
        'tasks.export.comments_note': 'Comments will be included in the export.',
        'tasks.export.period': 'Period:',
        'tasks.export.employees': 'Employees:',
        'tasks.export.types': 'Task Types:',
        'tasks.export.projects': 'Projects:',
        'tasks.export.select_all': 'Select all',
        'tasks.export.deselect': 'Clear',
        'tasks.export.download': 'Download',
        'tasks.export.cancel': 'Cancel',
        'tasks.export.loading': 'Loading...',
        'tasks.export.no_employee': 'Select at least one employee',
        'tasks.export.no_tasks': 'No tasks to export',
        'tasks.export.error': 'Server error',
        'tasks.export.col.key': 'Key',
        'tasks.export.col.employee': 'Employee',
        'tasks.export.col.task': 'Task',
        'tasks.export.col.type': 'Type',
        'tasks.export.col.status': 'Status',
        'tasks.export.col.project': 'Project',
        'tasks.export.col.created': 'Created',
        'tasks.export.col.updated': 'Updated',
        'tasks.export.col.link': 'Link',
        'tasks.export.col.comments': 'Comments',
        'tasks.export.sheet': 'Tasks',

        // Comments
        'comments.none': 'No comments',
        'comments.error': 'Error loading comments',

        // MR page
        'mr.title': 'Merge Requests',
        'mr.subtitle': 'Team GitLab activity',
        'mr.all_employees': 'All Employees',
        'mr.all_states': 'All States',
        'mr.state_opened': 'Open',
        'mr.state_merged': 'Merged',
        'mr.state_closed': 'Closed',
        'mr.pipeline_all': 'Pipeline: all',
        'mr.pipeline_success': 'Success',
        'mr.pipeline_failed': 'Failed',
        'mr.pipeline_running': 'Running',
        'mr.search': 'Search...',
        'mr.no_data': 'No MRs',
        'mr.ok': 'MRs are being processed normally.',

        // MR table headers
        'mr.th.mr': 'MR',
        'mr.th.employee': 'Employee',
        'mr.th.title': 'Title',
        'mr.th.project': 'Project',
        'mr.th.status': 'Status',
        'mr.th.pipeline': 'Pipeline',
        'mr.th.created': 'Created',
        'mr.th.days': 'Days',
        'mr.th.reviewers': 'Reviewers',

        // MR state labels
        'mr.label.opened': 'Open',
        'mr.label.merged': 'Merged',
        'mr.label.closed': 'Closed',
        'mr.no_reviewer': 'None',

        // Pipeline labels
        'pipeline.success': 'Success',
        'pipeline.failed': 'Failed',
        'pipeline.running': 'Running',
        'pipeline.pending': 'Pending',
        'pipeline.na': 'N/A',

        // Confluence page
        'conf.title': 'Confluence Documentation',
        'conf.subtitle': 'Documentation activity & quality',
        'conf.all_employees': 'All Employees',
        'conf.all_spaces': 'All Spaces',
        'conf.search': 'Search...',
        'conf.no_data': 'No data',
        'conf.ok': 'Documentation is being actively maintained.',

        // Confluence table headers
        'conf.th.page': 'Page',
        'conf.th.employee': 'Employee',
        'conf.th.space': 'Space',
        'conf.th.version': 'Version',
        'conf.th.updated': 'Updated',
        'conf.th.changes': 'Changes',

        // Candidates page
        'cand.title': 'Interviews',
        'cand.subtitle': 'Candidate Selection — System Analysts',
        'cand.all_results': 'All Results',
        'cand.result_accepted': 'Accepted',
        'cand.result_rejected': 'Rejected',
        'cand.result_no_sb': 'Failed Security',
        'cand.result_pending': 'Pending',
        'cand.search': 'Search...',
        'cand.add': 'Add',
        'cand.no_data': 'No data',

        // Candidates stats
        'cand.stat_total': 'Total',
        'cand.stat_accepted': 'Accepted',
        'cand.stat_rejected': 'Rejected',
        'cand.stat_conversion': 'Conversion',
        'cand.stat_avg_score': 'Avg Score',

        // Candidates table headers
        'cand.th.candidate': 'Candidate',
        'cand.th.date': 'Date',
        'cand.th.score': 'Score',
        'cand.th.level': 'Level',
        'cand.th.result': 'Result',
        'cand.th.conclusion': 'Conclusion',
        'cand.click_to_edit': 'Click to edit',

        // Candidates form
        'cand.form.title': 'New Candidate',
        'cand.form.name': 'Candidate name',
        'cand.form.conclusion': 'Conclusion',
        'cand.form.save': 'Save',
        'cand.form.cancel': 'Cancel',
        'cand.form.error_name': 'Enter candidate name',
        'cand.form.error_save': 'Save error',
        'cand.form.comment': 'Comment',

        // Candidates export
        'cand.export.col.name': 'Name',
        'cand.export.col.date': 'Date',
        'cand.export.col.avg_score': 'Avg Score',
        'cand.export.col.level': 'Level',
        'cand.export.col.grade': 'Grade',
        'cand.export.col.result': 'Result',
        'cand.export.col.conclusion': 'Conclusion',
        'cand.export.sheet': 'Interviews',

        // Delete confirmation
        'cand.delete_confirm': 'Delete candidate',
        'cand.delete_error': 'Delete error',

        // Month filter
        'filter.current_month': 'Current month',
        'filter.all_period': 'All time',

        // Theme
        'theme.toggle': 'Toggle theme',

        // No data
        'no_data': 'No data',

        // Errors
        'error.generic': 'Error',
    }
};

// Shortcut
function t(key) { return I18N.t(key); }

// Get locale string for dates
function getDateLocale() { return I18N.lang === 'en' ? 'en-US' : 'ru-RU'; }

// Switch language and re-render current page
function switchLanguage(lang) {
    I18N.lang = lang;
    applyStaticTranslations();
    // Re-render current page
    if (typeof navigateTo === 'function') {
        navigateTo(currentPage);
    }
}

// Apply translations to static HTML elements with data-i18n attribute
function applyStaticTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = t(el.getAttribute('data-i18n-title'));
    });
    // Update lang select
    const langSelect = document.getElementById('langSelect');
    if (langSelect) langSelect.value = I18N.lang;
}
