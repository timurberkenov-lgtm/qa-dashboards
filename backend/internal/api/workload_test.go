package api

import (
	"testing"
	"time"

	"github.com/timurberkenov-lgtm/qa-dashboards/backend/internal/models"
)

func TestClassifyService_UserStory(t *testing.T) {
	issue := models.JiraIssue{Type: "User Story", Project: "PMB"}
	got := classifyService(issue)
	if got != "tz" {
		t.Errorf("Expected 'tz', got '%s'", got)
	}
}

func TestClassifyService_UserStoryDomain(t *testing.T) {
	issue := models.JiraIssue{Type: "userStoryDomain", Project: "DKPLUS"}
	got := classifyService(issue)
	if got != "tz" {
		t.Errorf("Expected 'tz', got '%s'", got)
	}
}

func TestClassifyService_NSATask(t *testing.T) {
	issue := models.JiraIssue{Type: "Задача", Project: "NSA"}
	got := classifyService(issue)
	if got != "analysis" {
		t.Errorf("Expected 'analysis', got '%s'", got)
	}
}

func TestClassifyService_EnablerStory(t *testing.T) {
	issue := models.JiraIssue{Type: "Enabler Story", Project: "VED"}
	got := classifyService(issue)
	if got != "analysis" {
		t.Errorf("Expected 'analysis', got '%s'", got)
	}
}

func TestClassifyService_Bug(t *testing.T) {
	issue := models.JiraIssue{Type: "Ошибка", Project: "PMB"}
	got := classifyService(issue)
	if got != "support" {
		t.Errorf("Expected 'support', got '%s'", got)
	}
}

func TestClassifyService_Incident(t *testing.T) {
	issue := models.JiraIssue{Type: "Инцидент", Project: "PMB"}
	got := classifyService(issue)
	if got != "support" {
		t.Errorf("Expected 'support', got '%s'", got)
	}
}

func TestClassifyService_Unknown(t *testing.T) {
	issue := models.JiraIssue{Type: "SolutionArchitecture", Project: "PMB"}
	got := classifyService(issue)
	if got != "" {
		t.Errorf("Expected empty string, got '%s'", got)
	}
}

func TestClassifyService_TaskNotNSA(t *testing.T) {
	issue := models.JiraIssue{Type: "Задача", Project: "DPROFILE"}
	got := classifyService(issue)
	if got != "" {
		t.Errorf("Expected empty (task not in NSA), got '%s'", got)
	}
}

func TestIsBacklogStatus(t *testing.T) {
	tests := []struct {
		status string
		expect bool
	}{
		{"backlog", true},
		{"бэклог домена", true},
		{"сделать", true},
		{"to do", true},
		{"analysis", false},
		{"в работе", false},
		{"ready for development", false},
		{"blocked", false},
	}
	for _, tt := range tests {
		got := isBacklogStatus(tt.status)
		if got != tt.expect {
			t.Errorf("isBacklogStatus(%q) = %v, want %v", tt.status, got, tt.expect)
		}
	}
}

func TestIsBlockedStatus(t *testing.T) {
	tests := []struct {
		status string
		expect bool
	}{
		{"blocked", true},
		{"cancelled", true},
		{"hold", true},
		{"analysis", false},
		{"ready for development", false},
		{"готово", false},
	}
	for _, tt := range tests {
		got := isBlockedStatus(tt.status)
		if got != tt.expect {
			t.Errorf("isBlockedStatus(%q) = %v, want %v", tt.status, got, tt.expect)
		}
	}
}

func TestGetSLA(t *testing.T) {
	if getSLA("tz") != 24 {
		t.Error("TZ SLA should be 24")
	}
	if getSLA("analysis") != 16 {
		t.Error("Analysis SLA should be 16")
	}
	if getSLA("support") != 4 {
		t.Error("Support SLA should be 4")
	}
	if getSLA("unknown") != 0 {
		t.Error("Unknown SLA should be 0")
	}
}

func TestCalcWorkingDays(t *testing.T) {
	// Monday to Friday = 5 working days
	start := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC) // Monday
	end := time.Date(2026, 6, 5, 0, 0, 0, 0, time.UTC)   // Friday
	got := calcWorkingDays(start, end)
	if got != 5 {
		t.Errorf("Expected 5 working days, got %d", got)
	}

	// Full week Mon-Sun = 5 working days
	end2 := time.Date(2026, 6, 7, 0, 0, 0, 0, time.UTC) // Sunday
	got2 := calcWorkingDays(start, end2)
	if got2 != 5 {
		t.Errorf("Expected 5 working days (Mon-Sun), got %d", got2)
	}

	// Two weeks = 10 working days
	end3 := time.Date(2026, 6, 12, 0, 0, 0, 0, time.UTC) // Friday next week
	got3 := calcWorkingDays(start, end3)
	if got3 != 10 {
		t.Errorf("Expected 10 working days, got %d", got3)
	}

	// Zero time returns 0
	got4 := calcWorkingDays(time.Time{}, end)
	if got4 != 0 {
		t.Errorf("Expected 0 for zero start, got %d", got4)
	}
}
