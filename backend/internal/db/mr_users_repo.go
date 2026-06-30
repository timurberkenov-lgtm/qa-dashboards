package db

import (
	"context"
	"fmt"
	"time"
)

// TrackedUser represents a row in mr_users.tracked_user
type TrackedUser struct {
	ID           int       `json:"id"`
	Username     string    `json:"username"`
	DisplayName  string    `json:"name"`
	Email        string    `json:"email"`
	GitLabGroups []string  `json:"gitlab_groups"`
	CreatedAt    time.Time `json:"created_at"`
}

// MRUsersRepo provides database operations for MR tracked users
type MRUsersRepo struct{}

func NewMRUsersRepo() *MRUsersRepo {
	return &MRUsersRepo{}
}

// GetAll returns all tracked users
func (r *MRUsersRepo) GetAll(ctx context.Context) ([]TrackedUser, error) {
	rows, err := Pool.Query(ctx, `
		SELECT id, username, display_name, email, gitlab_groups, created_at
		FROM mr_users.tracked_user
		ORDER BY created_at
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []TrackedUser
	for rows.Next() {
		var u TrackedUser
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.Email, &u.GitLabGroups, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// Add inserts a new tracked user
func (r *MRUsersRepo) Add(ctx context.Context, u *TrackedUser) error {
	_, err := Pool.Exec(ctx, `
		INSERT INTO mr_users.tracked_user (username, display_name, email, gitlab_groups)
		VALUES ($1, $2, $3, $4)
	`, u.Username, u.DisplayName, u.Email, u.GitLabGroups)
	if err != nil {
		return fmt.Errorf("insert tracked user: %w", err)
	}
	return nil
}

// Delete removes a tracked user by username
func (r *MRUsersRepo) Delete(ctx context.Context, username string) error {
	tag, err := Pool.Exec(ctx, `DELETE FROM mr_users.tracked_user WHERE username = $1`, username)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("user not found")
	}
	return nil
}

// Exists checks if a user is already tracked
func (r *MRUsersRepo) Exists(ctx context.Context, username string) (bool, error) {
	var count int
	err := Pool.QueryRow(ctx, `SELECT COUNT(*) FROM mr_users.tracked_user WHERE username = $1`, username).Scan(&count)
	return count > 0, err
}
