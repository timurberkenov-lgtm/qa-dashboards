package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"

	"github.com/timurberkenov-lgtm/qa-dashboards/backend/internal/db"
	"github.com/timurberkenov-lgtm/qa-dashboards/backend/internal/models"
)

// MRUser represents a user tracked in the MR section
type MRUser struct {
	Username    string   `json:"username"`     // GitLab username (e.g. "AShenessary")
	Name        string   `json:"name"`         // Display name (e.g. "Шенесары Арайлым")
	Email       string   `json:"email"`        // e.g. "AShenessary@Fortebank.com"
	GitLabGroups []string `json:"gitlab_groups"` // groups to search MRs in
}

var (
	mrUsersMu   sync.RWMutex
	mrUsersPath = "data/mr_users.json"
)

func loadMRUsers() ([]MRUser, error) {
	mrUsersMu.RLock()
	defer mrUsersMu.RUnlock()

	data, err := os.ReadFile(mrUsersPath)
	if err != nil {
		if os.IsNotExist(err) {
			return []MRUser{}, nil
		}
		return nil, err
	}

	var users []MRUser
	if err := json.Unmarshal(data, &users); err != nil {
		return nil, err
	}
	return users, nil
}

func saveMRUsers(users []MRUser) error {
	mrUsersMu.Lock()
	defer mrUsersMu.Unlock()

	data, err := json.MarshalIndent(users, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(mrUsersPath, data, 0644)
}

// Convert MRUser to Employee model for use with GitLab collector
func (u MRUser) ToEmployee() models.Employee {
	return models.Employee{
		Name:         u.Name,
		Email:        u.Email,
		GitLabGroups: u.GitLabGroups,
	}
}

// handleMRUsers returns the list of additional MR users
func (h *Handler) handleMRUsers(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	switch r.Method {
	case http.MethodGet:
		if db.Pool != nil {
			repo := db.NewMRUsersRepo()
			users, err := repo.GetAll(context.Background())
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			writeJSON(w, users)
		} else {
			users, err := loadMRUsers()
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			writeJSON(w, users)
		}

	case http.MethodPost:
		var user MRUser
		if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
			http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		if user.Username == "" {
			http.Error(w, "username is required", http.StatusBadRequest)
			return
		}
		if user.Email == "" {
			user.Email = user.Username + "@Fortebank.com"
		}

		if db.Pool != nil {
			repo := db.NewMRUsersRepo()
			exists, _ := repo.Exists(context.Background(), user.Username)
			if exists {
				http.Error(w, "User already exists", http.StatusConflict)
				return
			}
			groups := user.GitLabGroups
			if groups == nil {
				groups = []string{}
			}
			err := repo.Add(context.Background(), &db.TrackedUser{
				Username: user.Username, DisplayName: user.Name, Email: user.Email, GitLabGroups: groups,
			})
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		} else {
			users, _ := loadMRUsers()
			for _, u := range users {
				if strings.EqualFold(u.Username, user.Username) {
					http.Error(w, "User already exists", http.StatusConflict)
					return
				}
			}
			users = append(users, user)
			if err := saveMRUsers(users); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}

		h.mu.Lock()
		for key := range h.cache {
			if strings.HasPrefix(key, "mr:") {
				delete(h.cache, key)
			}
		}
		h.mu.Unlock()

		writeJSON(w, map[string]string{"status": "ok", "message": "User added"})

	case http.MethodDelete:
		username := r.URL.Query().Get("username")
		if username == "" {
			http.Error(w, "username query param required", http.StatusBadRequest)
			return
		}

		if db.Pool != nil {
			repo := db.NewMRUsersRepo()
			if err := repo.Delete(context.Background(), username); err != nil {
				http.Error(w, err.Error(), http.StatusNotFound)
				return
			}
		} else {
			users, _ := loadMRUsers()
			var filtered []MRUser
			found := false
			for _, u := range users {
				if strings.EqualFold(u.Username, username) {
					found = true
					continue
				}
				filtered = append(filtered, u)
			}
			if !found {
				http.Error(w, "User not found", http.StatusNotFound)
				return
			}
			if err := saveMRUsers(filtered); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}

		h.mu.Lock()
		for key := range h.cache {
			if strings.HasPrefix(key, "mr:") {
				delete(h.cache, key)
			}
		}
		h.mu.Unlock()

		writeJSON(w, map[string]string{"status": "ok", "message": "User removed"})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleMRUserValidate checks if a GitLab user exists
func (h *Handler) handleMRUserValidate(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")

	username := r.URL.Query().Get("username")
	if username == "" {
		http.Error(w, "username required", http.StatusBadRequest)
		return
	}

	// Call GitLab API to validate user
	userURL := fmt.Sprintf("%s/users?username=%s", gitlabBaseURL, url.QueryEscape(username))
	data, err := gitlabGet(userURL)
	if err != nil {
		writeJSON(w, map[string]interface{}{"exists": false, "error": err.Error()})
		return
	}

	var users []struct {
		ID       int    `json:"id"`
		Username string `json:"username"`
		Name     string `json:"name"`
		State    string `json:"state"`
	}
	json.Unmarshal(data, &users)

	if len(users) == 0 {
		writeJSON(w, map[string]interface{}{"exists": false})
		return
	}

	writeJSON(w, map[string]interface{}{
		"exists":   true,
		"username": users[0].Username,
		"name":     users[0].Name,
		"state":    users[0].State,
	})
}

// getMRAdditionalUsers returns Employee models for all additional MR users
func getMRAdditionalUsers() []models.Employee {
	// Use DB if available
	if db.Pool != nil {
		repo := db.NewMRUsersRepo()
		users, err := repo.GetAll(context.Background())
		if err == nil {
			var result []models.Employee
			for _, u := range users {
				result = append(result, models.Employee{
					Name:         u.DisplayName,
					Email:        u.Email,
					GitLabGroups: u.GitLabGroups,
				})
			}
			return result
		}
	}

	// Fallback to JSON
	users, _ := loadMRUsers()
	var result []models.Employee
	for _, u := range users {
		result = append(result, u.ToEmployee())
	}
	return result
}
