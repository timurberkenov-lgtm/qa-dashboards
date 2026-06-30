package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"

	"gopkg.in/yaml.v3"
)

const gitlabToken = "cB4yhphUul6x8K1Xk7vrsW86MQp1OjEzMAk.01.0z04f0zsp"
const gitlabBaseURL = "https://gitlab.fortebank.com/api/v4"
const contractsGroup = "phoenix/backend/shared/contracts"

// ReviewRequest is the incoming request body
type ReviewRequest struct {
	ProjectPath  string `json:"project_path"`  // e.g. "phoenix/backend/shared/contracts/cards-api-contracts"
	MRIid        int    `json:"mr_iid"`        // MR number
	SourceBranch string `json:"source_branch"` // auto-fetched if empty
	TargetBranch string `json:"target_branch"` // auto-fetched if empty
	Force        bool   `json:"force"`         // force re-review ignoring cache
	CommitSHA    string `json:"commit_sha"`    // specific commit to review (optional, defaults to branch HEAD)
}

// ReviewFinding is a single validation finding
type ReviewFinding struct {
	ID          string `json:"id"`
	Severity    string `json:"severity"`    // error, recommendation, info
	Location    string `json:"location"`    // e.g. "/api/v1/card/pan → parameter Card_Ext_Id"
	Description string `json:"description"` // human-readable issue
	Rule        string `json:"rule"`        // rule category
	Line        int    `json:"line"`        // line number in the file (0 = unknown)
}

// ReviewResponse is returned to the frontend
type ReviewResponse struct {
	MRTitle      string          `json:"mr_title"`
	MRAuthor     string          `json:"mr_author"`
	SourceBranch string          `json:"source_branch"`
	TargetBranch string          `json:"target_branch"`
	FileName     string          `json:"file_name"`
	Verdict      string          `json:"verdict"`      // "valid", "valid_with_recommendations", "invalid"
	Summary      string          `json:"summary"`      // human-readable verdict
	Findings     []ReviewFinding `json:"findings"`     // errors + recommendations
	Changes      []ReviewFinding `json:"changes"`      // breaking changes vs master (info only)
	Cached       bool            `json:"cached"`       // whether this result came from cache
	UpdatedAt    string          `json:"updated_at"`   // MR last updated timestamp
	CommitSHA    string          `json:"commit_sha"`   // which commit was reviewed
}

// reviewCache stores cached review results keyed by "project_path:mr_iid"
type reviewCacheEntry struct {
	Response  *ReviewResponse
	UpdatedAt string // MR updated_at at time of review
}

var (
	reviewCacheMu    sync.RWMutex
	reviewCacheStore = make(map[string]*reviewCacheEntry)
)

// OpenAPISpec is a minimal parse of an OpenAPI 3.x YAML file
type OpenAPISpec struct {
	OpenAPI    string                 `yaml:"openapi"`
	Info       map[string]interface{} `yaml:"info"`
	Paths      map[string]interface{} `yaml:"paths"`
	Components struct {
		Schemas         map[string]interface{} `yaml:"schemas"`
		Parameters      map[string]interface{} `yaml:"parameters"`
		SecuritySchemes map[string]interface{} `yaml:"securitySchemes"`
	} `yaml:"components"`
}

func (h *Handler) handleMRReview(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ReviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.ProjectPath == "" || req.MRIid == 0 {
		http.Error(w, "project_path and mr_iid are required", http.StatusBadRequest)
		return
	}

	cacheKey := fmt.Sprintf("%s:%d:%s", req.ProjectPath, req.MRIid, req.CommitSHA)

	// 1. Fetch MR metadata (always — to check updated_at)
	encodedPath := url.PathEscape(req.ProjectPath)
	mrURL := fmt.Sprintf("%s/projects/%s/merge_requests/%d", gitlabBaseURL, encodedPath, req.MRIid)
	mrData, err := gitlabGet(mrURL)
	if err != nil {
		http.Error(w, "Failed to fetch MR: "+err.Error(), http.StatusBadGateway)
		return
	}

	var mrMeta struct {
		Title  string `json:"title"`
		Author struct {
			Name string `json:"name"`
		} `json:"author"`
		SourceBranch string `json:"source_branch"`
		TargetBranch string `json:"target_branch"`
		UpdatedAt    string `json:"updated_at"`
	}
	json.Unmarshal(mrData, &mrMeta)

	// 2. Check cache (unless force=true)
	if !req.Force {
		reviewCacheMu.RLock()
		cached, exists := reviewCacheStore[cacheKey]
		reviewCacheMu.RUnlock()

		if exists && cached.UpdatedAt == mrMeta.UpdatedAt {
			// MR hasn't changed — return cached result
			resp := *cached.Response
			resp.Cached = true
			writeJSON(w, resp)
			return
		}
	}

	sourceBranch := mrMeta.SourceBranch
	targetBranch := mrMeta.TargetBranch

	// 2. Fetch changed files list
	changesURL := fmt.Sprintf("%s/projects/%s/merge_requests/%d/changes", gitlabBaseURL, encodedPath, req.MRIid)
	changesData, err := gitlabGet(changesURL)
	if err != nil {
		http.Error(w, "Failed to fetch MR changes: "+err.Error(), http.StatusBadGateway)
		return
	}

	var changesResp struct {
		Changes []struct {
			NewPath string `json:"new_path"`
			OldPath string `json:"old_path"`
			NewFile bool   `json:"new_file"`
		} `json:"changes"`
	}
	json.Unmarshal(changesData, &changesResp)

	// Find YAML files
	var yamlFile string
	for _, ch := range changesResp.Changes {
		if strings.HasSuffix(ch.NewPath, ".yaml") || strings.HasSuffix(ch.NewPath, ".yml") {
			yamlFile = ch.NewPath
			break
		}
	}

	if yamlFile == "" {
		resp := ReviewResponse{
			MRTitle:      mrMeta.Title,
			MRAuthor:     mrMeta.Author.Name,
			SourceBranch: sourceBranch,
			TargetBranch: targetBranch,
			Summary:      "No YAML files found in this MR",
		}
		writeJSON(w, resp)
		return
	}

	// 3. Fetch source and target file content
	encodedFile := url.PathEscape(yamlFile)
	// Use commit_sha if provided, otherwise use source branch HEAD
	sourceRef := sourceBranch
	if req.CommitSHA != "" {
		sourceRef = req.CommitSHA
	}
	sourceURL := fmt.Sprintf("%s/projects/%s/repository/files/%s/raw?ref=%s", gitlabBaseURL, encodedPath, encodedFile, url.QueryEscape(sourceRef))
	targetURL := fmt.Sprintf("%s/projects/%s/repository/files/%s/raw?ref=%s", gitlabBaseURL, encodedPath, encodedFile, url.QueryEscape(targetBranch))

	sourceContent, err := gitlabGet(sourceURL)
	if err != nil {
		// If source branch deleted (merged MR), try target branch
		sourceURL = fmt.Sprintf("%s/projects/%s/repository/files/%s/raw?ref=%s", gitlabBaseURL, encodedPath, encodedFile, url.QueryEscape(targetBranch))
		sourceContent, err = gitlabGet(sourceURL)
		if err != nil {
			http.Error(w, "Failed to fetch source file: "+err.Error(), http.StatusBadGateway)
			return
		}
		sourceRef = targetBranch
	}

	targetContent, _ := gitlabGet(targetURL) // may not exist if new file

	// 4. Parse and validate
	var sourceSpec, targetSpec OpenAPISpec
	if err := yaml.Unmarshal(sourceContent, &sourceSpec); err != nil {
		resp := ReviewResponse{
			MRTitle:      mrMeta.Title,
			MRAuthor:     mrMeta.Author.Name,
			SourceBranch: sourceBranch,
			TargetBranch: targetBranch,
			FileName:     yamlFile,
			Findings: []ReviewFinding{{
				ID:          "S1",
				Severity:    "critical",
				Location:    yamlFile,
				Description: "Invalid YAML: " + err.Error(),
				Rule:        "Structure",
			}},
			Summary: "🔴 File is not valid YAML",
		}
		writeJSON(w, resp)
		return
	}

	if len(targetContent) > 0 {
		yaml.Unmarshal(targetContent, &targetSpec)
	}

	findings := validateOpenAPI(&sourceSpec, &targetSpec, yamlFile, sourceContent)

	// Separate findings: errors/recommendations vs breaking changes (info)
	var mainFindings []ReviewFinding
	var changes []ReviewFinding
	for _, f := range findings {
		if f.Rule == "Compatibility" {
			f.Severity = "info"
			changes = append(changes, f)
		} else {
			mainFindings = append(mainFindings, f)
		}
	}

	// Determine verdict
	errorCount := 0
	recoCount := 0
	for _, f := range mainFindings {
		if f.Severity == "error" {
			errorCount++
		} else {
			recoCount++
		}
	}

	var verdict, summary string
	if errorCount > 0 {
		verdict = "invalid"
		summary = fmt.Sprintf("🔴 Invalid — %d structural errors found, contract cannot be used as-is", errorCount)
	} else if recoCount > 0 {
		verdict = "valid_with_recommendations"
		summary = fmt.Sprintf("✅ Valid — contract is usable. %d recommendations for improvement", recoCount)
	} else {
		verdict = "valid"
		summary = "✅ Valid — contract structure is correct, ready to use"
	}

	resp := ReviewResponse{
		MRTitle:      mrMeta.Title,
		MRAuthor:     mrMeta.Author.Name,
		SourceBranch: sourceBranch,
		TargetBranch: targetBranch,
		FileName:     yamlFile,
		Verdict:      verdict,
		Summary:      summary,
		Findings:     mainFindings,
		Changes:      changes,
		Cached:       false,
		UpdatedAt:    mrMeta.UpdatedAt,
		CommitSHA:    sourceRef,
	}

	// Store in cache
	reviewCacheMu.Lock()
	reviewCacheStore[cacheKey] = &reviewCacheEntry{
		Response:  &resp,
		UpdatedAt: mrMeta.UpdatedAt,
	}
	reviewCacheMu.Unlock()

	writeJSON(w, resp)
}

func validateOpenAPI(source, target *OpenAPISpec, fileName string, rawContent []byte) []ReviewFinding {
	var findings []ReviewFinding
	lines := strings.Split(string(rawContent), "\n")

	// Helper to find line number of a key
	findLine := func(key string) int {
		keyLower := strings.ToLower(strings.TrimSpace(key))
		for i, line := range lines {
			if strings.Contains(strings.ToLower(line), keyLower) {
				return i + 1
			}
		}
		return 0
	}

	// S2: Required blocks — these make contract INVALID
	if source.OpenAPI == "" {
		findings = append(findings, ReviewFinding{"S2", "error", fileName, "Missing 'openapi' version field", "Structure", findLine("openapi:")})
	}
	if source.Info == nil || source.Info["title"] == nil {
		findings = append(findings, ReviewFinding{"S2", "error", fileName, "Missing 'info.title' field", "Structure", findLine("info:")})
	}
	if source.Info != nil && source.Info["version"] == nil {
		findings = append(findings, ReviewFinding{"S2", "error", fileName, "Missing 'info.version' field", "Structure", findLine("info:")})
	}
	if source.Paths == nil || len(source.Paths) == 0 {
		findings = append(findings, ReviewFinding{"S2", "error", fileName, "Missing or empty 'paths' section", "Structure", findLine("paths:")})
	}

	// SEC: securitySchemes.BearerAuth required
	if source.Components.Parameters == nil || !hasBearerAuth(source) {
		findings = append(findings, ReviewFinding{"SEC", "error", fileName, "Missing components.securitySchemes.BearerAuth (JWT auth scheme required)", "Structure", findLine("securitySchemes:")})
	}

	// Collect all $ref targets and defined schemas
	allRefs := collectRefs(source.Paths)
	definedSchemas := map[string]bool{}
	if source.Components.Schemas != nil {
		for name := range source.Components.Schemas {
			definedSchemas[name] = true
		}
	}

	// S3: Broken $ref — makes contract INVALID
	for _, ref := range allRefs {
		if strings.HasPrefix(ref, "#/components/schemas/") {
			schemaName := strings.TrimPrefix(ref, "#/components/schemas/")
			if !definedSchemas[schemaName] {
				findings = append(findings, ReviewFinding{"S3", "error", ref, fmt.Sprintf("Broken $ref: schema '%s' not found in components", schemaName), "Structure", 0})
			}
		}
	}

	// S4: Unused schemas — recommendation
	usedSchemas := map[string]bool{}
	for _, ref := range allRefs {
		if strings.HasPrefix(ref, "#/components/schemas/") {
			usedSchemas[strings.TrimPrefix(ref, "#/components/schemas/")] = true
		}
	}
	if source.Components.Schemas != nil {
		schemaRefs := collectRefs(source.Components.Schemas)
		for _, ref := range schemaRefs {
			if strings.HasPrefix(ref, "#/components/schemas/") {
				usedSchemas[strings.TrimPrefix(ref, "#/components/schemas/")] = true
			}
		}
	}
	for name := range definedSchemas {
		if !usedSchemas[name] {
			findings = append(findings, ReviewFinding{"S4", "recommendation", "components/schemas/" + name, fmt.Sprintf("Schema '%s' defined but never referenced", name), "Structure", findLine(name + ":")})
		}
	}

	// Validate each path
	for pathName, pathObj := range source.Paths {
		pathMap, ok := pathObj.(map[string]interface{})
		if !ok {
			continue
		}

		for method, opObj := range pathMap {
			opMap, ok := opObj.(map[string]interface{})
			if !ok {
				continue
			}
			location := fmt.Sprintf("%s %s", strings.ToUpper(method), pathName)

			// N1: Path should be kebab-case
			segments := strings.Split(pathName, "/")
			for _, seg := range segments {
				if seg == "" || strings.HasPrefix(seg, "{") {
					continue
				}
				if seg != strings.ToLower(seg) || strings.Contains(seg, "_") {
					findings = append(findings, ReviewFinding{"N1", "recommendation", location, fmt.Sprintf("Path segment '%s' should be kebab-case (lowercase, hyphens)", seg), "REST Naming", 0})
					break
				}
			}

			// N2: Collection endpoints should use plural nouns
			if len(segments) >= 4 {
				resource := segments[3]
				exceptions := map[string]bool{"health": true, "auth": true, "login": true, "logout": true, "me": true}
				if resource != "" && !strings.HasPrefix(resource, "{") && !strings.HasSuffix(resource, "s") && !exceptions[resource] {
					findings = append(findings, ReviewFinding{"N2", "recommendation", location, fmt.Sprintf("Resource '%s' should be plural (e.g., '%ss' or use proper plural form)", resource, resource), "REST Naming", 0})
				}
			}

			// N7: Path version prefix
			if !strings.HasPrefix(pathName, "/api/v") {
				findings = append(findings, ReviewFinding{"N7", "recommendation", location, "Path should start with /api/v{N}/", "REST Naming", 0})
			}

			// H1: X-Request-ID required — error (corporate standard)
			hasXRequestID := false
			hasNonStandardRequestID := false
			if params, ok := opMap["parameters"].([]interface{}); ok {
				for _, p := range params {
					pm, ok := p.(map[string]interface{})
					if !ok {
						continue
					}
					// Check $ref containing any variant of request-id/requestid
					if ref, ok := pm["$ref"].(string); ok {
						refLower := strings.ToLower(ref)
						if strings.Contains(refLower, "requestid") || strings.Contains(refLower, "request-id") {
							hasXRequestID = true
							// Check if ref matches exact standard name
							if !strings.Contains(ref, "X-Request-ID") {
								hasNonStandardRequestID = true
							}
						}
					}
					// Check name field for x-request-id (case-insensitive)
					if name, ok := pm["name"].(string); ok {
						nameLower := strings.ToLower(name)
						if nameLower == "x-request-id" || nameLower == "x-requestid" {
							hasXRequestID = true
							if name != "X-Request-ID" {
								hasNonStandardRequestID = true
							}
						}
					}

					// N3: Query/path params should be snake_case
					if in, _ := pm["in"].(string); in == "query" || in == "path" {
						paramName, _ := pm["name"].(string)
						if paramName != "" && !isSnakeCase(paramName) {
							findings = append(findings, ReviewFinding{"N3", "recommendation", location + " → param " + paramName, fmt.Sprintf("Parameter '%s' should be snake_case", paramName), "REST Naming", 0})
						}
					}

					// N9: Header params should be Header-Case
					if in, _ := pm["in"].(string); in == "header" {
						paramName, _ := pm["name"].(string)
						if paramName != "" && strings.Contains(paramName, "_") {
							findings = append(findings, ReviewFinding{"N9", "recommendation", location + " → header " + paramName, fmt.Sprintf("Header parameter '%s' should use Header-Case with hyphens", paramName), "REST Naming", 0})
						}
					}
				}
			}
			if !hasXRequestID {
				findings = append(findings, ReviewFinding{"H1", "error", location, "Missing required X-Request-ID parameter", "Headers", findLine(pathName + ":")})
			} else if hasNonStandardRequestID {
				findings = append(findings, ReviewFinding{"H1", "recommendation", location, "X-Request-ID parameter exists but naming is non-standard (should be exactly 'X-Request-ID')", "Headers", findLine("x-request-id")})
			}

			// H2: Check 500/502 responses
			if responses, ok := opMap["responses"].(map[string]interface{}); ok {
				if _, has500 := responses["500"]; !has500 {
					findings = append(findings, ReviewFinding{"H2", "recommendation", location, "Missing 500 error response", "Error Responses", findLine(pathName + ":")})
				}
				if _, has502 := responses["502"]; !has502 {
					findings = append(findings, ReviewFinding{"H2", "recommendation", location, "Missing 502 error response", "Error Responses", findLine(pathName + ":")})
				}
			}

			// Check summary for double spaces
			if summary, ok := opMap["summary"].(string); ok {
				if strings.Contains(summary, "  ") {
					findings = append(findings, ReviewFinding{"S1", "recommendation", location + " → summary", "Double space in summary text", "Structure", 0})
				}
			}
		}
	}

	// N5: Schema names should be PascalCase
	for name := range definedSchemas {
		if len(name) > 0 && (name[0] < 'A' || name[0] > 'Z') {
			findings = append(findings, ReviewFinding{"N5", "recommendation", "components/schemas/" + name, fmt.Sprintf("Schema '%s' should be PascalCase", name), "REST Naming", findLine(name + ":")})
		}
	}

	// N4: Schema properties naming (snake_case) — applies to request and response bodies
	if source.Components.Schemas != nil {
		for schemaName, schemaObj := range source.Components.Schemas {
			schemaMap, ok := schemaObj.(map[string]interface{})
			if !ok {
				continue
			}
			props, ok := schemaMap["properties"].(map[string]interface{})
			if !ok {
				continue
			}
			for propName := range props {
				if !isSnakeCase(propName) {
					findings = append(findings, ReviewFinding{"N4", "recommendation", schemaName + "." + propName, fmt.Sprintf("Property '%s' should be snake_case", propName), "REST Naming", findLine(propName + ":")})
				}
			}
		}
	}

	// D1-D4: Data type validations
	if source.Components.Schemas != nil {
		for schemaName, schemaObj := range source.Components.Schemas {
			schemaMap, ok := schemaObj.(map[string]interface{})
			if !ok {
				continue
			}
			props, ok := schemaMap["properties"].(map[string]interface{})
			if !ok {
				continue
			}
			for propName, propObj := range props {
				propMap, ok := propObj.(map[string]interface{})
				if !ok {
					continue
				}
				// Skip if it's a $ref (validated separately)
				if _, hasRef := propMap["$ref"]; hasRef {
					continue
				}
				propType, _ := propMap["type"].(string)
				propFormat, _ := propMap["format"].(string)
				loc := schemaName + "." + propName

				// D1: Date fields should be integer + int64
				if isDateField(propName) && (propType != "integer" || propFormat != "int64") {
					findings = append(findings, ReviewFinding{"D1", "recommendation", loc, fmt.Sprintf("Date field '%s' should be type:integer format:int64 (timestamp ms)", propName), "Data Types", findLine(propName + ":")})
				}

				// D2: Money fields should be number
				if isMoneyField(propName) && propType != "number" {
					findings = append(findings, ReviewFinding{"D2", "recommendation", loc, fmt.Sprintf("Money field '%s' should be type:number", propName), "Data Types", findLine(propName + ":")})
				}

				// D3: URL fields should have format: uri
				if isURLField(propName) && propFormat != "uri" {
					findings = append(findings, ReviewFinding{"D3", "recommendation", loc, fmt.Sprintf("URL field '%s' should have format:uri", propName), "Data Types", findLine(propName + ":")})
				}

				// D4: Enum must not be empty
				if enum, ok := propMap["enum"].([]interface{}); ok && len(enum) == 0 {
					findings = append(findings, ReviewFinding{"D4", "recommendation", loc, fmt.Sprintf("Enum for '%s' is empty — must contain at least 1 value", propName), "Data Types", findLine(propName + ":")})
				}
			}
		}
	}

	// BC: Breaking changes (compare with target) — these go to "changes" section
	if target != nil && target.Paths != nil {
		// BC1: Removed paths
		for path := range target.Paths {
			if _, exists := source.Paths[path]; !exists {
				findings = append(findings, ReviewFinding{"BC1", "critical", path, fmt.Sprintf("Path '%s' was removed — BREAKING CHANGE", path), "Compatibility", 0})
			}
		}

		// BC2: Removed schema fields
		if target.Components.Schemas != nil && source.Components.Schemas != nil {
			for schemaName, targetSchemaObj := range target.Components.Schemas {
				sourceSchemaObj, exists := source.Components.Schemas[schemaName]
				if !exists {
					findings = append(findings, ReviewFinding{"BC2", "critical", "components/schemas/" + schemaName, fmt.Sprintf("Schema '%s' was removed — BREAKING CHANGE", schemaName), "Compatibility", 0})
					continue
				}
				targetMap, _ := targetSchemaObj.(map[string]interface{})
				sourceMap, _ := sourceSchemaObj.(map[string]interface{})
				if targetMap == nil || sourceMap == nil {
					continue
				}
				targetProps, _ := targetMap["properties"].(map[string]interface{})
				sourceProps, _ := sourceMap["properties"].(map[string]interface{})
				if targetProps != nil && sourceProps != nil {
					for propName := range targetProps {
						if _, exists := sourceProps[propName]; !exists {
							findings = append(findings, ReviewFinding{"BC2", "critical", schemaName + "." + propName, fmt.Sprintf("Field '%s' removed from schema '%s' — BREAKING CHANGE", propName, schemaName), "Compatibility", 0})
						}
					}
				}

				// BC3: Type changes
				if targetProps != nil && sourceProps != nil {
					for propName, targetPropObj := range targetProps {
						sourcePropObj, exists := sourceProps[propName]
						if !exists {
							continue
						}
						targetProp, _ := targetPropObj.(map[string]interface{})
						sourceProp, _ := sourcePropObj.(map[string]interface{})
						if targetProp == nil || sourceProp == nil {
							continue
						}
						targetType, _ := targetProp["type"].(string)
						sourceType, _ := sourceProp["type"].(string)
						if targetType != "" && sourceType != "" && targetType != sourceType {
							findings = append(findings, ReviewFinding{"BC3", "critical", schemaName + "." + propName, fmt.Sprintf("Type changed from '%s' to '%s' — BREAKING CHANGE", targetType, sourceType), "Compatibility", 0})
						}
					}
				}
			}
		}
	}

	return findings
}

// hasBearerAuth checks if securitySchemes contains BearerAuth
func hasBearerAuth(spec *OpenAPISpec) bool {
	if spec.Components.SecuritySchemes == nil {
		return false
	}
	_, ok := spec.Components.SecuritySchemes["BearerAuth"]
	return ok
}

// isDateField checks if a property name represents a date/timestamp
func isDateField(name string) bool {
	n := strings.ToLower(name)
	return strings.HasSuffix(n, "_date") || strings.HasSuffix(n, "_at") ||
		strings.Contains(n, "date_") || n == "due_date" || n == "created_at" ||
		n == "updated_at" || n == "expiration_date" || n == "open_date"
}

// isMoneyField checks if a property name represents money
func isMoneyField(name string) bool {
	n := strings.ToLower(name)
	// Exclude formatted display fields (they are strings like "100.61 $")
	if strings.HasPrefix(n, "formatted_") {
		return false
	}
	return strings.HasSuffix(n, "_amount") || n == "amount" || n == "balance" ||
		n == "credit_limit" || n == "overdraft_amount"
}

// isURLField checks if a property name represents a URL
func isURLField(name string) bool {
	n := strings.ToLower(name)
	return strings.HasSuffix(n, "_url") || n == "icon_url" || n == "url" ||
		strings.Contains(n, "link")
}

// isSnakeCase checks if a string follows snake_case convention
// Valid: "card_state", "external_id", "id", "pan"
// Invalid: "cardState" (camelCase), "Card_State" (uppercase), "card-state" (kebab)
func isSnakeCase(s string) bool {
	if s == "" {
		return true
	}
	for _, c := range s {
		if c >= 'A' && c <= 'Z' {
			return false // has uppercase
		}
		if c == '-' {
			return false // has hyphens
		}
	}
	// Check for camelCase pattern: lowercase followed by uppercase wouldn't exist
	// since we already checked for uppercase. So just ensure it uses underscores for compound words.
	return true
}

// looksLikeCamelCase detects if a lowercase string is likely camelCase without separators
// e.g. "cardstate" when it should be "card_state"
// We can't reliably detect this without a dictionary, so we skip this check
// and only flag obvious violations (uppercase, hyphens)

// collectRefs recursively finds all $ref values in a structure
func collectRefs(obj interface{}) []string {
	var refs []string
	switch v := obj.(type) {
	case map[string]interface{}:
		for key, val := range v {
			if key == "$ref" {
				if s, ok := val.(string); ok {
					refs = append(refs, s)
				}
			} else {
				refs = append(refs, collectRefs(val)...)
			}
		}
	case []interface{}:
		for _, item := range v {
			refs = append(refs, collectRefs(item)...)
		}
	}
	return refs
}

func gitlabGet(url string) ([]byte, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("PRIVATE-TOKEN", gitlabToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}

	return io.ReadAll(resp.Body)
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(v)
}

// handleMRCommits returns the list of commits in a MR
func (h *Handler) handleMRCommits(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")

	projectPath := r.URL.Query().Get("project_path")
	mrIid := r.URL.Query().Get("mr_iid")

	if projectPath == "" || mrIid == "" {
		http.Error(w, "project_path and mr_iid are required", http.StatusBadRequest)
		return
	}

	encodedPath := url.PathEscape(projectPath)
	commitsURL := fmt.Sprintf("%s/projects/%s/merge_requests/%s/commits", gitlabBaseURL, encodedPath, mrIid)

	data, err := gitlabGet(commitsURL)
	if err != nil {
		http.Error(w, "Failed to fetch commits: "+err.Error(), http.StatusBadGateway)
		return
	}

	var commits []struct {
		ID        string `json:"id"`
		ShortID   string `json:"short_id"`
		Title     string `json:"title"`
		CreatedAt string `json:"created_at"`
	}
	json.Unmarshal(data, &commits)

	type CommitInfo struct {
		SHA       string `json:"sha"`
		ShortSHA  string `json:"short_sha"`
		Title     string `json:"title"`
		CreatedAt string `json:"created_at"`
	}

	var result []CommitInfo
	for _, c := range commits {
		result = append(result, CommitInfo{
			SHA:       c.ID,
			ShortSHA:  c.ShortID,
			Title:     c.Title,
			CreatedAt: c.CreatedAt,
		})
	}

	writeJSON(w, result)
}
