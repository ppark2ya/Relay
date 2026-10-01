package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"sort"
	"strings"

	"relay/internal/middleware"
	"relay/internal/repository"
)

const postmanCollectionSchema = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"

type postmanCollection struct {
	Info     postmanInfo   `json:"info"`
	Item     []postmanItem `json:"item"`
	Variable []postmanVar  `json:"variable,omitempty"`
}

type postmanInfo struct {
	Name   string `json:"name"`
	Schema string `json:"schema"`
}

type postmanVar struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type postmanItem struct {
	Name    string          `json:"name"`
	Item    *[]postmanItem  `json:"item,omitempty"`
	Request *postmanRequest `json:"request,omitempty"`
	Event   []postmanEvent  `json:"event,omitempty"`
}

type postmanRequest struct {
	Method string          `json:"method"`
	URL    json.RawMessage `json:"url"`
	Header []postmanHeader `json:"header,omitempty"`
	Cookie []postmanHeader `json:"cookie,omitempty"`
	Body   *postmanBody    `json:"body,omitempty"`
	Event  []postmanEvent  `json:"event,omitempty"`
	Auth   json.RawMessage `json:"auth,omitempty"`
}

type postmanHeader struct {
	Key      string `json:"key"`
	Value    string `json:"value"`
	Disabled bool   `json:"disabled,omitempty"`
}

type postmanBody struct {
	Mode string `json:"mode"`
	Raw  string `json:"raw,omitempty"`
}

type postmanEvent struct {
	Listen string `json:"listen"`
	Script struct {
		Exec []string `json:"exec"`
	} `json:"script"`
}

func (h *CollectionHandler) ExportPostman(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid collection ID")
		return
	}

	workspaceID := middleware.GetWorkspaceID(r.Context())
	root, err := h.queries.GetCollection(r.Context(), id)
	if err != nil || root.WorkspaceID != workspaceID || root.ParentID.Valid {
		respondError(w, http.StatusNotFound, "Top-level collection not found")
		return
	}

	collection, err := h.exportPostmanCollection(r.Context(), root)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	filename := sanitizeDownloadFilename(root.Name) + ".postman_collection.json"
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	if err := json.NewEncoder(w).Encode(collection); err != nil {
		return
	}
}

func (h *CollectionHandler) exportPostmanCollection(ctx context.Context, root repository.Collection) (postmanCollection, error) {
	variables, err := h.queries.GetCollectionVariables(ctx, root.ID)
	if err != nil {
		return postmanCollection{}, err
	}

	result := postmanCollection{Info: postmanInfo{Name: root.Name, Schema: postmanCollectionSchema}}
	if variables.Valid && variables.String != "" {
		var values map[string]string
		if err := json.Unmarshal([]byte(variables.String), &values); err == nil {
			for key, value := range values {
				result.Variable = append(result.Variable, postmanVar{Key: key, Value: value})
			}
			sort.Slice(result.Variable, func(i, j int) bool { return result.Variable[i].Key < result.Variable[j].Key })
		}
	}
	items, err := h.exportPostmanItems(ctx, root.ID)
	if err != nil {
		return postmanCollection{}, err
	}
	result.Item = items
	return result, nil
}

func (h *CollectionHandler) exportPostmanItems(ctx context.Context, collectionID int64) ([]postmanItem, error) {
	items := make([]postmanItem, 0)
	requests, err := h.queries.ListRequestsByCollection(ctx, sql.NullInt64{Int64: collectionID, Valid: true})
	if err != nil {
		return nil, err
	}
	for _, request := range requests {
		items = append(items, postmanItemFromRequest(request))
	}
	children, err := h.queries.ListChildCollections(ctx, sql.NullInt64{Int64: collectionID, Valid: true})
	if err != nil {
		return nil, err
	}
	for _, child := range children {
		childItems, err := h.exportPostmanItems(ctx, child.ID)
		if err != nil {
			return nil, err
		}
		items = append(items, postmanItem{Name: child.Name, Item: &childItems})
	}
	return items, nil
}

func postmanItemFromRequest(request repository.Request) postmanItem {
	item := postmanItem{Name: request.Name, Request: &postmanRequest{Method: request.Method, URL: json.RawMessage(strconvQuote(request.Url))}}
	if request.Headers.Valid && request.Headers.String != "" {
		var headers map[string]string
		if json.Unmarshal([]byte(request.Headers.String), &headers) == nil {
			for key, value := range headers {
				item.Request.Header = append(item.Request.Header, postmanHeader{Key: key, Value: value})
			}
			sort.Slice(item.Request.Header, func(i, j int) bool { return item.Request.Header[i].Key < item.Request.Header[j].Key })
		}
	}
	if request.Body.Valid && request.Body.String != "" {
		item.Request.Body = &postmanBody{Mode: "raw", Raw: request.Body.String}
	}
	item.Event = postmanEvents(request.PreScript.String, request.PostScript.String)
	return item
}

func postmanEvents(pre, post string) []postmanEvent {
	events := make([]postmanEvent, 0, 2)
	if pre != "" {
		event := postmanEvent{Listen: "prerequest"}
		event.Script.Exec = strings.Split(pre, "\n")
		events = append(events, event)
	}
	if post != "" {
		event := postmanEvent{Listen: "test"}
		event.Script.Exec = strings.Split(post, "\n")
		events = append(events, event)
	}
	return events
}

func (h *CollectionHandler) ImportPostman(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid multipart form")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Postman collection file is required")
		return
	}
	defer file.Close()
	if strings.ToLower(filepath.Ext(header.Filename)) != ".json" {
		respondError(w, http.StatusBadRequest, "Postman collection must be a .json file")
		return
	}

	var collection postmanCollection
	decoder := json.NewDecoder(io.LimitReader(file, 10<<20))
	if err := decoder.Decode(&collection); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid Postman collection JSON")
		return
	}
	if err := validatePostmanCollection(collection); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	workspaceID := middleware.GetWorkspaceID(r.Context())
	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()
	txQueries := h.queries.WithTx(tx)
	maxOrder, err := maxRootCollectionSortOrder(r.Context(), txQueries, workspaceID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	root, err := txQueries.CreateCollection(r.Context(), repository.CreateCollectionParams{Name: collection.Info.Name, WorkspaceID: workspaceID, SortOrder: maxOrder + 1})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := savePostmanVariables(r.Context(), txQueries, root.ID, collection.Variable); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := importPostmanItems(r.Context(), txQueries, root.ID, workspaceID, collection.Item); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := tx.Commit(); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, struct {
		CollectionResponse
		Warnings []string `json:"warnings,omitempty"`
	}{
		CollectionResponse: CollectionResponse{ID: root.ID, Name: root.Name, SortOrder: root.SortOrder, CreatedAt: formatTime(root.CreatedAt), UpdatedAt: formatTime(root.UpdatedAt)},
		Warnings:           postmanImportWarnings(collection.Item),
	})
}

func validatePostmanCollection(collection postmanCollection) error {
	if collection.Info.Schema != postmanCollectionSchema {
		return fmt.Errorf("only Postman Collection v2.1.0 is supported")
	}
	if strings.TrimSpace(collection.Info.Name) == "" {
		return fmt.Errorf("collection info.name is required")
	}
	if collection.Item == nil {
		return fmt.Errorf("collection item is required")
	}
	for _, item := range collection.Item {
		if err := validatePostmanItem(item); err != nil {
			return err
		}
	}
	return nil
}

func validatePostmanItem(item postmanItem) error {
	if strings.TrimSpace(item.Name) == "" {
		return fmt.Errorf("every folder and request must have a name")
	}
	if item.Request == nil {
		if item.Item == nil {
			return fmt.Errorf("item %q must be a folder or request", item.Name)
		}
		for _, child := range *item.Item {
			if err := validatePostmanItem(child); err != nil {
				return err
			}
		}
		return nil
	}
	if strings.TrimSpace(item.Request.Method) == "" {
		return fmt.Errorf("request %q must have a method", item.Name)
	}
	if _, err := postmanURL(item.Request.URL); err != nil {
		return fmt.Errorf("request %q has an invalid URL: %w", item.Name, err)
	}
	return nil
}

func postmanImportWarnings(items []postmanItem) []string {
	warnings := make([]string, 0)
	for _, item := range items {
		if item.Request == nil {
			warnings = append(warnings, postmanImportWarnings(*item.Item)...)
			continue
		}
		if item.Request.Body != nil && item.Request.Body.Mode != "" && item.Request.Body.Mode != "raw" {
			warnings = append(warnings, fmt.Sprintf("%s: %s body was not imported", item.Name, item.Request.Body.Mode))
		}
		if len(item.Request.Auth) > 0 && string(item.Request.Auth) != "null" {
			warnings = append(warnings, fmt.Sprintf("%s: request authentication was not imported", item.Name))
		}
		if len(item.Request.Cookie) > 0 {
			warnings = append(warnings, fmt.Sprintf("%s: request cookies were not imported", item.Name))
		}
	}
	return warnings
}

func importPostmanItems(ctx context.Context, q *repository.Queries, parentID, workspaceID int64, items []postmanItem) error {
	collectionOrder, requestOrder := int64(0), int64(0)
	for _, item := range items {
		if item.Request == nil {
			collectionOrder++
			child, err := q.CreateCollection(ctx, repository.CreateCollectionParams{Name: item.Name, ParentID: sql.NullInt64{Int64: parentID, Valid: true}, WorkspaceID: workspaceID, SortOrder: collectionOrder})
			if err != nil {
				return err
			}
			if err := importPostmanItems(ctx, q, child.ID, workspaceID, *item.Item); err != nil {
				return err
			}
			continue
		}
		requestOrder++
		request, err := relayRequestFromPostman(item)
		if err != nil {
			return err
		}
		request.CollectionID = sql.NullInt64{Int64: parentID, Valid: true}
		request.WorkspaceID = workspaceID
		request.SortOrder = requestOrder
		if _, err := q.CreateRequest(ctx, request); err != nil {
			return err
		}
	}
	return nil
}

func relayRequestFromPostman(item postmanItem) (repository.CreateRequestParams, error) {
	url, err := postmanURL(item.Request.URL)
	if err != nil {
		return repository.CreateRequestParams{}, err
	}
	headers := make(map[string]string, len(item.Request.Header))
	for _, header := range item.Request.Header {
		if !header.Disabled && header.Key != "" {
			headers[header.Key] = header.Value
		}
	}
	headersJSON, _ := json.Marshal(headers)
	pre, post := postmanScripts(item.Event)
	body, bodyType := "", "none"
	if item.Request.Body != nil && item.Request.Body.Mode == "raw" {
		body = item.Request.Body.Raw
		bodyType = "text"
		for key, value := range headers {
			if strings.EqualFold(key, "Content-Type") && strings.Contains(strings.ToLower(value), "application/json") {
				bodyType = "json"
			}
		}
	}
	return repository.CreateRequestParams{Name: item.Name, Method: item.Request.Method, Url: url, Headers: nullString(string(headersJSON)), Body: nullString(body), BodyType: nullString(bodyType), Cookies: nullString("{}"), PreScript: nullString(pre), PostScript: nullString(post)}, nil
}

func postmanURL(raw json.RawMessage) (string, error) {
	var value string
	if err := json.Unmarshal(raw, &value); err != nil || strings.TrimSpace(value) == "" {
		return "", fmt.Errorf("URL must be a non-empty string")
	}
	return value, nil
}

func postmanScripts(events []postmanEvent) (pre, post string) {
	for _, event := range events {
		script := strings.Join(event.Script.Exec, "\n")
		switch event.Listen {
		case "prerequest":
			pre = script
		case "test":
			post = script
		}
	}
	return pre, post
}

func savePostmanVariables(ctx context.Context, q *repository.Queries, collectionID int64, variables []postmanVar) error {
	values := make(map[string]string, len(variables))
	for _, variable := range variables {
		if strings.TrimSpace(variable.Key) == "" {
			return fmt.Errorf("collection variable key is required")
		}
		values[variable.Key] = variable.Value
	}
	encoded, err := json.Marshal(values)
	if err != nil {
		return err
	}
	_, err = q.UpdateCollectionVariables(ctx, repository.UpdateCollectionVariablesParams{ID: collectionID, Variables: sql.NullString{String: string(encoded), Valid: true}})
	return err
}

func maxRootCollectionSortOrder(ctx context.Context, q *repository.Queries, workspaceID int64) (int64, error) {
	value, err := q.GetMaxRootCollectionSortOrder(ctx, workspaceID)
	if err != nil {
		return 0, err
	}
	return value.(int64), nil
}

func sanitizeDownloadFilename(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "collection"
	}
	return strings.Map(func(r rune) rune {
		if strings.ContainsRune("\\/:*?\"<>|", r) {
			return '_'
		}
		return r
	}, name)
}

func strconvQuote(value string) string {
	encoded, _ := json.Marshal(value)
	return string(encoded)
}
