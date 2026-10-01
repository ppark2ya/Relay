package handler_test

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"relay/internal/handler"
	"relay/internal/middleware"
	"relay/internal/testutil"

	"github.com/go-chi/chi/v5"
)

const postmanFixture = `{
  "info":{"name":"Rate API","schema":"https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},
  "variable":[{"key":"GW_URL","value":"https://test.example.com"},{"key":"spreadNo","value":"REPLACE_ME"}],
  "item":[
    {"name":"Rates","item":[
      {"name":"Latest rate","request":{"method":"GET","url":"{{GW_URL}}/rates/latest"}},
      {"name":"Create rate","request":{"method":"POST","url":"{{GW_URL}}/rates","header":[{"key":"Content-Type","value":"application/json"}],"body":{"mode":"raw","raw":"{\n  \"currency\": \"USD\"\n}"},"event":[{"listen":"prerequest","script":{"exec":["pm.variables.set('x', '1');"]}},{"listen":"test","script":{"exec":["pm.test('ok', function () {});"]}}]}}
    ]},
    {"name":"Empty folder","item":[]},
    {"name":"Delete rate","request":{"method":"DELETE","url":"{{GW_URL}}/rates/1"}}
  ]
}`

func setupPostmanCollectionServer(t *testing.T) *httptest.Server {
	t.Helper()
	db, queries := testutil.SetupTestDBWithConn(t)
	collectionHandler := handler.NewCollectionHandler(queries, db)
	router := chi.NewRouter()
	router.Use(middleware.WorkspaceID)
	router.Get("/api/collections", collectionHandler.List)
	router.Get("/api/collections/{id}/export/postman", collectionHandler.ExportPostman)
	router.Post("/api/collections/import/postman", collectionHandler.ImportPostman)
	server := httptest.NewServer(router)
	t.Cleanup(server.Close)
	return server
}

func postPostmanCollection(t *testing.T, url, contents string) *http.Response {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "rate-api.postman_collection.json")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write([]byte(contents)); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request, err := http.NewRequest(http.MethodPost, url, &body)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	return response
}

func TestPostmanCollectionImportAndExportRoundTrip(t *testing.T) {
	server := setupPostmanCollectionServer(t)
	response := postPostmanCollection(t, server.URL+"/api/collections/import/postman", postmanFixture)
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("import status: got %d", response.StatusCode)
	}
	var imported struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(response.Body).Decode(&imported); err != nil {
		t.Fatal(err)
	}

	exportResponse, err := http.Get(server.URL + "/api/collections/" + jsonNumber(imported.ID) + "/export/postman")
	if err != nil {
		t.Fatal(err)
	}
	defer exportResponse.Body.Close()
	if exportResponse.StatusCode != http.StatusOK {
		t.Fatalf("export status: got %d", exportResponse.StatusCode)
	}
	var exported struct {
		Info struct {
			Name   string `json:"name"`
			Schema string `json:"schema"`
		} `json:"info"`
		Variable []struct{ Key, Value string } `json:"variable"`
		Item     []struct {
			Name string `json:"name"`
			Item []struct {
				Name    string `json:"name"`
				Request struct {
					Method string                     `json:"method"`
					Body   struct{ Mode, Raw string } `json:"body"`
				} `json:"request"`
			} `json:"item"`
		} `json:"item"`
	}
	exportedJSON, err := io.ReadAll(exportResponse.Body)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(exportedJSON, &exported); err != nil {
		t.Fatal(err)
	}
	if exported.Info.Name != "Rate API" || exported.Info.Schema != "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" {
		t.Fatalf("unexpected collection info: %#v", exported.Info)
	}
	if len(exported.Variable) != 2 || len(exported.Item) != 3 {
		t.Fatalf("collection structure not preserved: %#v", exported)
	}
	var rates struct {
		Name string `json:"name"`
		Item []struct {
			Name    string `json:"name"`
			Request struct {
				Method string                     `json:"method"`
				Body   struct{ Mode, Raw string } `json:"body"`
			} `json:"request"`
		} `json:"item"`
	}
	for _, item := range exported.Item {
		if item.Name == "Rates" {
			encoded, _ := json.Marshal(item)
			if err := json.Unmarshal(encoded, &rates); err != nil {
				t.Fatal(err)
			}
		}
	}
	if len(rates.Item) != 2 {
		t.Fatalf("Rates folder not preserved: %#v", exported.Item)
	}
	createRate := rates.Item[1].Request
	if createRate.Method != "POST" || createRate.Body.Mode != "raw" || createRate.Body.Raw == "" {
		t.Fatalf("raw JSON request not preserved: %#v", createRate)
	}

	response = postPostmanCollection(t, server.URL+"/api/collections/import/postman", string(exportedJSON))
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("second import status: got %d", response.StatusCode)
	}
}

func TestPostmanCollectionImportRejectsInvalidSchema(t *testing.T) {
	server := setupPostmanCollectionServer(t)
	response := postPostmanCollection(t, server.URL+"/api/collections/import/postman", `{"info":{"name":"bad","schema":"v2.0"},"item":[]}`)
	defer response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid schema status: got %d", response.StatusCode)
	}
}

func jsonNumber(value int64) string {
	encoded, _ := json.Marshal(value)
	return string(encoded)
}
