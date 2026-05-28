package handler_test

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"relay/internal/handler"
	"relay/internal/middleware"
	"relay/internal/testutil"

	"github.com/go-chi/chi/v5"
)

func setupErdTestServer(t *testing.T) *httptest.Server {
	t.Helper()

	_, q := testutil.SetupTestDBWithConn(t)
	erdH := handler.NewErdHandler(q)

	r := chi.NewRouter()
	r.Use(middleware.WorkspaceID)

	r.Get("/api/erds", erdH.List)
	r.Post("/api/erds", erdH.Create)
	r.Get("/api/erds/{id}", erdH.Get)
	r.Put("/api/erds/{id}", erdH.Update)
	r.Delete("/api/erds/{id}", erdH.Delete)
	r.Post("/api/erds/{id}/duplicate", erdH.Duplicate)
	r.Put("/api/erds/reorder", erdH.Reorder)
	r.Post("/api/erds/preview", erdH.Preview)
	r.Post("/api/erds/generate/kotlin", erdH.GenerateKotlin)
	r.Post("/api/erds/generate/java", erdH.GenerateJava)

	ts := httptest.NewServer(r)
	t.Cleanup(ts.Close)
	return ts
}

func TestErd_CRUD(t *testing.T) {
	ts := setupErdTestServer(t)

	resp, err := postJSON(ts.URL+"/api/erds", `{"name":"Commerce","dsl":"{\"entities\":[]}"}`)
	if err != nil {
		t.Fatalf("create ERD: %v", err)
	}
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected status 201, got %d", resp.StatusCode)
	}

	var created handler.ErdResponse
	readJSON(t, resp, &created)
	if created.Name != "Commerce" {
		t.Fatalf("expected name Commerce, got %q", created.Name)
	}
	if created.DSL != `{"entities":[]}` {
		t.Fatalf("unexpected DSL: %q", created.DSL)
	}

	resp, err = http.Get(ts.URL + "/api/erds")
	if err != nil {
		t.Fatalf("list ERDs: %v", err)
	}
	var erds []handler.ErdResponse
	readJSON(t, resp, &erds)
	if len(erds) != 1 {
		t.Fatalf("expected 1 ERD, got %d", len(erds))
	}

	resp, err = http.Get(ts.URL + fmt.Sprintf("/api/erds/%d", created.ID))
	if err != nil {
		t.Fatalf("get ERD: %v", err)
	}
	var got handler.ErdResponse
	readJSON(t, resp, &got)
	if got.ID != created.ID {
		t.Fatalf("expected id %d, got %d", created.ID, got.ID)
	}

	resp, err = putJSON(ts.URL+fmt.Sprintf("/api/erds/%d", created.ID), `{"name":"Commerce v2","dsl":"{\"entities\":[{\"name\":\"User\",\"fields\":[{\"name\":\"id\",\"type\":\"Long\",\"id\":true}]}]}"}`)
	if err != nil {
		t.Fatalf("update ERD: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}
	var updated handler.ErdResponse
	readJSON(t, resp, &updated)
	if updated.Name != "Commerce v2" {
		t.Fatalf("expected updated name, got %q", updated.Name)
	}

	req, _ := http.NewRequest("DELETE", ts.URL+fmt.Sprintf("/api/erds/%d", created.ID), nil)
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("delete ERD: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d", resp.StatusCode)
	}

	resp, err = http.Get(ts.URL + fmt.Sprintf("/api/erds/%d", created.ID))
	if err != nil {
		t.Fatalf("get deleted ERD: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 after delete, got %d", resp.StatusCode)
	}
}

func TestErd_DuplicateAndReorder(t *testing.T) {
	ts := setupErdTestServer(t)

	resp, _ := postJSON(ts.URL+"/api/erds", `{"name":"First","dsl":"{\"entities\":[]}"}`)
	var first handler.ErdResponse
	readJSON(t, resp, &first)

	resp, _ = postJSON(ts.URL+"/api/erds", `{"name":"Second","dsl":"{\"entities\":[]}"}`)
	var second handler.ErdResponse
	readJSON(t, resp, &second)

	resp, err := postJSON(ts.URL+fmt.Sprintf("/api/erds/%d/duplicate", first.ID), `{}`)
	if err != nil {
		t.Fatalf("duplicate ERD: %v", err)
	}
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected status 201, got %d", resp.StatusCode)
	}
	var duplicated handler.ErdResponse
	readJSON(t, resp, &duplicated)
	if duplicated.Name != "First Copy" {
		t.Fatalf("expected duplicate name First Copy, got %q", duplicated.Name)
	}

	resp, err = putJSON(ts.URL+"/api/erds/reorder", fmt.Sprintf(`{"orders":[{"id":%d,"sortOrder":1},{"id":%d,"sortOrder":2},{"id":%d,"sortOrder":3}]}`, second.ID, first.ID, duplicated.ID))
	if err != nil {
		t.Fatalf("reorder ERDs: %v", err)
	}
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	resp, err = http.Get(ts.URL + "/api/erds")
	if err != nil {
		t.Fatalf("list reordered ERDs: %v", err)
	}
	var erds []handler.ErdResponse
	readJSON(t, resp, &erds)
	if len(erds) != 3 {
		t.Fatalf("expected 3 ERDs, got %d", len(erds))
	}
	if erds[0].ID != second.ID || erds[1].ID != first.ID || erds[2].ID != duplicated.ID {
		t.Fatalf("unexpected order: %#v", erds)
	}
}

func TestErd_PreviewAndGenerateKotlin(t *testing.T) {
	ts := setupErdTestServer(t)

	dsl := `{
	  "packageName": "com.example.domain",
	  "entities": [
	    { "name": "User", "table": "users", "fields": [{ "name": "id", "type": "Long", "id": true }] },
	    { "name": "Order", "table": "orders", "fields": [{ "name": "id", "type": "Long", "id": true }] }
	  ],
	  "relations": [
	    { "from": "Order", "to": "User", "type": "many-to-one", "field": "user", "joinColumn": "user_id", "nullable": false }
	  ]
	}`

	resp, err := postJSON(ts.URL+"/api/erds/preview", fmt.Sprintf(`{"dsl":%q}`, dsl))
	if err != nil {
		t.Fatalf("preview ERD: %v", err)
	}
	var preview handler.ErdPreviewResponse
	readJSON(t, resp, &preview)
	if len(preview.Diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", preview.Diagnostics)
	}
	if preview.Mermaid == "" {
		t.Fatal("expected Mermaid output")
	}
	if preview.Diagram == nil {
		t.Fatal("expected diagram output")
	}
	if len(preview.Diagram.Entities) != 2 {
		t.Fatalf("expected 2 diagram entities, got %d", len(preview.Diagram.Entities))
	}
	if len(preview.Diagram.Relations) != 1 {
		t.Fatalf("expected 1 diagram relation, got %d", len(preview.Diagram.Relations))
	}
	if len(preview.Diagram.Entities[1].Columns) != 2 {
		t.Fatalf("expected Order diagram entity to include id and FK columns, got %#v", preview.Diagram.Entities[1].Columns)
	}
	fk := preview.Diagram.Entities[1].Columns[1]
	if strings.Join(fk.Keys, ",") != "FK" || fk.Name != "user_id" || fk.Type != "BIGINT" || fk.Nullable {
		t.Fatalf("unexpected FK diagram column: %#v", fk)
	}
	relation := preview.Diagram.Relations[0]
	if relation.From != "Order" || relation.FromCardinality != "O<" || relation.To != "User" || relation.ToCardinality != "||" || relation.Label != "user" {
		t.Fatalf("unexpected diagram relation: %#v", relation)
	}

	resp, err = postJSON(ts.URL+"/api/erds/generate/kotlin", fmt.Sprintf(`{"dsl":%q}`, dsl))
	if err != nil {
		t.Fatalf("generate Kotlin: %v", err)
	}
	var generated handler.ErdKotlinResponse
	readJSON(t, resp, &generated)
	if len(generated.Files) != 2 {
		t.Fatalf("expected 2 generated files, got %d", len(generated.Files))
	}

	resp, err = postJSON(ts.URL+"/api/erds/generate/java", fmt.Sprintf(`{"dsl":%q}`, dsl))
	if err != nil {
		t.Fatalf("generate Java: %v", err)
	}
	var generatedJava handler.ErdGeneratedCodeResponse
	readJSON(t, resp, &generatedJava)
	if len(generatedJava.Files) != 2 {
		t.Fatalf("expected 2 generated Java files, got %d", len(generatedJava.Files))
	}
	if !strings.HasSuffix(generatedJava.Files[0].Path, ".java") {
		t.Fatalf("expected Java file path, got %q", generatedJava.Files[0].Path)
	}
}

func TestErd_GenerateJavaReturnsDiagnosticsForInvalidDSL(t *testing.T) {
	ts := setupErdTestServer(t)

	dsl := `{
	  "entities": [
	    { "name": "Order", "fields": [{ "name": "id", "type": "Long", "id": true }] }
	  ],
	  "relations": [
	    { "from": "Order", "to": "Missing", "type": "many-to-one", "field": "missing" }
	  ]
	}`

	resp, err := postJSON(ts.URL+"/api/erds/generate/java", fmt.Sprintf(`{"dsl":%q}`, dsl))
	if err != nil {
		t.Fatalf("generate Java: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", resp.StatusCode)
	}

	var preview handler.ErdPreviewResponse
	readJSON(t, resp, &preview)
	if len(preview.Diagnostics) == 0 {
		t.Fatal("expected diagnostics for invalid DSL")
	}
}

func TestErd_PreviewReturnsEmptyDiagnosticsArrayForValidDSL(t *testing.T) {
	ts := setupErdTestServer(t)

	dsl := `{
	  "entities": [
	    { "name": "User", "fields": [{ "name": "id", "type": "Long", "id": true }] }
	  ],
	  "relations": []
	}`

	resp, err := postJSON(ts.URL+"/api/erds/preview", fmt.Sprintf(`{"dsl":%q}`, dsl))
	if err != nil {
		t.Fatalf("preview ERD: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read preview response: %v", err)
	}
	if !strings.Contains(string(body), `"diagnostics":[]`) {
		t.Fatalf("expected diagnostics to encode as an empty array, got %s", string(body))
	}
}
