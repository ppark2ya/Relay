package handler_test

import (
	"bytes"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	_ "modernc.org/sqlite"
	"relay/internal/handler"
	"relay/internal/middleware"
	"relay/internal/migration"
)

func qaRouter(t *testing.T) *httptest.Server {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:?_foreign_keys=on")
	if err != nil {
		t.Fatal(err)
	}
	if err = migration.Run(db); err != nil {
		t.Fatal(err)
	}
	h := handler.NewQAHandler(db)
	r := chi.NewRouter()
	r.Use(middleware.WorkspaceID)
	r.Post("/topics", h.CreateTopic)
	r.Delete("/topics/{id}", h.DeleteTopic)
	r.Get("/cases", h.ListCases)
	r.Post("/cases", h.CreateCase)
	r.Put("/cases/{id}", h.UpdateCase)
	r.Get("/cases/{id}/history", h.History)
	return httptest.NewServer(r)
}
func TestQACaseStatusHistoryAndTopicDeletion(t *testing.T) {
	ts := qaRouter(t)
	defer ts.Close()
	res, err := http.Post(ts.URL+"/topics", "application/json", bytes.NewBufferString(`{"name":"Auth","color":"#123456"}`))
	if err != nil || res.StatusCode != 201 {
		t.Fatalf("create topic: %v %v", err, res.Status)
	}
	res.Body.Close()
	res, err = http.Post(ts.URL+"/cases", "application/json", bytes.NewBufferString(`{"title":"Login","topicId":1,"status":"대기","steps":[{"order":1,"action":"open","expectedResult":"shown"}]}`))
	if err != nil || res.StatusCode != 201 {
		t.Fatalf("create case: %v %v", err, res.Status)
	}
	res.Body.Close()
	req, _ := http.NewRequest(http.MethodPut, ts.URL+"/cases/1", bytes.NewBufferString(`{"title":"Login","topicId":1,"status":"완료","steps":[]}`))
	req.Header.Set("Content-Type", "application/json")
	res, err = http.DefaultClient.Do(req)
	if err != nil || res.StatusCode != 200 {
		t.Fatalf("update case: %v %v", err, res.Status)
	}
	res.Body.Close()
	res, err = http.Get(ts.URL + "/cases/1/history")
	if err != nil || res.StatusCode != 200 {
		t.Fatalf("history: %v %v", err, res.Status)
	}
	res.Body.Close()
	req, _ = http.NewRequest(http.MethodDelete, ts.URL+"/topics/1", nil)
	res, err = http.DefaultClient.Do(req)
	if err != nil || res.StatusCode != http.StatusConflict {
		t.Fatalf("topic delete: %v %v", err, res.Status)
	}
	res.Body.Close()
}
