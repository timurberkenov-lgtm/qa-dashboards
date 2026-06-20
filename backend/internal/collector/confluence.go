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

type ConfluenceCollector struct {
	cfg    *config.Config
	client *http.Client
}

func NewConfluenceCollector(cfg *config.Config) *ConfluenceCollector {
	return &ConfluenceCollector{
		cfg: cfg,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// GetEmployeeMetrics returns Confluence metrics for an employee
func (c *ConfluenceCollector) GetEmployeeMetrics(employee models.Employee) (models.ConfluenceMetrics, error) {
	var metrics models.ConfluenceMetrics

	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	// Pages created this month
	createdMonth, err := c.searchPages(employee.Email, "created", monthStart)
	if err != nil {
		return metrics, err
	}
	metrics.PagesCreatedMonth = len(createdMonth)

	// Pages created today
	createdToday, err := c.searchPages(employee.Email, "created", todayStart)
	if err != nil {
		return metrics, err
	}
	metrics.PagesCreatedToday = len(createdToday)

	// Pages updated this month (contributor)
	updatedMonth, err := c.searchContributed(employee.Email, monthStart)
	if err != nil {
		return metrics, err
	}
	metrics.PagesUpdatedMonth = len(updatedMonth)

	// Total pages by this user
	total, err := c.getTotalPages(employee.Email)
	if err != nil {
		return metrics, err
	}
	metrics.TotalPages = total

	// Quality score calculation (simplified: based on activity)
	if metrics.PagesCreatedMonth+metrics.PagesUpdatedMonth > 10 {
		metrics.QualityScore = 90
	} else if metrics.PagesCreatedMonth+metrics.PagesUpdatedMonth > 5 {
		metrics.QualityScore = 70
	} else if metrics.PagesCreatedMonth+metrics.PagesUpdatedMonth > 0 {
		metrics.QualityScore = 50
	} else {
		metrics.QualityScore = 20
	}

	return metrics, nil
}

func (c *ConfluenceCollector) searchPages(email, dateField string, since time.Time) ([]string, error) {
	sinceStr := since.Format("2006-01-02")
	cql := fmt.Sprintf(`creator = "%s" AND %s >= "%s" AND type = page`, email, dateField, sinceStr)

	endpoint := fmt.Sprintf("%s/rest/api/content/search?cql=%s&limit=100",
		c.cfg.Confluence.URL, url.QueryEscape(cql))

	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.cfg.Confluence.Token)

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("confluence request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("confluence returned %d: %s", resp.StatusCode, string(body))
	}

	var result confluenceSearchResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	var ids []string
	for _, r := range result.Results {
		ids = append(ids, r.ID)
	}
	return ids, nil
}

func (c *ConfluenceCollector) searchContributed(email string, since time.Time) ([]string, error) {
	sinceStr := since.Format("2006-01-02")
	cql := fmt.Sprintf(`contributor = "%s" AND lastModified >= "%s" AND type = page`, email, sinceStr)

	endpoint := fmt.Sprintf("%s/rest/api/content/search?cql=%s&limit=100",
		c.cfg.Confluence.URL, url.QueryEscape(cql))

	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.cfg.Confluence.Token)

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("confluence request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// Fallback - some Confluence versions don't support contributor
		return nil, nil
	}

	var result confluenceSearchResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	var ids []string
	for _, r := range result.Results {
		ids = append(ids, r.ID)
	}
	return ids, nil
}

func (c *ConfluenceCollector) getTotalPages(email string) (int, error) {
	cql := fmt.Sprintf(`creator = "%s" AND type = page`, email)
	endpoint := fmt.Sprintf("%s/rest/api/content/search?cql=%s&limit=0",
		c.cfg.Confluence.URL, url.QueryEscape(cql))

	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+c.cfg.Confluence.Token)

	resp, err := c.client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, nil
	}

	var result confluenceSearchResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, err
	}

	return result.TotalSize, nil
}

type confluenceSearchResult struct {
	Results   []confluencePage `json:"results"`
	TotalSize int             `json:"totalSize"`
}

type confluencePage struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Type  string `json:"type"`
}
