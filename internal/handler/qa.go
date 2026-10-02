package handler

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
	"relay/internal/middleware"
)

var qaStatuses = map[string]bool{"대기": true, "진행 중": true, "완료": true, "실패": true}

type QAHandler struct{ db *sql.DB }

func NewQAHandler(db *sql.DB) *QAHandler { return &QAHandler{db: db} }

type QATopic struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Color     string `json:"color"`
	SortOrder int    `json:"sortOrder"`
	CaseCount int    `json:"caseCount"`
}
type QAStep struct {
	ID             int64  `json:"id"`
	Order          int    `json:"order"`
	Action         string `json:"action"`
	ExpectedResult string `json:"expectedResult"`
}
type QALink struct {
	Type string `json:"type"`
	ID   int64  `json:"id"`
	Name string `json:"name,omitempty"`
}
type QACase struct {
	ID           int64    `json:"id"`
	Key          string   `json:"key"`
	TopicID      *int64   `json:"topicId,omitempty"`
	TopicName    string   `json:"topicName,omitempty"`
	Title        string   `json:"title"`
	Description  string   `json:"description"`
	Precondition string   `json:"precondition"`
	Priority     string   `json:"priority"`
	Status       string   `json:"status"`
	Note         string   `json:"note"`
	Steps        []QAStep `json:"steps,omitempty"`
	Links        []QALink `json:"links,omitempty"`
	CreatedAt    string   `json:"createdAt"`
	UpdatedAt    string   `json:"updatedAt"`
}
type qaCaseInput struct {
	Key          string   `json:"key"`
	TopicID      *int64   `json:"topicId"`
	TopicName    string   `json:"topicName"`
	Title        string   `json:"title"`
	Description  string   `json:"description"`
	Precondition string   `json:"precondition"`
	Priority     string   `json:"priority"`
	Status       string   `json:"status"`
	Note         string   `json:"note"`
	Steps        []QAStep `json:"steps"`
	Links        []QALink `json:"links"`
}

func qaTime(t time.Time) string { return t.UTC().Format(time.RFC3339) }

func (h *QAHandler) ListTopics(w http.ResponseWriter, r *http.Request) {
	ws := middleware.GetWorkspaceID(r.Context())
	rows, e := h.db.Query(`SELECT t.id,t.name,t.color,t.sort_order,COUNT(c.id) FROM qa_topics t LEFT JOIN qa_cases c ON c.topic_id=t.id WHERE t.workspace_id=? GROUP BY t.id ORDER BY t.sort_order,t.name`, ws)
	if e != nil {
		respondError(w, 500, e.Error())
		return
	}
	defer rows.Close()
	out := []QATopic{}
	for rows.Next() {
		var x QATopic
		rows.Scan(&x.ID, &x.Name, &x.Color, &x.SortOrder, &x.CaseCount)
		out = append(out, x)
	}
	respondJSON(w, 200, out)
}
func (h *QAHandler) CreateTopic(w http.ResponseWriter, r *http.Request) {
	var x QATopic
	if e := decodeJSON(r, &x); e != nil || strings.TrimSpace(x.Name) == "" {
		respondError(w, 400, "Topic name is required")
		return
	}
	if x.Color == "" {
		x.Color = "#3b82f6"
	}
	ws := middleware.GetWorkspaceID(r.Context())
	e := h.db.QueryRow(`INSERT INTO qa_topics(workspace_id,name,color,sort_order) VALUES(?,?,?,COALESCE((SELECT MAX(sort_order)+1 FROM qa_topics WHERE workspace_id=?),1)) RETURNING id,sort_order`, ws, strings.TrimSpace(x.Name), x.Color, ws).Scan(&x.ID, &x.SortOrder)
	if e != nil {
		respondError(w, 400, "Topic already exists")
		return
	}
	respondJSON(w, 201, x)
}
func (h *QAHandler) UpdateTopic(w http.ResponseWriter, r *http.Request) {
	id, e := parseID(r, "id")
	if e != nil {
		respondError(w, 400, "Invalid ID")
		return
	}
	var x QATopic
	if decodeJSON(r, &x) != nil || strings.TrimSpace(x.Name) == "" {
		respondError(w, 400, "Topic name is required")
		return
	}
	ws := middleware.GetWorkspaceID(r.Context())
	res, e := h.db.Exec(`UPDATE qa_topics SET name=?,color=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=?`, x.Name, x.Color, id, ws)
	n, _ := res.RowsAffected()
	if e != nil || n == 0 {
		respondError(w, 404, "Topic not found or duplicate name")
		return
	}
	x.ID = id
	respondJSON(w, 200, x)
}
func (h *QAHandler) DeleteTopic(w http.ResponseWriter, r *http.Request) {
	id, e := parseID(r, "id")
	if e != nil {
		respondError(w, 400, "Invalid ID")
		return
	}
	ws := middleware.GetWorkspaceID(r.Context())
	var n int
	if h.db.QueryRow(`SELECT COUNT(*) FROM qa_cases WHERE topic_id=? AND workspace_id=?`, id, ws).Scan(&n) != nil {
		respondError(w, 404, "Topic not found")
		return
	}
	if n > 0 {
		respondError(w, 409, fmt.Sprintf("Topic is used by %d QA cases", n))
		return
	}
	h.db.Exec(`DELETE FROM qa_topics WHERE id=? AND workspace_id=?`, id, ws)
	w.WriteHeader(204)
}
func scanCase(row interface{ Scan(...any) error }) (QACase, error) {
	var c QACase
	var tid sql.NullInt64
	var created, updated time.Time
	e := row.Scan(&c.ID, &c.Key, &tid, &c.TopicName, &c.Title, &c.Description, &c.Precondition, &c.Priority, &c.Status, &c.Note, &created, &updated)
	if tid.Valid {
		c.TopicID = &tid.Int64
	}
	c.CreatedAt = qaTime(created)
	c.UpdatedAt = qaTime(updated)
	return c, e
}

const caseSelect = `SELECT c.id,c.qa_key,c.topic_id,COALESCE(t.name,''),c.title,c.description,c.precondition,c.priority,c.status,c.note,c.created_at,c.updated_at FROM qa_cases c LEFT JOIN qa_topics t ON t.id=c.topic_id`

func (h *QAHandler) ListCases(w http.ResponseWriter, r *http.Request) {
	ws := middleware.GetWorkspaceID(r.Context())
	q := r.URL.Query()
	args := []any{ws}
	where := ` WHERE c.workspace_id=?`
	if v := q.Get("status"); v != "" {
		where += " AND c.status=?"
		args = append(args, v)
	}
	if v := q.Get("topicId"); v != "" {
		where += " AND c.topic_id=?"
		args = append(args, v)
	}
	if v := strings.TrimSpace(q.Get("q")); v != "" {
		where += " AND (c.title LIKE ? OR c.qa_key LIKE ?)"
		args = append(args, "%"+v+"%", "%"+v+"%")
	}
	rows, e := h.db.Query(caseSelect+where+` ORDER BY c.updated_at DESC`, args...)
	if e != nil {
		respondError(w, 500, e.Error())
		return
	}
	defer rows.Close()
	out := []QACase{}
	for rows.Next() {
		c, e := scanCase(rows)
		if e == nil {
			c.Links = h.links(c.ID)
			out = append(out, c)
		}
	}
	respondJSON(w, 200, out)
}
func (h *QAHandler) GetCase(w http.ResponseWriter, r *http.Request) {
	id, e := parseID(r, "id")
	if e != nil {
		respondError(w, 400, "Invalid ID")
		return
	}
	c, e := scanCase(h.db.QueryRow(caseSelect+` WHERE c.id=? AND c.workspace_id=?`, id, middleware.GetWorkspaceID(r.Context())))
	if e != nil {
		respondError(w, 404, "QA case not found")
		return
	}
	c.Steps = h.steps(c.ID)
	c.Links = h.links(c.ID)
	respondJSON(w, 200, c)
}
func (h *QAHandler) steps(id int64) []QAStep {
	rows, _ := h.db.Query(`SELECT id,step_order,action,expected_result FROM qa_test_steps WHERE qa_case_id=? ORDER BY step_order`, id)
	defer func() {
		if rows != nil {
			rows.Close()
		}
	}()
	out := []QAStep{}
	for rows != nil && rows.Next() {
		var s QAStep
		rows.Scan(&s.ID, &s.Order, &s.Action, &s.ExpectedResult)
		out = append(out, s)
	}
	return out
}
func (h *QAHandler) links(id int64) []QALink {
	rows, _ := h.db.Query(`SELECT resource_type,resource_id FROM qa_case_links WHERE qa_case_id=?`, id)
	defer func() {
		if rows != nil {
			rows.Close()
		}
	}()
	out := []QALink{}
	for rows != nil && rows.Next() {
		var l QALink
		rows.Scan(&l.Type, &l.ID)
		out = append(out, l)
	}
	return out
}
func (h *QAHandler) topicID(tx *sql.Tx, ws int64, in qaCaseInput) (*int64, error) {
	if in.TopicID != nil {
		var count int
		if e := tx.QueryRow(`SELECT COUNT(*) FROM qa_topics WHERE id=? AND workspace_id=?`, *in.TopicID, ws).Scan(&count); e != nil || count == 0 {
			return nil, fmt.Errorf("Topic not found")
		}
		return in.TopicID, nil
	}
	name := strings.TrimSpace(in.TopicName)
	if name == "" {
		return nil, nil
	}
	var id int64
	e := tx.QueryRow(`SELECT id FROM qa_topics WHERE workspace_id=? AND name=?`, ws, name).Scan(&id)
	if e == sql.ErrNoRows {
		e = tx.QueryRow(`INSERT INTO qa_topics(workspace_id,name,color,sort_order) VALUES(?,?,?,COALESCE((SELECT MAX(sort_order)+1 FROM qa_topics WHERE workspace_id=?),1)) RETURNING id`, ws, name, "#3b82f6", ws).Scan(&id)
	}
	return &id, e
}
func (h *QAHandler) valid(in qaCaseInput) error {
	if strings.TrimSpace(in.Title) == "" {
		return fmt.Errorf("Title is required")
	}
	if in.Status == "" {
		in.Status = "대기"
	}
	if !qaStatuses[in.Status] {
		return fmt.Errorf("Invalid status")
	}
	return nil
}
func (h *QAHandler) nextKey(tx *sql.Tx, ws int64) (string, error) {
	var n int
	tx.QueryRow(`SELECT COUNT(*) FROM qa_cases WHERE workspace_id=?`, ws).Scan(&n)
	for {
		n++
		k := fmt.Sprintf("QA-%04d", n)
		var x int
		if tx.QueryRow(`SELECT COUNT(*) FROM qa_cases WHERE workspace_id=? AND qa_key=?`, ws, k).Scan(&x) == nil && x == 0 {
			return k, nil
		}
	}
}
func (h *QAHandler) save(tx *sql.Tx, ws, id int64, in qaCaseInput) (int64, error) {
	if e := h.valid(in); e != nil {
		return 0, e
	}
	if in.Priority == "" {
		in.Priority = "보통"
	}
	topic, e := h.topicID(tx, ws, in)
	if e != nil {
		return 0, e
	}
	var topicArg any = nil
	if topic != nil {
		topicArg = *topic
	}
	var old string
	if id > 0 {
		tx.QueryRow(`SELECT status FROM qa_cases WHERE id=? AND workspace_id=?`, id, ws).Scan(&old)
		res, err := tx.Exec(`UPDATE qa_cases SET topic_id=?,title=?,description=?,precondition=?,priority=?,status=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=?`, topicArg, in.Title, in.Description, in.Precondition, in.Priority, in.Status, in.Note, id, ws)
		if err != nil {
			return 0, err
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			return 0, fmt.Errorf("QA case not found")
		}
	} else {
		if strings.TrimSpace(in.Key) == "" {
			in.Key, e = h.nextKey(tx, ws)
			if e != nil {
				return 0, e
			}
		}
		e = tx.QueryRow(`INSERT INTO qa_cases(workspace_id,qa_key,topic_id,title,description,precondition,priority,status,note) VALUES(?,?,?,?,?,?,?,?,?) RETURNING id`, ws, in.Key, topicArg, in.Title, in.Description, in.Precondition, in.Priority, in.Status, in.Note).Scan(&id)
		if e != nil {
			return 0, e
		}
	}
	if old != in.Status {
		tx.Exec(`INSERT INTO qa_case_history(qa_case_id,from_status,to_status) VALUES(?,?,?)`, id, old, in.Status)
	}
	tx.Exec(`DELETE FROM qa_test_steps WHERE qa_case_id=?`, id)
	for i, s := range in.Steps {
		if strings.TrimSpace(s.Action) != "" {
			tx.Exec(`INSERT INTO qa_test_steps(qa_case_id,step_order,action,expected_result) VALUES(?,?,?,?)`, id, i+1, s.Action, s.ExpectedResult)
		}
	}
	if in.Links != nil {
		tx.Exec(`DELETE FROM qa_case_links WHERE qa_case_id=?`, id)
		for _, l := range in.Links {
			if l.Type != "request" && l.Type != "flow" {
				return 0, fmt.Errorf("Invalid link type")
			}
			table := "requests"
			if l.Type == "flow" {
				table = "flows"
			}
			var ok int
			if tx.QueryRow(`SELECT COUNT(*) FROM `+table+` WHERE id=? AND workspace_id=?`, l.ID, ws).Scan(&ok) != nil || ok == 0 {
				return 0, fmt.Errorf("Linked %s not found", l.Type)
			}
			tx.Exec(`INSERT OR IGNORE INTO qa_case_links(qa_case_id,resource_type,resource_id) VALUES(?,?,?)`, id, l.Type, l.ID)
		}
	}
	return id, nil
}
func (h *QAHandler) CreateCase(w http.ResponseWriter, r *http.Request) {
	var in qaCaseInput
	if decodeJSON(r, &in) != nil {
		respondError(w, 400, "Invalid request")
		return
	}
	tx, e := h.db.Begin()
	if e != nil {
		respondError(w, 500, e.Error())
		return
	}
	id, e := h.save(tx, middleware.GetWorkspaceID(r.Context()), 0, in)
	if e != nil {
		tx.Rollback()
		respondError(w, 400, e.Error())
		return
	}
	tx.Commit()
	respondJSON(w, 201, map[string]int64{"id": id})
}
func (h *QAHandler) UpdateCase(w http.ResponseWriter, r *http.Request) {
	id, e := parseID(r, "id")
	if e != nil {
		respondError(w, 400, "Invalid ID")
		return
	}
	var in qaCaseInput
	if decodeJSON(r, &in) != nil {
		respondError(w, 400, "Invalid request")
		return
	}
	tx, e := h.db.Begin()
	if e != nil {
		respondError(w, 500, e.Error())
		return
	}
	_, e = h.save(tx, middleware.GetWorkspaceID(r.Context()), id, in)
	if e != nil {
		tx.Rollback()
		respondError(w, 400, e.Error())
		return
	}
	tx.Commit()
	respondJSON(w, 200, map[string]int64{"id": id})
}
func (h *QAHandler) DeleteCase(w http.ResponseWriter, r *http.Request) {
	id, e := parseID(r, "id")
	if e != nil {
		respondError(w, 400, "Invalid ID")
		return
	}
	res, e := h.db.Exec(`DELETE FROM qa_cases WHERE id=? AND workspace_id=?`, id, middleware.GetWorkspaceID(r.Context()))
	n, _ := res.RowsAffected()
	if e != nil || n == 0 {
		respondError(w, 404, "QA case not found")
		return
	}
	w.WriteHeader(204)
}
func (h *QAHandler) History(w http.ResponseWriter, r *http.Request) {
	id, e := parseID(r, "id")
	if e != nil {
		respondError(w, 400, "Invalid ID")
		return
	}
	rows, e := h.db.Query(`SELECT h.from_status,h.to_status,h.created_at FROM qa_case_history h JOIN qa_cases c ON c.id=h.qa_case_id WHERE h.qa_case_id=? AND c.workspace_id=? ORDER BY h.id DESC`, id, middleware.GetWorkspaceID(r.Context()))
	if e != nil {
		respondError(w, 500, e.Error())
		return
	}
	defer rows.Close()
	out := []map[string]string{}
	for rows.Next() {
		var from, to string
		var t time.Time
		rows.Scan(&from, &to, &t)
		out = append(out, map[string]string{"fromStatus": from, "toStatus": to, "createdAt": qaTime(t)})
	}
	respondJSON(w, 200, out)
}
func headerMap(row []string) map[string]int {
	m := map[string]int{}
	for i, v := range row {
		v = strings.ToLower(strings.TrimSpace(v))
		m[v] = i
	}
	return m
}
func getCell(row []string, m map[string]int, names ...string) string {
	for _, n := range names {
		if i, ok := m[strings.ToLower(n)]; ok && i < len(row) {
			return strings.TrimSpace(row[i])
		}
	}
	return ""
}

type importIssue struct {
	Sheet   string `json:"sheet"`
	Row     int    `json:"row"`
	Message string `json:"message"`
}
type importPreview struct {
	Valid   int           `json:"valid"`
	Invalid int           `json:"invalid"`
	Issues  []importIssue `json:"issues"`
}

func (h *QAHandler) parseWorkbook(r *http.Request, save bool) (importPreview, error) {
	var p importPreview
	if e := r.ParseMultipartForm(10 << 20); e != nil {
		return p, fmt.Errorf("Invalid multipart form")
	}
	file, _, e := r.FormFile("file")
	if e != nil {
		return p, fmt.Errorf("file is required")
	}
	defer file.Close()
	f, e := excelize.OpenReader(file)
	if e != nil {
		return p, fmt.Errorf("Invalid XLSX file")
	}
	defer f.Close()
	rows, e := f.GetRows("QA Cases")
	if e != nil || len(rows) < 2 {
		return p, fmt.Errorf("QA Cases sheet is required")
	}
	hm := headerMap(rows[0])
	if getCell(rows[0], map[string]int{}, "x") != "" {
	}
	if _, ok := hm["summary"]; !ok {
		if _, ok = hm["케이스명"]; !ok {
			return p, fmt.Errorf("Summary/케이스명 column is required")
		}
	}
	stepsByKey := map[string][]QAStep{}
	if sr, e := f.GetRows("Test Steps"); e == nil && len(sr) > 1 {
		sm := headerMap(sr[0])
		for i, row := range sr[1:] {
			key := getCell(row, sm, "key", "qa id")
			act := getCell(row, sm, "test step", "절차", "action")
			if key == "" || act == "" {
				p.Issues = append(p.Issues, importIssue{"Test Steps", i + 2, "QA ID and Test Step are required"})
				continue
			}
			stepsByKey[key] = append(stepsByKey[key], QAStep{Order: len(stepsByKey[key]) + 1, Action: act, ExpectedResult: getCell(row, sm, "expected result", "기대 결과")})
		}
	}
	ws := middleware.GetWorkspaceID(r.Context())
	tx, err := h.db.Begin()
	if err != nil {
		return p, err
	}
	defer tx.Rollback()
	seen := map[string]bool{}
	for i, row := range rows[1:] {
		in := qaCaseInput{Key: getCell(row, hm, "key", "qa id"), Title: getCell(row, hm, "summary", "케이스명", "title"), Description: getCell(row, hm, "description", "설명"), Precondition: getCell(row, hm, "precondition", "사전 조건"), Priority: getCell(row, hm, "priority", "우선순위"), Status: getCell(row, hm, "status", "상태"), TopicName: getCell(row, hm, "topic", "component", "components", "주제")}
		if in.Status == "" {
			in.Status = "대기"
		}
		if in.Priority == "" {
			in.Priority = "보통"
		}
		in.Steps = stepsByKey[in.Key]
		if in.Key != "" && seen[in.Key] {
			p.Invalid++
			p.Issues = append(p.Issues, importIssue{"QA Cases", i + 2, "Duplicate QA ID in file"})
			continue
		}
		seen[in.Key] = true
		if e := h.valid(in); e != nil {
			p.Invalid++
			p.Issues = append(p.Issues, importIssue{"QA Cases", i + 2, e.Error()})
			continue
		}
		p.Valid++
		if save {
			var id int64
			if in.Key != "" {
				_ = tx.QueryRow(`SELECT id FROM qa_cases WHERE workspace_id=? AND qa_key=?`, ws, in.Key).Scan(&id)
			}
			if _, e = h.save(tx, ws, id, in); e != nil {
				return p, e
			}
		}
	}
	if save {
		if e := tx.Commit(); e != nil {
			return p, e
		}
	}
	return p, nil
}
func (h *QAHandler) PreviewImport(w http.ResponseWriter, r *http.Request) {
	p, e := h.parseWorkbook(r, false)
	if e != nil {
		respondError(w, 400, e.Error())
		return
	}
	respondJSON(w, 200, p)
}
func (h *QAHandler) Import(w http.ResponseWriter, r *http.Request) {
	p, e := h.parseWorkbook(r, true)
	if e != nil {
		respondError(w, 400, e.Error())
		return
	}
	respondJSON(w, 200, p)
}
func (h *QAHandler) writeWorkbook(w http.ResponseWriter, r *http.Request, template bool) {
	f := excelize.NewFile()
	f.SetSheetName("Sheet1", "QA Cases")
	headers := []string{"Key", "Summary", "Description", "Precondition", "Priority", "Status", "Topic", "Note", "Linked Requests", "Linked Flows"}
	f.SetSheetRow("QA Cases", "A1", &headers)
	f.NewSheet("Test Steps")
	f.SetSheetRow("Test Steps", "A1", &[]string{"QA ID", "Order", "Test Step", "Expected Result"})
	f.NewSheet("Topics")
	f.SetSheetRow("Topics", "A1", &[]string{"Topic", "Color"})
	if !template {
		ws := middleware.GetWorkspaceID(r.Context())
		rows, _ := h.db.Query(caseSelect+` WHERE c.workspace_id=? ORDER BY c.qa_key`, ws)
		i := 2
		for rows.Next() {
			c, _ := scanCase(rows)
			f.SetSheetRow("QA Cases", fmt.Sprintf("A%d", i), &[]string{c.Key, c.Title, c.Description, c.Precondition, c.Priority, c.Status, c.TopicName, c.Note})
			for _, s := range h.steps(c.ID) {
				f.SetSheetRow("Test Steps", fmt.Sprintf("A%d", i), &[]any{c.Key, s.Order, s.Action, s.ExpectedResult})
				i++
			}
			i++
		}
		if rows != nil {
			rows.Close()
		}
		topics, _ := h.db.Query(`SELECT name,color FROM qa_topics WHERE workspace_id=? ORDER BY name`, ws)
		i = 2
		for topics.Next() {
			var n, c string
			topics.Scan(&n, &c)
			f.SetSheetRow("Topics", fmt.Sprintf("A%d", i), &[]string{n, c})
			i++
		}
		if topics != nil {
			topics.Close()
		}
	}
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	name := "qa-cases.xlsx"
	if template {
		name = "qa-cases-template.xlsx"
	}
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	f.Write(w)
}
func (h *QAHandler) Template(w http.ResponseWriter, r *http.Request) { h.writeWorkbook(w, r, true) }
func (h *QAHandler) Export(w http.ResponseWriter, r *http.Request)   { h.writeWorkbook(w, r, false) }
