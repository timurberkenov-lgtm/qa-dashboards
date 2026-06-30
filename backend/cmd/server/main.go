package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"

	"github.com/timurberkenov-lgtm/qa-dashboards/backend/internal/api"
	"github.com/timurberkenov-lgtm/qa-dashboards/backend/internal/candidates"
	"github.com/timurberkenov-lgtm/qa-dashboards/backend/internal/config"
	"github.com/timurberkenov-lgtm/qa-dashboards/backend/internal/db"
)

func main() {
	configPath := "config.yaml"
	if len(os.Args) > 1 {
		configPath = os.Args[1]
	}

	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Connect to PostgreSQL
	dbHost := envOrDefault("DB_HOST", "localhost")
	dbPort, _ := strconv.Atoi(envOrDefault("DB_PORT", "5432"))
	dbUser := envOrDefault("DB_USER", "postgres")
	dbPassword := envOrDefault("DB_PASSWORD", "537696")
	dbName := envOrDefault("DB_NAME", "dashboards")

	if err := db.Connect(dbHost, dbPort, dbUser, dbPassword, dbName); err != nil {
		log.Printf("WARNING: Database connection failed: %v (falling back to file storage)", err)
	} else {
		defer db.Close()
	}

	log.Printf("Starting QA Dashboard server on port %d", cfg.Server.Port)
	log.Printf("Poll interval: %v", cfg.Server.PollInterval)
	log.Printf("Monitoring %d employees", len(cfg.Employees))

	handler := api.NewHandler(cfg)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	// Candidates: use PostgreSQL if connected, otherwise fallback to JSON
	if db.Pool != nil {
		candidatesDBHandler := candidates.NewDBHandler()
		candidatesDBHandler.RegisterRoutes(mux)
		log.Println("Candidates: using PostgreSQL")
	} else {
		candidatesHandler := candidates.NewHandler("data/candidates.json")
		candidatesHandler.RegisterRoutes(mux)
		log.Println("Candidates: using JSON file (DB not available)")
	}

	// Serve frontend static files with no-cache headers
	fsHandler := http.FileServer(http.Dir("../frontend"))
	mux.Handle("/", noCacheMiddleware(fsHandler))

	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	log.Printf("Server listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func noCacheMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		next.ServeHTTP(w, r)
	})
}

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
