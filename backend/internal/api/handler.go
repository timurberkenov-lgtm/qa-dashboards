package api

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/timurberkenov-lgtm/qa-dashboards/backend/internal/alerts"
	"github.com/timurberkenov-lgtm/qa-dashboards/backend/internal/collector"
	"github.com/timurberkenov-lgtm/qa-dashboards/backend/internal/config"
	"github.com/timurberkenov-lgtm/qa-dashboards/backend/internal/models"
)

type Handler struct {
	cfg        *config.Config
	jira       *collector.JiraCollector
	confluence *collector.ConfluenceCollector
	gitlab     *collector.GitLabCollector
	alertEng   *alerts.AlertEngine

	mu          sync.RWMutex
	dashboard   *models.DashboardResponse
	lastUpdated time.Time
}

func NewHandler(cfg *config.Config) *Handler {
	h := &Handler{
		cfg:        cfg,
		jira:       collector.NewJiraCollector(cfg),
		confluence: collector.NewConfluenceCollector(cfg),
		gitlab:     collector.NewGitLabCollector(cfg),
		alertEng:   alerts.NewAlertEngine(cfg),
	}

	// Initial data load
	go h.collectData()

	// Start polling
	go h.startPolling()

	return h
}

func (h *Handler) startPolling() {
	ticker := time.NewTicker(h.cfg.Server.PollInterval)
	defer ticker.Stop()

	for range ticker.C {
		h.collectData()
	}
}

func (h *Handler) collectData() {
	log.Println("Collecting data from Jira, Confluence, GitLab...")

	var employees []models.EmployeeDashboard
	var allAlerts []models.Alert
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	for _, emp := range h.cfg.Employees {
		ed := models.EmployeeDashboard{
			Employee:    emp,
			LastUpdated: now,
		}

		// Jira tasks
		activeTasks, err := h.jira.GetEmployeeTasks(emp)
		if err != nil {
			log.Printf("Error fetching Jira tasks for %s: %v", emp.Name, err)
		} else {
			ed.Tasks.ActiveTasks = len(activeTasks)
			ed.Tasks.ByStatus = make(map[string]int)
			ed.Tasks.ByType = make(map[string]int)

			for _, task := range activeTasks {
				ed.Tasks.ByStatus[task.Status]++
				ed.Tasks.ByType[task.Type]++

				// Check stale
				daysInStatus := int(now.Sub(task.StatusSince).Hours() / 24)
				if daysInStatus >= h.cfg.Alerts.StaleTaskDays {
					ed.Tasks.StaleTasks++
				}
			}
		}

		// Completed tasks - month
		completedMonth, err := h.jira.GetCompletedTasks(emp, monthStart)
		if err != nil {
			log.Printf("Error fetching completed tasks for %s: %v", emp.Name, err)
		} else {
			ed.Tasks.CompletedMonth = len(completedMonth)

			// Completed today
			for _, task := range completedMonth {
				if task.Updated.After(todayStart) {
					ed.Tasks.CompletedToday++
				}
			}

			// Calculate avg cycle time
			if len(completedMonth) > 0 {
				var totalDays float64
				for _, task := range completedMonth {
					days := task.Updated.Sub(task.Created).Hours() / 24
					totalDays += days
				}
				ed.Tasks.AvgCycleTimeDays = totalDays / float64(len(completedMonth))
			}
		}

		ed.Tasks.TotalTasks = ed.Tasks.ActiveTasks + ed.Tasks.CompletedMonth

		// Confluence
		confMetrics, err := h.confluence.GetEmployeeMetrics(emp)
		if err != nil {
			log.Printf("Error fetching Confluence metrics for %s: %v", emp.Name, err)
		} else {
			ed.Confluence = confMetrics
		}

		// GitLab
		gitMetrics, err := h.gitlab.GetEmployeeMetrics(emp)
		if err != nil {
			log.Printf("Error fetching GitLab metrics for %s: %v", emp.Name, err)
		} else {
			ed.GitLab = gitMetrics
		}

		// Alerts
		empAlerts := h.alertEng.CheckAlerts(emp, activeTasks, gitMetrics)
		ed.Alerts = empAlerts
		allAlerts = append(allAlerts, empAlerts...)

		employees = append(employees, ed)
	}

	// Build summary
	summary := models.TeamSummary{}
	for _, ed := range employees {
		summary.TotalActiveTasks += ed.Tasks.ActiveTasks
		summary.TotalCompletedToday += ed.Tasks.CompletedToday
		summary.TotalCompletedMonth += ed.Tasks.CompletedMonth
		summary.TotalMRsMonth += ed.GitLab.MRsCreatedMonth
		summary.TotalPagesMonth += ed.Confluence.PagesCreatedMonth + ed.Confluence.PagesUpdatedMonth
	}
	summary.TotalAlerts = len(allAlerts)
	for _, a := range allAlerts {
		if a.Severity == "critical" {
			summary.CriticalAlerts++
		}
	}

	// Update dashboard
	h.mu.Lock()
	h.dashboard = &models.DashboardResponse{
		Employees:   employees,
		Summary:     summary,
		Alerts:      allAlerts,
		LastUpdated: now,
	}
	h.lastUpdated = now
	h.mu.Unlock()

	log.Printf("Data collection complete. %d employees, %d alerts", len(employees), len(allAlerts))
}

// ServeHTTP handles all API requests
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/dashboard", h.handleDashboard)
	mux.HandleFunc("/api/alerts", h.handleAlerts)
	mux.HandleFunc("/api/health", h.handleHealth)
}

func (h *Handler) handleDashboard(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	data := h.dashboard
	h.mu.RUnlock()

	if data == nil {
		http.Error(w, "Data not yet available", http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(data)
}

func (h *Handler) handleAlerts(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	data := h.dashboard
	h.mu.RUnlock()

	if data == nil {
		http.Error(w, "Data not yet available", http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(data.Alerts)
}

func (h *Handler) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":       "ok",
		"last_updated": h.lastUpdated,
	})
}
