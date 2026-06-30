package candidates

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/timurberkenov-lgtm/qa-dashboards/backend/internal/db"
)

// DBHandler handles candidates using PostgreSQL
type DBHandler struct {
	repo *db.CandidatesRepo
}

// NewDBHandler creates a handler backed by PostgreSQL
func NewDBHandler() *DBHandler {
	return &DBHandler{repo: db.NewCandidatesRepo()}
}

func (h *DBHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/candidates", h.handleCandidates)
	mux.HandleFunc("/api/candidates/add", h.handleAddCandidate)
	mux.HandleFunc("/api/candidates/update", h.handleUpdateCandidate)
	mux.HandleFunc("/api/candidates/delete", h.handleDeleteCandidate)
	mux.HandleFunc("/api/candidates/conclusion", h.handleUpdateConclusion)
}

func (h *DBHandler) handleCandidates(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()
	monthParam := r.URL.Query().Get("month")
	lang := r.URL.Query().Get("lang")

	var candidates []db.Candidate
	var err error

	if monthParam == "all" {
		candidates, err = h.repo.GetAll(ctx)
	} else if monthParam != "" {
		t, parseErr := time.Parse("2006-01", monthParam)
		if parseErr == nil {
			candidates, err = h.repo.GetByRange(ctx, t, t.AddDate(0, 1, 0))
		} else {
			candidates, err = h.repo.GetAll(ctx)
		}
	} else {
		now := time.Now()
		start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		candidates, err = h.repo.GetByRange(ctx, start, start.AddDate(0, 1, 0))
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if candidates == nil {
		candidates = []db.Candidate{}
	}

	// Convert to response format
	respCandidates := make([]Candidate, 0, len(candidates))
	for _, c := range candidates {
		var comps []Competency
		for _, comp := range c.Competencies {
			comps = append(comps, Competency{Name: comp.Name, Score: comp.Score, Comment: comp.Comment})
		}
		respCandidates = append(respCandidates, Candidate{
			ID: c.ID, Name: c.Name, Date: c.Date, Result: c.Result,
			AvgScore: c.AvgScore, Level: c.Level, Grade: c.Grade,
			Conclusion: c.Conclusion, Competencies: comps,
		})
	}

	stats := CalculateStats(respCandidates)
	conclusion := GenerateConclusion(respCandidates, stats, lang)

	resp := Response{
		Candidates: respCandidates,
		Stats:      stats,
		Conclusion: conclusion,
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	json.NewEncoder(w).Encode(resp)
}

func (h *DBHandler) handleAddCandidate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var input Candidate
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	var comps []db.Competency
	for _, c := range input.Competencies {
		comps = append(comps, db.Competency{Name: c.Name, Score: c.Score, Comment: c.Comment})
	}

	candidate := &db.Candidate{
		Name:         input.Name,
		Date:         input.Date,
		Result:       input.Result,
		Conclusion:   input.Conclusion,
		Competencies: comps,
	}

	if err := h.repo.Add(context.Background(), candidate); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok", "id": candidate.ID})
}

func (h *DBHandler) handleUpdateCandidate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var input Candidate
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	var comps []db.Competency
	for _, c := range input.Competencies {
		comps = append(comps, db.Competency{Name: c.Name, Score: c.Score, Comment: c.Comment})
	}

	candidate := &db.Candidate{
		ID:           input.ID,
		Name:         input.Name,
		Date:         input.Date,
		Result:       input.Result,
		Conclusion:   input.Conclusion,
		Competencies: comps,
	}

	if err := h.repo.Update(context.Background(), candidate); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (h *DBHandler) handleDeleteCandidate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var input struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if err := h.repo.Delete(context.Background(), input.ID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (h *DBHandler) handleUpdateConclusion(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var input struct {
		ID         string `json:"id"`
		Conclusion string `json:"conclusion"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if err := h.repo.UpdateConclusion(context.Background(), input.ID, input.Conclusion); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
