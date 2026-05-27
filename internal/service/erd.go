package service

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

type ErdDiagnostic struct {
	Line     int    `json:"line,omitempty"`
	Message  string `json:"message"`
	Severity string `json:"severity"`
}

type ErdSpec struct {
	PackageName string        `json:"packageName"`
	Entities    []ErdEntity   `json:"entities"`
	Relations   []ErdRelation `json:"relations"`
}

type ErdEntity struct {
	Name   string     `json:"name"`
	Table  string     `json:"table"`
	Fields []ErdField `json:"fields"`
}

type ErdField struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Column   string `json:"column"`
	ID       bool   `json:"id"`
	Nullable *bool  `json:"nullable"`
	Unique   bool   `json:"unique"`
}

type ErdRelation struct {
	From       string `json:"from"`
	To         string `json:"to"`
	Type       string `json:"type"`
	Field      string `json:"field"`
	JoinColumn string `json:"joinColumn"`
	Nullable   *bool  `json:"nullable"`
}

type ErdDiagram struct {
	Entities  []ErdDiagramEntity   `json:"entities"`
	Relations []ErdDiagramRelation `json:"relations"`
}

type ErdDiagramEntity struct {
	Name   string   `json:"name"`
	Fields []string `json:"fields"`
}

type ErdDiagramRelation struct {
	From            string `json:"from"`
	FromCardinality string `json:"fromCardinality"`
	To              string `json:"to"`
	ToCardinality   string `json:"toCardinality"`
	Label           string `json:"label"`
}

type GeneratedFile struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

func ParseErdDSL(input string) (ErdSpec, []ErdDiagnostic) {
	var spec ErdSpec
	if strings.TrimSpace(input) == "" {
		return spec, []ErdDiagnostic{{Message: "DSL is empty", Severity: "error"}}
	}
	if err := json.Unmarshal([]byte(input), &spec); err != nil {
		return spec, []ErdDiagnostic{{Message: "Invalid JSON: " + err.Error(), Severity: "error"}}
	}

	var diagnostics []ErdDiagnostic
	entityNames := map[string]bool{}
	for _, entity := range spec.Entities {
		if strings.TrimSpace(entity.Name) == "" {
			diagnostics = append(diagnostics, erdError("Entity name is required"))
			continue
		}
		if entityNames[entity.Name] {
			diagnostics = append(diagnostics, erdError(fmt.Sprintf("Duplicate entity %q", entity.Name)))
		}
		entityNames[entity.Name] = true

		fieldNames := map[string]bool{}
		hasID := false
		for _, field := range entity.Fields {
			if strings.TrimSpace(field.Name) == "" {
				diagnostics = append(diagnostics, erdError(fmt.Sprintf("Field name is required in entity %q", entity.Name)))
				continue
			}
			if fieldNames[field.Name] {
				diagnostics = append(diagnostics, erdError(fmt.Sprintf("Duplicate field %q in entity %q", field.Name, entity.Name)))
			}
			fieldNames[field.Name] = true
			if field.ID {
				hasID = true
			}
			if strings.TrimSpace(field.Type) == "" {
				diagnostics = append(diagnostics, erdError(fmt.Sprintf("Field %q in entity %q must declare a type", field.Name, entity.Name)))
			}
		}
		if len(entity.Fields) > 0 && !hasID {
			diagnostics = append(diagnostics, erdError(fmt.Sprintf("Entity %q must have an id field", entity.Name)))
		}
	}

	validRelations := map[string]bool{
		"one-to-one": true, "one-to-many": true, "many-to-one": true, "many-to-many": true,
	}
	for _, relation := range spec.Relations {
		if !entityNames[relation.From] {
			diagnostics = append(diagnostics, erdError(fmt.Sprintf("Relation source entity %q does not exist", relation.From)))
		}
		if !entityNames[relation.To] {
			diagnostics = append(diagnostics, erdError(fmt.Sprintf("Relation target entity %q does not exist", relation.To)))
		}
		if !validRelations[relation.Type] {
			diagnostics = append(diagnostics, erdError(fmt.Sprintf("Relation %q -> %q has unsupported type %q", relation.From, relation.To, relation.Type)))
		}
		if strings.TrimSpace(relation.Field) == "" {
			diagnostics = append(diagnostics, erdError(fmt.Sprintf("Relation %q -> %q must declare a field", relation.From, relation.To)))
		}
	}

	return spec, diagnostics
}

func GenerateMermaidERD(spec ErdSpec) string {
	var b strings.Builder
	b.WriteString("erDiagram\n")
	for _, entity := range spec.Entities {
		b.WriteString("  ")
		b.WriteString(entity.Name)
		b.WriteString(" {\n")
		for _, field := range entity.Fields {
			b.WriteString("    ")
			b.WriteString(field.Type)
			b.WriteString(" ")
			b.WriteString(field.Name)
			var markers []string
			if field.ID {
				markers = append(markers, "PK")
			}
			if field.Unique {
				markers = append(markers, "UK")
			}
			if len(markers) > 0 {
				b.WriteString(" ")
				b.WriteString(strings.Join(markers, ","))
			}
			b.WriteString("\n")
		}
		b.WriteString("  }\n")
	}
	for _, relation := range spec.Relations {
		left, right := mermaidCardinality(relation)
		b.WriteString("  ")
		b.WriteString(relation.From)
		b.WriteString(" ")
		b.WriteString(left)
		b.WriteString("--")
		b.WriteString(right)
		b.WriteString(" ")
		b.WriteString(relation.To)
		b.WriteString(" : ")
		b.WriteString(relation.Field)
		b.WriteString("\n")
	}
	return b.String()
}

func GenerateErdDiagram(spec ErdSpec) ErdDiagram {
	diagram := ErdDiagram{
		Entities:  make([]ErdDiagramEntity, 0, len(spec.Entities)),
		Relations: make([]ErdDiagramRelation, 0, len(spec.Relations)),
	}
	for _, entity := range spec.Entities {
		fields := make([]string, 0, len(entity.Fields))
		for _, field := range entity.Fields {
			fields = append(fields, erdFieldDisplay(field))
		}
		diagram.Entities = append(diagram.Entities, ErdDiagramEntity{
			Name:   entity.Name,
			Fields: fields,
		})
	}
	for _, relation := range spec.Relations {
		left, right := mermaidCardinality(relation)
		diagram.Relations = append(diagram.Relations, ErdDiagramRelation{
			From:            relation.From,
			FromCardinality: left,
			To:              relation.To,
			ToCardinality:   right,
			Label:           relation.Field,
		})
	}
	return diagram
}

func GenerateKotlinEntities(spec ErdSpec) []GeneratedFile {
	files := make([]GeneratedFile, 0, len(spec.Entities))
	for _, entity := range spec.Entities {
		files = append(files, GeneratedFile{
			Path:    kotlinFilePath(spec.PackageName, entity.Name),
			Content: generateKotlinEntity(spec, entity, entityRelations(spec.Relations, entity.Name)),
		})
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	return files
}

func erdError(message string) ErdDiagnostic {
	return ErdDiagnostic{Message: message, Severity: "error"}
}

func mermaidCardinality(relation ErdRelation) (string, string) {
	switch relation.Type {
	case "one-to-one":
		return "||", "||"
	case "one-to-many":
		return "||", "}o"
	case "many-to-one":
		return "}o", "||"
	case "many-to-many":
		return "}o", "o{"
	default:
		return "||", "||"
	}
}

func erdFieldDisplay(field ErdField) string {
	var b strings.Builder
	b.WriteString(field.Type)
	b.WriteString(" ")
	b.WriteString(field.Name)
	var markers []string
	if field.ID {
		markers = append(markers, "PK")
	}
	if field.Unique {
		markers = append(markers, "UK")
	}
	if len(markers) > 0 {
		b.WriteString(" ")
		b.WriteString(strings.Join(markers, ","))
	}
	return b.String()
}

func entityRelations(relations []ErdRelation, entityName string) []ErdRelation {
	var result []ErdRelation
	for _, relation := range relations {
		if relation.From == entityName {
			result = append(result, relation)
		}
	}
	return result
}

func generateKotlinEntity(spec ErdSpec, entity ErdEntity, relations []ErdRelation) string {
	var b strings.Builder
	if spec.PackageName != "" {
		b.WriteString("package ")
		b.WriteString(spec.PackageName)
		b.WriteString("\n\n")
	}
	b.WriteString("import jakarta.persistence.*\n")
	if entityUsesType(entity, "BigDecimal") {
		b.WriteString("import java.math.BigDecimal\n")
	}
	b.WriteString("\n")
	b.WriteString("@Entity\n")
	b.WriteString("@Table(name = \"")
	b.WriteString(tableName(entity))
	b.WriteString("\")\n")
	b.WriteString("open class ")
	b.WriteString(entity.Name)
	b.WriteString("(\n")

	var props []string
	for _, field := range entity.Fields {
		props = append(props, kotlinFieldProperty(field))
	}
	for _, relation := range relations {
		props = append(props, kotlinRelationProperty(relation))
	}
	b.WriteString(strings.Join(props, ",\n"))
	if len(props) > 0 {
		b.WriteString("\n")
	}
	b.WriteString(")\n")
	return b.String()
}

func kotlinFieldProperty(field ErdField) string {
	var b strings.Builder
	if field.ID {
		b.WriteString("    @Id\n")
		b.WriteString("    @GeneratedValue(strategy = GenerationType.IDENTITY)\n")
	}
	b.WriteString("    @Column(name = \"")
	b.WriteString(columnName(field))
	b.WriteString("\"")
	if !fieldNullable(field) {
		b.WriteString(", nullable = false")
	}
	if field.Unique {
		b.WriteString(", unique = true")
	}
	b.WriteString(")\n")
	b.WriteString("    open var ")
	b.WriteString(field.Name)
	b.WriteString(": ")
	b.WriteString(kotlinType(field.Type, fieldNullable(field) || field.ID))
	b.WriteString(" = ")
	b.WriteString(kotlinDefault(field.Type, fieldNullable(field) || field.ID))
	return b.String()
}

func kotlinRelationProperty(relation ErdRelation) string {
	nullable := relationNullable(relation)
	optional := "true"
	if !nullable {
		optional = "false"
	}

	var b strings.Builder
	switch relation.Type {
	case "one-to-one":
		b.WriteString("    @OneToOne(fetch = FetchType.LAZY, optional = ")
	case "many-to-one":
		b.WriteString("    @ManyToOne(fetch = FetchType.LAZY, optional = ")
	case "one-to-many":
		b.WriteString("    @OneToMany\n")
		b.WriteString("    open var ")
		b.WriteString(relation.Field)
		b.WriteString(": MutableList<")
		b.WriteString(relation.To)
		b.WriteString("> = mutableListOf()")
		return b.String()
	case "many-to-many":
		b.WriteString("    @ManyToMany\n")
		b.WriteString("    open var ")
		b.WriteString(relation.Field)
		b.WriteString(": MutableList<")
		b.WriteString(relation.To)
		b.WriteString("> = mutableListOf()")
		return b.String()
	default:
		b.WriteString("    @ManyToOne(fetch = FetchType.LAZY, optional = ")
	}
	b.WriteString(optional)
	b.WriteString(")\n")
	if relation.JoinColumn != "" {
		b.WriteString("    @JoinColumn(name = \"")
		b.WriteString(relation.JoinColumn)
		b.WriteString("\"")
		if !nullable {
			b.WriteString(", nullable = false")
		}
		b.WriteString(")\n")
	}
	b.WriteString("    open var ")
	b.WriteString(relation.Field)
	b.WriteString(": ")
	b.WriteString(kotlinType(relation.To, nullable))
	if nullable {
		b.WriteString(" = null")
	}
	return b.String()
}

func kotlinFilePath(packageName, entityName string) string {
	if packageName == "" {
		return entityName + ".kt"
	}
	return strings.ReplaceAll(packageName, ".", "/") + "/" + entityName + ".kt"
}

func tableName(entity ErdEntity) string {
	if entity.Table != "" {
		return entity.Table
	}
	return toSnakeCase(entity.Name) + "s"
}

func columnName(field ErdField) string {
	if field.Column != "" {
		return field.Column
	}
	return toSnakeCase(field.Name)
}

func fieldNullable(field ErdField) bool {
	if field.Nullable == nil {
		return true
	}
	return *field.Nullable
}

func relationNullable(relation ErdRelation) bool {
	if relation.Nullable == nil {
		return true
	}
	return *relation.Nullable
}

func kotlinType(typeName string, nullable bool) string {
	if nullable {
		return typeName + "?"
	}
	return typeName
}

func kotlinDefault(typeName string, nullable bool) string {
	if nullable {
		return "null"
	}
	switch typeName {
	case "String":
		return "\"\""
	case "Int", "Long", "Short", "Byte":
		return "0"
	case "Double", "Float":
		return "0.0"
	case "Boolean":
		return "false"
	case "BigDecimal":
		return "BigDecimal.ZERO"
	default:
		return typeName + "()"
	}
}

func entityUsesType(entity ErdEntity, typeName string) bool {
	for _, field := range entity.Fields {
		if field.Type == typeName {
			return true
		}
	}
	return false
}

var snakeBoundary = regexp.MustCompile(`([a-z0-9])([A-Z])`)

func toSnakeCase(value string) string {
	return strings.ToLower(snakeBoundary.ReplaceAllString(value, "${1}_${2}"))
}
