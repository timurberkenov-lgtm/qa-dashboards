package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/timurberkenov-lgtm/qa-dashboards/backend/internal/api"
	"github.com/timurberkenov-lgtm/qa-dashboards/backend/internal/config"
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

	log.Printf("Starting QA Dashboard server on port %d", cfg.Server.Port)
	log.Printf("Poll interval: %v", cfg.Server.PollInterval)
	log.Printf("Monitoring %d employees", len(cfg.Employees))

	handler := api.NewHandler(cfg)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	// Serve frontend static files
	fs := http.FileServer(http.Dir("../frontend"))
	mux.Handle("/", fs)

	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	log.Printf("Server listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
