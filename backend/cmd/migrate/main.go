package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"time"

	"github.com/timurberkenov-lgtm/qa-dashboards/backend/internal/db"
)

type OldCandidate struct {
	ID           string          `json:"id"`
	Name         string          `json:"name"`
	Date         time.Time       `json:"date"`
	Conclusion   string          `json:"conclusion"`
	Result       string          `json:"result"`
	Competencies []OldCompetency `json:"competencies"`
	AvgScore     float64         `json:"avg_score"`
	Level        string          `json:"level"`
	Grade        int             `json:"grade"`
}

type OldCompetency struct {
	Name    string `json:"name"`
	Score   int    `json:"score"`
	Comment string `json:"comment"`
}

type OldMRUser struct {
	Username     string   `json:"username"`
	Name         string   `json:"name"`
	Email        string   `json:"email"`
	GitLabGroups []string `json:"gitlab_groups"`
}

func main() {
	log.Println("Starting migration from JSON to PostgreSQL...")

	if err := db.Connect("localhost", 5432, "postgres", "537696", "dashboards"); err != nil {
		log.Fatalf("DB connection failed: %v", err)
	}
	defer db.Close()

	ctx := context.Background()

	// Migrate candidates
	migreateCandidates(ctx)

	// Migrate MR users
	migrateMRUsers(ctx)

	log.Println("Migration complete!")
}

func migreateCandidates(ctx context.Context) {
	data, err := os.ReadFile("data/candidates.json")
	if err != nil {
		log.Printf("No candidates.json found, skipping: %v", err)
		return
	}

	var oldCandidates []OldCandidate
	if err := json.Unmarshal(data, &oldCandidates); err != nil {
		log.Fatalf("Failed to parse candidates.json: %v", err)
	}

	repo := db.NewCandidatesRepo()
	migrated := 0

	for _, old := range oldCandidates {
		var comps []db.Competency
		for _, c := range old.Competencies {
			comps = append(comps, db.Competency{Name: c.Name, Score: c.Score, Comment: c.Comment})
		}

		candidate := &db.Candidate{
			Name:         old.Name,
			Date:         old.Date,
			Result:       old.Result,
			Conclusion:   old.Conclusion,
			Competencies: comps,
		}

		if err := repo.Add(ctx, candidate); err != nil {
			log.Printf("Failed to migrate candidate %s: %v", old.Name, err)
			continue
		}
		migrated++
	}

	log.Printf("Candidates migrated: %d/%d", migrated, len(oldCandidates))
}

func migrateMRUsers(ctx context.Context) {
	data, err := os.ReadFile("data/mr_users.json")
	if err != nil {
		log.Printf("No mr_users.json found, skipping: %v", err)
		return
	}

	var oldUsers []OldMRUser
	if err := json.Unmarshal(data, &oldUsers); err != nil {
		log.Fatalf("Failed to parse mr_users.json: %v", err)
	}

	repo := db.NewMRUsersRepo()
	migrated := 0

	for _, old := range oldUsers {
		groups := old.GitLabGroups
		if groups == nil {
			groups = []string{}
		}

		user := &db.TrackedUser{
			Username:     old.Username,
			DisplayName:  old.Name,
			Email:        old.Email,
			GitLabGroups: groups,
		}

		if err := repo.Add(ctx, user); err != nil {
			log.Printf("Failed to migrate MR user %s: %v", old.Username, err)
			continue
		}
		migrated++
	}

	log.Printf("MR users migrated: %d/%d", migrated, len(oldUsers))
}
