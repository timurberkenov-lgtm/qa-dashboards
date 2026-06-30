package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/timurberkenov-lgtm/qa-dashboards/backend/internal/models"
)

const (
	slaTZ             = 24
	slaTZBlocked      = 8
	slaAnalysis       = 16
	slaSupport        = 4
	monthlyBudgetHours = 176
)

// WorkloadTask represents a single task counted in workload
type WorkloadTask struct {
	Key     string `json:"key"`
	Summary string `json:"summary"`
	Type    string `json:"type"`
	Project string `json:"project"`
	Status  string `json:"status"`
	Service string `json:"service"` // "analysis", "tz", "support"
	SLA     int    `json:"sla"`
	Note    string `json:"note,omitempty"` // e.g. "Blocked + comments → 8h"
	URL     string `json:"url"`
}

// WorkloadEmployee represents workload data for one employee
type WorkloadEmployee struct {
	Name           string         `json:"name"`
	Budget         int            `json:"budget"`          // effective budget in hours
	TotalHours     int            `json:"total_hours"`
	Percent        float64        `json:"percent"`
	Verdict        string         `json:"verdict"`         // "low", "normal", "high", "overload"
	VerdictLabel   string         `json:"verdict_label"`
	AnalysisHours  int            `json:"analysis_hours"`
	TZHours        int            `json:"tz_hours"`
	SupportHours   int            `json:"support_hours"`
	AnalysisCount  int            `json:"analysis_count"`
	TZCount        int            `json:"tz_count"`
	SupportCount   int            `json:"support_count"`
	Tasks          []WorkloadTask `json:"tasks"`
	SkippedCount   int            `json:"skipped_count"`
	VacationDays   int            `json:"vacation_days"`
	IsOnboarding   bool           `json:"is_onboarding"`
}

// WorkloadResponse is the API response
type WorkloadResponse struct {
	Employees []WorkloadEmployee `json:"employees"`
	Month     string             `json:"month"`
	SLAInfo   SLAInfo            `json:"sla_info"`
}

// SLAInfo describes the calculation model
type SLAInfo struct {
	Services []SLAService `json:"services"`
	Budget   int          `json:"budget"`
	Rules    []string     `json:"rules"`
}

type SLAService struct {
	Name        string `json:"name"`
	TaskTypes   string `json:"task_types"`
	SLAHours    int    `json:"sla_hours"`
	Description string `json:"description"`
}

func (h *Handler) handleWorkload(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")

	monthParam := r.URL.Query().Get("month")
	force := r.URL.Query().Get("force") == "true"
	cacheKey := "workload:" + monthParam

	// Check cache (unless force)
	if !force {
		h.mu.RLock()
		if cached, ok := h.cache[cacheKey]; ok {
			h.mu.RUnlock()
			writeJSON(w, cached)
			return
		}
		h.mu.RUnlock()
	}

	monthStart, monthEnd := getMonthRange(r)

	var until time.Time
	if monthParam != "all" {
		until = monthEnd
	}

	var employees []WorkloadEmployee

	for _, emp := range h.cfg.Employees {
		we := calculateWorkload(h, emp, monthStart, until)
		employees = append(employees, we)
	}

	slaInfo := SLAInfo{
		Budget: monthlyBudgetHours,
		Services: []SLAService{
			{Name: "Анализ бизнес-требований", TaskTypes: "Задача (проект NSA), Enabler Story", SLAHours: slaAnalysis, Description: "Исследование задачи, бизнес-анализ"},
			{Name: "Формирование технического задания", TaskTypes: "User Story, userStoryDomain", SLAHours: slaTZ, Description: "Проектирование решения, написание ТЗ"},
			{Name: "Техническая поддержка", TaskTypes: "Ошибка, Инцидент", SLAHours: slaSupport, Description: "Анализ и решение инцидентов"},
		},
		Rules: []string{
			"Ёмкость сотрудника: 22 рабочих дня × 8ч = 176ч (100%)",
			"Backlog/Бэклог — не учитывается (работа не начата)",
			"Blocked/Cancelled с комментариями (ТЗ) — 8ч (частичная работа)",
			"Blocked/Cancelled без комментариев — не учитывается",
			"Отпуск — вычитается из ёмкости (рабочие дни × 8ч)",
			"Онбординг — помечается, нагрузка ожидаемо ниже",
		},
	}

	resp := WorkloadResponse{
		Employees: employees,
		Month:     monthParam,
		SLAInfo:   slaInfo,
	}

	// Store in cache
	h.mu.Lock()
	h.cache[cacheKey] = &resp
	h.mu.Unlock()

	writeJSON(w, resp)
}

func calculateWorkload(h *Handler, emp models.Employee, since time.Time, until time.Time) WorkloadEmployee {
	issues, _ := h.jira.GetEmployeeTasksRange(emp, since, until)

	we := WorkloadEmployee{
		Name:   emp.Name,
		Budget: monthlyBudgetHours,
	}

	for _, issue := range issues {
		summaryLower := strings.ToLower(issue.Summary)

		// Vacation
		if strings.Contains(summaryLower, "отпуск") {
			days := calcWorkingDays(issue.Created, issue.Updated)
			we.VacationDays = days
			we.Budget = monthlyBudgetHours - (days * 8)
			if we.Budget <= 0 {
				we.Budget = 8
			}
			continue
		}

		// Onboarding
		if strings.Contains(summaryLower, "онбординг") || strings.Contains(summaryLower, "onboarding") {
			we.IsOnboarding = true
			continue
		}

		// Classify
		service := classifyService(issue)
		if service == "" {
			we.SkippedCount++
			continue
		}

		statusLower := strings.ToLower(issue.Status)

		// Skip backlog
		if isBacklogStatus(statusLower) {
			we.SkippedCount++
			continue
		}

		// Blocked/Cancelled logic for TZ
		if service == "tz" && isBlockedStatus(statusLower) {
			comments, _ := h.jira.GetIssueComments(issue.Key)
			if len(comments) > 0 {
				we.Tasks = append(we.Tasks, WorkloadTask{
					Key: issue.Key, Summary: issue.Summary, Type: issue.Type,
					Project: issue.Project, Status: issue.Status, Service: service,
					SLA: slaTZBlocked, Note: "Blocked + comments → 8h", URL: issue.URL,
				})
				we.TZHours += slaTZBlocked
				we.TZCount++
			} else {
				we.SkippedCount++
			}
			continue
		}

		// Normal active task
		slaVal := getSLA(service)
		we.Tasks = append(we.Tasks, WorkloadTask{
			Key: issue.Key, Summary: issue.Summary, Type: issue.Type,
			Project: issue.Project, Status: issue.Status, Service: service,
			SLA: slaVal, URL: issue.URL,
		})

		switch service {
		case "analysis":
			we.AnalysisHours += slaVal
			we.AnalysisCount++
		case "tz":
			we.TZHours += slaVal
			we.TZCount++
		case "support":
			we.SupportHours += slaVal
			we.SupportCount++
		}
	}

	we.TotalHours = we.AnalysisHours + we.TZHours + we.SupportHours
	if we.Budget > 0 {
		we.Percent = float64(we.TotalHours) / float64(we.Budget) * 100
	}

	// Round to 1 decimal
	we.Percent = float64(int(we.Percent*10)) / 10

	switch {
	case we.Percent < 60:
		we.Verdict = "low"
		we.VerdictLabel = "Низкая загрузка"
	case we.Percent <= 90:
		we.Verdict = "normal"
		we.VerdictLabel = "Нормальная загрузка"
	case we.Percent <= 110:
		we.Verdict = "high"
		we.VerdictLabel = "Высокая загрузка"
	default:
		we.Verdict = "overload"
		we.VerdictLabel = "Перегрузка"
	}

	return we
}

func classifyService(issue models.JiraIssue) string {
	typeLower := strings.ToLower(issue.Type)
	projectUpper := strings.ToUpper(issue.Project)

	switch {
	case typeLower == "user story" || typeLower == "userstorydomain" || typeLower == "story":
		return "tz"
	case typeLower == "ошибка" || typeLower == "инцидент" || typeLower == "bug" || typeLower == "incident":
		return "support"
	case (typeLower == "задача" || typeLower == "task") && projectUpper == "NSA":
		return "analysis"
	case typeLower == "enabler story":
		return "analysis"
	}
	return ""
}

func getSLA(service string) int {
	switch service {
	case "tz":
		return slaTZ
	case "analysis":
		return slaAnalysis
	case "support":
		return slaSupport
	}
	return 0
}

func isBacklogStatus(status string) bool {
	backlog := []string{"backlog", "бэклог", "сделать", "to do"}
	for _, b := range backlog {
		if strings.Contains(status, b) {
			return true
		}
	}
	return false
}

func isBlockedStatus(status string) bool {
	return strings.Contains(status, "blocked") ||
		strings.Contains(status, "cancelled") ||
		strings.Contains(status, "cancel") ||
		strings.Contains(status, "hold")
}

func calcWorkingDays(start, end time.Time) int {
	if start.IsZero() || end.IsZero() {
		return 0
	}
	days := 0
	current := start
	for current.Before(end) || current.Equal(end) {
		if current.Weekday() != time.Saturday && current.Weekday() != time.Sunday {
			days++
		}
		current = current.AddDate(0, 0, 1)
	}
	return days
}
