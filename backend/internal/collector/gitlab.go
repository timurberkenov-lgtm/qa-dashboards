package collector

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/timurberkenov-lgtm/qa-dashboards/backend/internal/config"
	"github.com/timurberkenov-lgtm/qa-dashboards/backend/internal/models"
)

type GitLabCollector struct {
	cfg    *config.Config
	client *http.Client
}

func NewGitLabCollector(cfg *config.Config) *GitLabCollector {
	return &GitLabCollector{
		cfg: cfg,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// GetEmployeeMetrics returns GitLab metrics for an employee
func (g *GitLabCollector) GetEmployeeMetrics(employee models.Employee) (models.GitLabMetrics, error) {
	var metrics models.GitLabMetrics

	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	// Get user's MRs
	mrs, err := g.getUserMRs(employee.Email, monthStart)
	if err != nil {
		return metrics, err
	}

	for _, mr := range mrs {
		metrics.MRsCreatedMonth++
		if mr.State == "merged" {
			metrics.MRsMergedMonth++
		}
		if mr.State == "opened" {
			metrics.MRsOpen++
			// Check if has reviewers
			if len(mr.Reviewers) == 0 {
				metrics.MRsWithoutReview++
			}
		}
	}

	// Get user's events/commits for the month
	commits, err := g.getUserCommits(employee.Email, monthStart)
	if err != nil {
		// Non-critical, continue
		commits = 0
	}
	metrics.CommitsMonth = commits

	commitsToday, err := g.getUserCommits(employee.Email, todayStart)
	if err != nil {
		commitsToday = 0
	}
	metrics.CommitsToday = commitsToday

	return metrics, nil
}

func (g *GitLabCollector) getUserMRs(email string, since time.Time) ([]gitlabMR, error) {
	sinceStr := since.Format(time.RFC3339)
	endpoint := fmt.Sprintf("%s/api/v4/merge_requests?author_username=%s&created_after=%s&per_page=100&scope=all",
		g.cfg.GitLab.URL, url.QueryEscape(extractUsername(email)), url.QueryEscape(sinceStr))

	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("PRIVATE-TOKEN", g.cfg.GitLab.Token)

	resp, err := g.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gitlab MR request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("gitlab returned %d: %s", resp.StatusCode, string(body))
	}

	var mrs []gitlabMR
	if err := json.NewDecoder(resp.Body).Decode(&mrs); err != nil {
		return nil, err
	}

	return mrs, nil
}

func (g *GitLabCollector) getUserCommits(email string, since time.Time) (int, error) {
	sinceStr := since.Format(time.RFC3339)
	endpoint := fmt.Sprintf("%s/api/v4/events?action=pushed&after=%s&per_page=100",
		g.cfg.GitLab.URL, url.QueryEscape(sinceStr))

	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("PRIVATE-TOKEN", g.cfg.GitLab.Token)

	resp, err := g.client.Do(req)
	if err != nil {
		return 0, nil // non-critical
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, nil
	}

	var events []gitlabEvent
	if err := json.NewDecoder(resp.Body).Decode(&events); err != nil {
		return 0, nil
	}

	return len(events), nil
}

// extractUsername gets username part from email (e.g., "DAltybassarova" from "DAltybassarova@Fortebank.com")
func extractUsername(email string) string {
	for i, c := range email {
		if c == '@' {
			return email[:i]
		}
	}
	return email
}

type gitlabMR struct {
	ID        int           `json:"id"`
	IID       int           `json:"iid"`
	Title     string        `json:"title"`
	State     string        `json:"state"`
	CreatedAt string        `json:"created_at"`
	MergedAt  *string       `json:"merged_at"`
	WebURL    string        `json:"web_url"`
	Reviewers []gitlabUser  `json:"reviewers"`
	Author    gitlabUser    `json:"author"`
}

type gitlabUser struct {
	Username string `json:"username"`
	Name     string `json:"name"`
}

type gitlabEvent struct {
	ActionName string `json:"action_name"`
	CreatedAt  string `json:"created_at"`
}
