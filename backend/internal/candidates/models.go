package candidates

import "time"

// Competency represents a single skill assessment
type Competency struct {
	Name    string `json:"name"`
	Score   int    `json:"score"`   // 1-8
	Comment string `json:"comment"`
}

// Candidate represents an interview result
type Candidate struct {
	ID           string       `json:"id"`
	Name         string       `json:"name"`
	Date         time.Time    `json:"date"`
	Conclusion   string       `json:"conclusion"`
	Result       string       `json:"result"` // "accepted", "rejected", "accepted_no_sb"
	Competencies []Competency `json:"competencies"`
	AvgScore     float64      `json:"avg_score"`
	Level        string       `json:"level"` // Junior, Junior+, Middle, Middle+, Senior, etc.
	Grade        int          `json:"grade"` // 8-15
}

// Stats holds aggregated interview statistics
type Stats struct {
	Total      int     `json:"total"`
	Accepted   int     `json:"accepted"`
	Rejected   int     `json:"rejected"`
	NoSB       int     `json:"no_sb"` // passed interview but failed security check
	Conversion float64 `json:"conversion"` // accepted / total * 100
	AvgScore   float64 `json:"avg_score"`
}

// Response is the API response for candidates page
type Response struct {
	Candidates []Candidate `json:"candidates"`
	Stats      Stats       `json:"stats"`
	Conclusion string      `json:"conclusion"`
}

// DefaultCompetencies is the list of competencies used in interviews
var DefaultCompetencies = []string{
	"Способы интеграции систем",
	"Проектирование интеграций (SOAP, REST, gRPC, очереди)",
	"Описание ТЗ на разработку",
	"Проектирование БД (SQL, связи, индексы, нормализация)",
	"Синхронное/асинхронное взаимодействие",
	"Брокеры сообщений (Kafka/RabbitMQ)",
	"Разбор архитектуры (монолит/микросервис/SOA)",
}

// DefaultCompetenciesEN is the English translation of competency names
var DefaultCompetenciesEN = []string{
	"System Integration Methods",
	"Integration Design (SOAP, REST, gRPC, queues)",
	"Writing Technical Specs",
	"DB Design (SQL, relations, indexes, normalization)",
	"Sync/Async Communication",
	"Message Brokers (Kafka/RabbitMQ)",
	"Architecture Analysis (monolith/microservice/SOA)",
}

// LevelFromScore calculates level from average score
func LevelFromScore(avg float64) (string, int) {
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
