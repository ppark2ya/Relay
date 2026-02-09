package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"relay/internal/repository"
	"relay/internal/testutil"
)

func TestExecuteRequest_GET(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Custom", "test-value")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer ts.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr, nil)

	ctx := context.Background()
	req, err := q.CreateRequest(ctx, repository.CreateRequestParams{
		Name:        "test-get",
		Method:      "GET",
		Url:         ts.URL,
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create request: %v", err)
	}

	result, err := re.Execute(ctx, req.ID, nil, nil)
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	if result.StatusCode != 200 {
		t.Errorf("status: got %d, want 200", result.StatusCode)
	}
	if result.Body != `{"ok":true}` {
		t.Errorf("body: got %q", result.Body)
	}
	if result.Headers["X-Custom"] != "test-value" {
		t.Errorf("header X-Custom: got %q", result.Headers["X-Custom"])
	}
}

func TestExecuteRequest_POSTWithBody(t *testing.T) {
	var receivedBody string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		receivedBody = string(b)
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte("created"))
	}))
	defer ts.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr, nil)

	ctx := context.Background()
	req, err := q.CreateRequest(ctx, repository.CreateRequestParams{
		Name:        "test-post",
		Method:      "POST",
		Url:         ts.URL,
		Body:        sql.NullString{String: `{"name":"relay"}`, Valid: true},
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create request: %v", err)
	}

	result, err := re.Execute(ctx, req.ID, nil, nil)
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	if result.StatusCode != 201 {
		t.Errorf("status: got %d, want 201", result.StatusCode)
	}
	if receivedBody != `{"name":"relay"}` {
		t.Errorf("server received body: %q", receivedBody)
	}
}

func TestExecuteAdhoc(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("adhoc-ok"))
	}))
	defer ts.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr, nil)

	result, err := re.ExecuteAdhoc(context.Background(), "GET", ts.URL, "", "", nil, nil)
	if err != nil {
		t.Fatalf("execute adhoc: %v", err)
	}
	if result.StatusCode != 200 {
		t.Errorf("status: got %d, want 200", result.StatusCode)
	}
	if result.Body != "adhoc-ok" {
		t.Errorf("body: got %q", result.Body)
	}
}

func TestExecute_WithOverrides(t *testing.T) {
	var receivedMethod string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedMethod = r.Method
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer ts.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr, nil)

	ctx := context.Background()
	req, err := q.CreateRequest(ctx, repository.CreateRequestParams{
		Name:        "test-override",
		Method:      "GET",
		Url:         ts.URL,
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create request: %v", err)
	}

	result, err := re.Execute(ctx, req.ID, nil, &RequestOverrides{Method: "PUT"})
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	if result.StatusCode != 200 {
		t.Errorf("status: got %d, want 200", result.StatusCode)
	}
	if receivedMethod != "PUT" {
		t.Errorf("method override: got %q, want PUT", receivedMethod)
	}
}

func TestExecuteRequest_VarSubstitution(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer ts.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr, nil)

	ctx := context.Background()
	req, err := q.CreateRequest(ctx, repository.CreateRequestParams{
		Name:        "test-var",
		Method:      "GET",
		Url:         "{{base_url}}/api",
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create request: %v", err)
	}

	result, err := re.Execute(ctx, req.ID, map[string]string{"base_url": ts.URL}, nil)
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	if result.StatusCode != 200 {
		t.Errorf("status: got %d, want 200", result.StatusCode)
	}
	want := ts.URL + "/api"
	if result.ResolvedURL != want {
		t.Errorf("resolved URL: got %q, want %q", result.ResolvedURL, want)
	}
}

func TestExecuteRequest_InvalidURL(t *testing.T) {
	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr, nil)

	ctx := context.Background()
	req, err := q.CreateRequest(ctx, repository.CreateRequestParams{
		Name:        "test-bad-url",
		Method:      "GET",
		Url:         "://invalid",
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create request: %v", err)
	}

	result, err := re.Execute(ctx, req.ID, nil, nil)
	if err != nil {
		t.Fatalf("execute should not return error, got: %v", err)
	}
	if result.Error == "" {
		t.Error("expected error message for invalid URL")
	}
}

func TestExecuteRequest_HistorySaved(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("history-test"))
	}))
	defer ts.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr, nil)

	ctx := context.Background()
	req, err := q.CreateRequest(ctx, repository.CreateRequestParams{
		Name:        "test-history",
		Method:      "GET",
		Url:         ts.URL,
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create request: %v", err)
	}

	_, err = re.Execute(ctx, req.ID, nil, nil)
	if err != nil {
		t.Fatalf("execute: %v", err)
	}

	histories, err := q.ListHistory(ctx, repository.ListHistoryParams{WorkspaceID: 1, Limit: 10})
	if err != nil {
		t.Fatalf("list history: %v", err)
	}
	if len(histories) != 1 {
		t.Fatalf("history count: got %d, want 1", len(histories))
	}
	if histories[0].Method != "GET" {
		t.Errorf("history method: got %q, want GET", histories[0].Method)
	}
	if histories[0].Url != ts.URL {
		t.Errorf("history url: got %q, want %q", histories[0].Url, ts.URL)
	}
}

// ---------------------------------------------------------------------------
// FormData (multipart/form-data) tests
// ---------------------------------------------------------------------------

// parseMultipartFields is a test helper that reads a multipart request and returns
// text field values and file content keyed by field name.
func parseMultipartFields(t *testing.T, r *http.Request) (fields map[string]string, files map[string][]byte, filenames map[string]string) {
	t.Helper()
	_, params, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil {
		t.Fatalf("parse media type: %v", err)
	}
	reader := multipart.NewReader(r.Body, params["boundary"])

	fields = make(map[string]string)
	files = make(map[string][]byte)
	filenames = make(map[string]string)

	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("next part: %v", err)
		}
		data, _ := io.ReadAll(part)
		if part.FileName() != "" {
			files[part.FormName()] = data
			filenames[part.FormName()] = part.FileName()
		} else {
			fields[part.FormName()] = string(data)
		}
		part.Close()
	}
	return
}

func TestExecuteFormData_TextFields(t *testing.T) {
	var receivedFields map[string]string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ct := r.Header.Get("Content-Type")
		if !strings.HasPrefix(ct, "multipart/form-data") {
			t.Errorf("expected multipart/form-data, got %q", ct)
		}
		fields, _, _ := parseMultipartFields(t, r)
		receivedFields = fields
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer ts.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr, nil)

	items := `[{"key":"name","value":"relay","type":"text","enabled":true},{"key":"version","value":"1.0","type":"text","enabled":true}]`

	ctx := context.Background()
	req, err := q.CreateRequest(ctx, repository.CreateRequestParams{
		Name:        "formdata-text",
		Method:      "POST",
		Url:         ts.URL,
		Body:        sql.NullString{String: items, Valid: true},
		BodyType:    sql.NullString{String: "formdata", Valid: true},
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create request: %v", err)
	}

	result, err := re.Execute(ctx, req.ID, nil, nil)
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	if result.Error != "" {
		t.Fatalf("unexpected error: %s", result.Error)
	}
	if result.StatusCode != 200 {
		t.Errorf("status: got %d, want 200", result.StatusCode)
	}
	if receivedFields["name"] != "relay" {
		t.Errorf("field 'name': got %q, want %q", receivedFields["name"], "relay")
	}
	if receivedFields["version"] != "1.0" {
		t.Errorf("field 'version': got %q, want %q", receivedFields["version"], "1.0")
	}
}

func TestExecuteFormData_WithFiles(t *testing.T) {
	var receivedFields map[string]string
	var receivedFiles map[string][]byte
	var receivedFilenames map[string]string

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedFields, receivedFiles, receivedFilenames = parseMultipartFields(t, r)
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}))
	defer ts.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr, nil)

	items := `[{"key":"title","value":"my doc","type":"text","enabled":true},{"key":"attachment","value":"test.txt","type":"file","enabled":true}]`
	formFiles := map[int]FormDataFile{
		1: {Filename: "test.txt", Data: []byte("hello world")},
	}

	ctx := context.Background()
	req, err := q.CreateRequest(ctx, repository.CreateRequestParams{
		Name:        "formdata-file",
		Method:      "POST",
		Url:         ts.URL,
		Body:        sql.NullString{String: items, Valid: true},
		BodyType:    sql.NullString{String: "formdata", Valid: true},
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create request: %v", err)
	}

	result, err := re.Execute(ctx, req.ID, nil, &RequestOverrides{
		BodyType:      "formdata",
		FormDataFiles: formFiles,
	})
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	if result.Error != "" {
		t.Fatalf("unexpected error: %s", result.Error)
	}
	if result.StatusCode != 200 {
		t.Errorf("status: got %d, want 200", result.StatusCode)
	}
	if receivedFields["title"] != "my doc" {
		t.Errorf("field 'title': got %q, want %q", receivedFields["title"], "my doc")
	}
	if string(receivedFiles["attachment"]) != "hello world" {
		t.Errorf("file 'attachment': got %q, want %q", string(receivedFiles["attachment"]), "hello world")
	}
	if receivedFilenames["attachment"] != "test.txt" {
		t.Errorf("filename: got %q, want %q", receivedFilenames["attachment"], "test.txt")
	}
}

func TestExecuteFormData_DisabledFieldsSkipped(t *testing.T) {
	var receivedFields map[string]string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedFields, _, _ = parseMultipartFields(t, r)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer ts.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr, nil)

	items := `[{"key":"active","value":"yes","type":"text","enabled":true},{"key":"hidden","value":"no","type":"text","enabled":false}]`

	ctx := context.Background()
	req, err := q.CreateRequest(ctx, repository.CreateRequestParams{
		Name:        "formdata-disabled",
		Method:      "POST",
		Url:         ts.URL,
		Body:        sql.NullString{String: items, Valid: true},
		BodyType:    sql.NullString{String: "formdata", Valid: true},
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create request: %v", err)
	}

	result, err := re.Execute(ctx, req.ID, nil, nil)
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	if result.Error != "" {
		t.Fatalf("unexpected error: %s", result.Error)
	}
	if receivedFields["active"] != "yes" {
		t.Errorf("field 'active': got %q, want %q", receivedFields["active"], "yes")
	}
	if _, exists := receivedFields["hidden"]; exists {
		t.Errorf("disabled field 'hidden' should not be sent, got %q", receivedFields["hidden"])
	}
}

func TestExecuteFormData_VarSubstitution(t *testing.T) {
	var receivedFields map[string]string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedFields, _, _ = parseMultipartFields(t, r)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer ts.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr, nil)

	items := `[{"key":"greeting","value":"Hello {{user}}","type":"text","enabled":true}]`

	ctx := context.Background()
	req, err := q.CreateRequest(ctx, repository.CreateRequestParams{
		Name:        "formdata-vars",
		Method:      "POST",
		Url:         ts.URL,
		Body:        sql.NullString{String: items, Valid: true},
		BodyType:    sql.NullString{String: "formdata", Valid: true},
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create request: %v", err)
	}

	result, err := re.Execute(ctx, req.ID, map[string]string{"user": "World"}, nil)
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	if result.Error != "" {
		t.Fatalf("unexpected error: %s", result.Error)
	}
	if receivedFields["greeting"] != "Hello World" {
		t.Errorf("field 'greeting': got %q, want %q", receivedFields["greeting"], "Hello World")
	}
}

func TestExecuteAdhocFormData(t *testing.T) {
	var receivedFields map[string]string
	var receivedFiles map[string][]byte
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedFields, receivedFiles, _ = parseMultipartFields(t, r)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer ts.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr, nil)

	itemsJSON := `[{"key":"field1","value":"val1","type":"text","enabled":true},{"key":"doc","value":"readme.md","type":"file","enabled":true}]`
	formFiles := map[int]FormDataFile{
		1: {Filename: "readme.md", Data: []byte("# README")},
	}

	result, err := re.ExecuteAdhocFormData(context.Background(), "POST", ts.URL, "{}", itemsJSON, nil, nil, formFiles)
	if err != nil {
		t.Fatalf("execute adhoc formdata: %v", err)
	}
	if result.Error != "" {
		t.Fatalf("unexpected error: %s", result.Error)
	}
	if result.StatusCode != 200 {
		t.Errorf("status: got %d, want 200", result.StatusCode)
	}
	if receivedFields["field1"] != "val1" {
		t.Errorf("field1: got %q, want %q", receivedFields["field1"], "val1")
	}
	if string(receivedFiles["doc"]) != "# README" {
		t.Errorf("file 'doc': got %q, want %q", string(receivedFiles["doc"]), "# README")
	}
}

// ---------------------------------------------------------------------------
// FormData with persisted fileId (disk-loaded files)
// ---------------------------------------------------------------------------

func TestExecuteFormData_WithPersistedFileID(t *testing.T) {
	var receivedFields map[string]string
	var receivedFiles map[string][]byte
	var receivedFilenames map[string]string

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedFields, receivedFiles, receivedFilenames = parseMultipartFields(t, r)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer ts.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)

	// Set up file storage with a temp directory
	dir := t.TempDir()
	fileStorage, err := NewFileStorage(dir)
	if err != nil {
		t.Fatalf("NewFileStorage: %v", err)
	}

	re := NewRequestExecutor(q, vr, fileStorage)

	// Store a file to disk and create DB record
	ctx := context.Background()
	storedName, size, err := fileStorage.Store(strings.NewReader("persisted file content"))
	if err != nil {
		t.Fatalf("Store: %v", err)
	}

	uploaded, err := q.CreateUploadedFile(ctx, repository.CreateUploadedFileParams{
		WorkspaceID:  1,
		OriginalName: "report.pdf",
		StoredName:   storedName,
		ContentType:  "application/pdf",
		Size:         size,
	})
	if err != nil {
		t.Fatalf("CreateUploadedFile: %v", err)
	}

	// Body JSON includes fileId instead of runtime file
	items := fmt.Sprintf(
		`[{"key":"title","value":"my report","type":"text","enabled":true},{"key":"doc","value":"report.pdf","type":"file","enabled":true,"fileId":%d,"fileSize":%d}]`,
		uploaded.ID, uploaded.Size,
	)

	req, err := q.CreateRequest(ctx, repository.CreateRequestParams{
		Name:        "formdata-persisted",
		Method:      "POST",
		Url:         ts.URL,
		Body:        sql.NullString{String: items, Valid: true},
		BodyType:    sql.NullString{String: "formdata", Valid: true},
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("CreateRequest: %v", err)
	}

	// Execute WITHOUT runtime FormDataFiles — backend should load from disk via fileId
	result, err := re.Execute(ctx, req.ID, nil, nil)
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	if result.Error != "" {
		t.Fatalf("unexpected error: %s", result.Error)
	}
	if result.StatusCode != 200 {
		t.Errorf("status: got %d, want 200", result.StatusCode)
	}
	if receivedFields["title"] != "my report" {
		t.Errorf("field 'title': got %q, want %q", receivedFields["title"], "my report")
	}
	if string(receivedFiles["doc"]) != "persisted file content" {
		t.Errorf("file 'doc': got %q, want %q", string(receivedFiles["doc"]), "persisted file content")
	}
	if receivedFilenames["doc"] != "report.pdf" {
		t.Errorf("filename: got %q, want %q", receivedFilenames["doc"], "report.pdf")
	}
}

func TestExecuteFormData_RuntimeFileOverridesPersistedFileID(t *testing.T) {
	var receivedFiles map[string][]byte

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, receivedFiles, _ = parseMultipartFields(t, r)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer ts.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)

	dir := t.TempDir()
	fileStorage, err := NewFileStorage(dir)
	if err != nil {
		t.Fatalf("NewFileStorage: %v", err)
	}
	re := NewRequestExecutor(q, vr, fileStorage)

	// Store a file to disk
	ctx := context.Background()
	storedName, size, _ := fileStorage.Store(strings.NewReader("old content"))
	uploaded, _ := q.CreateUploadedFile(ctx, repository.CreateUploadedFileParams{
		WorkspaceID:  1,
		OriginalName: "file.txt",
		StoredName:   storedName,
		ContentType:  "text/plain",
		Size:         size,
	})

	items := fmt.Sprintf(
		`[{"key":"doc","value":"file.txt","type":"file","enabled":true,"fileId":%d}]`,
		uploaded.ID,
	)

	req, _ := q.CreateRequest(ctx, repository.CreateRequestParams{
		Name:        "formdata-override",
		Method:      "POST",
		Url:         ts.URL,
		Body:        sql.NullString{String: items, Valid: true},
		BodyType:    sql.NullString{String: "formdata", Valid: true},
		WorkspaceID: 1,
	})

	// Runtime file takes priority over persisted fileId
	runtimeFiles := map[int]FormDataFile{
		0: {Filename: "file.txt", Data: []byte("new content")},
	}

	result, err := re.Execute(ctx, req.ID, nil, &RequestOverrides{
		BodyType:      "formdata",
		FormDataFiles: runtimeFiles,
	})
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	if result.Error != "" {
		t.Fatalf("unexpected error: %s", result.Error)
	}
	if string(receivedFiles["doc"]) != "new content" {
		t.Errorf("runtime file should override persisted: got %q, want %q", string(receivedFiles["doc"]), "new content")
	}
}

func TestExecuteFormData_FileIDWithNilStorage(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// The file field with fileId should be skipped when fileStorage is nil
		fields, files, _ := parseMultipartFields(t, r)
		if _, ok := files["doc"]; ok {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte("should not have file"))
			return
		}
		if fields["title"] != "test" {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte("missing title"))
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer ts.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr, nil) // nil fileStorage

	// Body JSON has fileId but no runtime file and no fileStorage
	items := `[{"key":"title","value":"test","type":"text","enabled":true},{"key":"doc","value":"ghost.pdf","type":"file","enabled":true,"fileId":999}]`

	ctx := context.Background()
	req, _ := q.CreateRequest(ctx, repository.CreateRequestParams{
		Name:        "formdata-nil-storage",
		Method:      "POST",
		Url:         ts.URL,
		Body:        sql.NullString{String: items, Valid: true},
		BodyType:    sql.NullString{String: "formdata", Valid: true},
		WorkspaceID: 1,
	})

	result, err := re.Execute(ctx, req.ID, nil, nil)
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	if result.Error != "" {
		t.Fatalf("unexpected error: %s", result.Error)
	}
	if result.StatusCode != 200 {
		t.Errorf("status: got %d, want 200", result.StatusCode)
	}
}
