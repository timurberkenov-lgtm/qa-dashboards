package db

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5"
)

// Candidate represents a row in candidates.candidate
type Candidate struct {
	ID           string        `json:"id"`
	Name         string        `json:"name"`
	Date         time.Time     `json:"date"`
	Result       string        `json:"result"`
	AvgScore     float64       `json:"avg_score"`
	Level        string        `json:"level"`
	Grade        int           `json:"grade"`
	Conclusion   string        `json:"conclusion"`
	Competencies []Competency  `json:"competencies"`
}

// Competency represents a row in candidates.competency_score
type Competency struct {
	Name    string `json:"name"`
	Score   int    `json:"score"`
	Comment string `json:"comment"`
}

// CandidatesRepo provides database operations for candidates
type CandidatesRepo struct{}

func NewCandidatesRepo() *CandidatesRepo {
	return &CandidatesRepo{}
}

// GetAll returns all candidates ordered by date desc
func (r *CandidatesRepo) GetAll(ctx context.Context) ([]Candidate, error) {
	rows, err := Pool.Query(ctx, `
		SELECT id, full_name, interview_date, result, avg_score, level, grade, conclusion
		FROM candidates.candidate
		ORDER BY interview_date DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	candidates, err := r.scanCandidates(rows)
	if err != nil {
		return nil, err
	}

	// Load competencies for each
	for i := range candidates {
		comps, err := r.getCompetencies(ctx, candidates[i].ID)
		if err != nil {
			return nil, err
		}
		candidates[i].Competencies = comps
	}

	return candidates, nil
}

// GetByRange returns candidates within a date range
func (r *CandidatesRepo) GetByRange(ctx context.Context, from, to time.Time) ([]Candidate, error) {
	rows, err := Pool.Query(ctx, `
		SELECT id, full_name, interview_date, result, avg_score, level, grade, conclusion
		FROM candidates.candidate
		WHERE interview_date >= $1 AND interview_date < $2
		ORDER BY interview_date DESC
	`, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	candidates, err := r.scanCandidates(rows)
	if err != nil {
		return nil, err
	}

	for i := range candidates {
		comps, err := r.getCompetencies(ctx, candidates[i].ID)
		if err != nil {
			return nil, err
		}
		candidates[i].Competencies = comps
	}

	return candidates, nil
}

// Add inserts a new candidate with competencies
func (r *CandidatesRepo) Add(ctx context.Context, c *Candidate) error {
	// Calculate avg score and level
	if len(c.Competencies) > 0 {
		total := 0
		for _, comp := range c.Competencies {
			total += comp.Score
		}
		c.AvgScore = math.Round(float64(total)/float64(len(c.Competencies))*10) / 10
		c.Level, c.Grade = levelFromScore(c.AvgScore)
	}

	err := Pool.QueryRow(ctx, `
		INSERT INTO candidates.candidate (full_name, interview_date, result, avg_score, level, grade, conclusion)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id
	`, c.Name, c.Date, c.Result, c.AvgScore, c.Level, c.Grade, c.Conclusion).Scan(&c.ID)
	if err != nil {
		return fmt.Errorf("insert candidate: %w", err)
	}

	// Insert competencies
	for i, comp := range c.Competencies {
		_, err := Pool.Exec(ctx, `
			INSERT INTO candidates.competency_score (candidate_id, competency_name, score, comment, sort_order)
			VALUES ($1, $2, $3, $4, $5)
		`, c.ID, comp.Name, comp.Score, comp.Comment, i)
		if err != nil {
			return fmt.Errorf("insert competency: %w", err)
		}
	}

	return nil
}

// Update replaces candidate data
func (r *CandidatesRepo) Update(ctx context.Context, c *Candidate) error {
	if len(c.Competencies) > 0 {
		total := 0
		for _, comp := range c.Competencies {
			total += comp.Score
		}
		c.AvgScore = math.Round(float64(total)/float64(len(c.Competencies))*10) / 10
		c.Level, c.Grade = levelFromScore(c.AvgScore)
	}

	_, err := Pool.Exec(ctx, `
		UPDATE candidates.candidate
		SET full_name = $2, interview_date = $3, result = $4, avg_score = $5,
		    level = $6, grade = $7, conclusion = $8, updated_at = NOW()
		WHERE id = $1
	`, c.ID, c.Name, c.Date, c.Result, c.AvgScore, c.Level, c.Grade, c.Conclusion)
	if err != nil {
		return fmt.Errorf("update candidate: %w", err)
	}

	// Replace competencies
	_, _ = Pool.Exec(ctx, `DELETE FROM candidates.competency_score WHERE candidate_id = $1`, c.ID)
	for i, comp := range c.Competencies {
		_, err := Pool.Exec(ctx, `
			INSERT INTO candidates.competency_score (candidate_id, competency_name, score, comment, sort_order)
			VALUES ($1, $2, $3, $4, $5)
		`, c.ID, comp.Name, comp.Score, comp.Comment, i)
		if err != nil {
			return fmt.Errorf("insert competency on update: %w", err)
		}
	}

	return nil
}

// UpdateConclusion updates only the conclusion field
func (r *CandidatesRepo) UpdateConclusion(ctx context.Context, id string, conclusion string) error {
	_, err := Pool.Exec(ctx, `
		UPDATE candidates.candidate SET conclusion = $2, updated_at = NOW() WHERE id = $1
	`, id, conclusion)
	return err
}

// Delete removes a candidate
func (r *CandidatesRepo) Delete(ctx context.Context, id string) error {
	_, err := Pool.Exec(ctx, `DELETE FROM candidates.candidate WHERE id = $1`, id)
	return err
}

func (r *CandidatesRepo) getCompetencies(ctx context.Context, candidateID string) ([]Competency, error) {
	rows, err := Pool.Query(ctx, `
		SELECT competency_name, score, comment
		FROM candidates.competency_score
		WHERE candidate_id = $1
		ORDER BY sort_order
	`, candidateID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comps []Competency
	for rows.Next() {
		var c Competency
		if err := rows.Scan(&c.Name, &c.Score, &c.Comment); err != nil {
			return nil, err
		}
		comps = append(comps, c)
	}
	return comps, nil
}

func (r *CandidatesRepo) scanCandidates(rows pgx.Rows) ([]Candidate, error) {
	var candidates []Candidate
	for rows.Next() {
		var c Candidate
		var conclusion *string
		if err := rows.Scan(&c.ID, &c.Name, &c.Date, &c.Result, &c.AvgScore, &c.Level, &c.Grade, &conclusion); err != nil {
			return nil, err
		}
		if conclusion != nil {
			c.Conclusion = *conclusion
		}
		candidates = append(candidates, c)
	}
	return candidates, rows.Err()
}

func levelFromScore(avg float64) (string, int) {
	switch {
	case avg >= 8:
		return "Teamlead+", 8
	case avg >= 7:
		return "Teamlead", 9
	case avg >= 6:
		return "Senior+", 10
	case avg >= 5:
		return "Senior", 11
	case avg >= 4:
		return "Middle+", 12
	case avg >= 3:
		return "Middle", 13
	case avg >= 2:
		return "Junior+", 14
	default:
		return "Junior", 15
	}
}
