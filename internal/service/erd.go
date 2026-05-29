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
	Name    string     `json:"name"`
	Table   string     `json:"table"`
	Comment string     `json:"comment"`
	Fields  []ErdField `json:"fields"`
}

type ErdField struct {
	Name      string `json:"name"`
	Type      string `json:"type"`
	Column    string `json:"column"`
	Comment   string `json:"comment"`
	ID        bool   `json:"id"`
	Nullable  *bool  `json:"nullable"`
	Unique    bool   `json:"unique"`
	Index     bool   `json:"index"`
	Length    *int   `json:"length"`
	Precision *int   `json:"precision"`
	Scale     *int   `json:"scale"`
}

type ErdRelation struct {
	From       string `json:"from"`
	To         string `json:"to"`
	Type       string `json:"type"`
	Field      string `json:"field"`
	JoinColumn string `json:"joinColumn"`
	Comment    string `json:"comment"`
	Nullable   *bool  `json:"nullable"`
}

type ErdDiagram struct {
	Entities  []ErdDiagramEntity   `json:"entities"`
	Relations []ErdDiagramRelation `json:"relations"`
}

type ErdDiagramEntity struct {
	Name    string             `json:"name"`
	Columns []ErdDiagramColumn `json:"columns"`
}

type ErdDiagramColumn struct {
	Keys     []string `json:"keys"`
	Name     string   `json:"name"`
	Type     string   `json:"type"`
	Nullable bool     `json:"nullable"`
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
			if field.Length != nil && *field.Length <= 0 {
				diagnostics = append(diagnostics, erdError(fmt.Sprintf("Field %q in entity %q must declare a positive length", field.Name, entity.Name)))
			}
			if field.Precision != nil && *field.Precision <= 0 {
				diagnostics = append(diagnostics, erdError(fmt.Sprintf("Field %q in entity %q must declare a positive precision", field.Name, entity.Name)))
			}
			if field.Scale != nil && *field.Scale < 0 {
				diagnostics = append(diagnostics, erdError(fmt.Sprintf("Field %q in entity %q must declare a non-negative scale", field.Name, entity.Name)))
			}
			if field.Scale != nil && *field.Scale > decimalPrecision(field) {
				diagnostics = append(diagnostics, erdError(fmt.Sprintf("Field %q in entity %q has scale greater than precision", field.Name, entity.Name)))
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
			if fieldIndexed(field) {
				markers = append(markers, "IX")
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
		columns := make([]ErdDiagramColumn, 0, len(entity.Fields)+len(spec.Relations))
		for _, field := range entity.Fields {
			columns = append(columns, erdDiagramColumn(field))
		}
		for _, relation := range spec.Relations {
			if relation.From != entity.Name || !relationOwnsForeignKey(relation) {
				continue
			}
			columns = appendOrMergeDiagramColumn(columns, erdRelationColumn(spec, relation))
		}
		diagram.Entities = append(diagram.Entities, ErdDiagramEntity{
			Name:    entity.Name,
			Columns: columns,
		})
	}
	for _, relation := range spec.Relations {
		left, right := previewCardinality(relation)
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

func GenerateJavaEntities(spec ErdSpec) []GeneratedFile {
	files := make([]GeneratedFile, 0, len(spec.Entities))
	for _, entity := range spec.Entities {
		files = append(files, GeneratedFile{
			Path:    javaFilePath(spec.PackageName, entity.Name),
			Content: generateJavaEntity(spec, entity, entityRelations(spec.Relations, entity.Name)),
		})
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	return files
}

func GenerateMySQLDDL(spec ErdSpec) []GeneratedFile {
	if len(spec.Entities) == 0 {
		return []GeneratedFile{}
	}

	statements := make([]string, 0, len(spec.Entities))
	for _, entity := range spec.Entities {
		statements = append(statements, generateMySQLTableDDL(spec, entity, entityRelations(spec.Relations, entity.Name)))
	}

	return []GeneratedFile{{
		Path:    "schema.mysql.sql",
		Content: strings.Join(statements, "\n\n") + "\n",
	}}
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

func previewCardinality(relation ErdRelation) (string, string) {
	switch relation.Type {
	case "one-to-one":
		return "||", "||"
	case "one-to-many":
		return "||", "O<"
	case "many-to-one":
		return "O<", "||"
	case "many-to-many":
		return "O<", "O<"
	default:
		return "||", "||"
	}
}

func erdDiagramColumn(field ErdField) ErdDiagramColumn {
	keys := make([]string, 0, 3)
	if field.ID {
		keys = append(keys, "PK")
	}
	if field.Unique {
		keys = append(keys, "UK")
	}
	if fieldIndexed(field) {
		keys = append(keys, "IX")
	}
	return ErdDiagramColumn{
		Keys:     keys,
		Name:     columnName(field),
		Type:     fieldMySQLType(field),
		Nullable: fieldNullableForDiagram(field),
	}
}

func erdRelationColumn(spec ErdSpec, relation ErdRelation) ErdDiagramColumn {
	return ErdDiagramColumn{
		Keys:     []string{"FK"},
		Name:     relationForeignKeyName(relation),
		Type:     relationTargetIDMySQLType(spec, relation.To),
		Nullable: relationNullable(relation),
	}
}

func appendOrMergeDiagramColumn(columns []ErdDiagramColumn, next ErdDiagramColumn) []ErdDiagramColumn {
	for i, column := range columns {
		if column.Name != next.Name {
			continue
		}
		for _, key := range next.Keys {
			columns[i].Keys = appendUniqueKey(columns[i].Keys, key)
		}
		if columns[i].Type == "" {
			columns[i].Type = next.Type
		}
		columns[i].Nullable = columns[i].Nullable && next.Nullable
		return columns
	}
	return append(columns, next)
}

func appendUniqueKey(keys []string, key string) []string {
	for _, existing := range keys {
		if existing == key {
			return keys
		}
	}
	return append(keys, key)
}

func relationOwnsForeignKey(relation ErdRelation) bool {
	return relation.Type == "many-to-one" || relation.Type == "one-to-one"
}

func relationForeignKeyName(relation ErdRelation) string {
	if strings.TrimSpace(relation.JoinColumn) != "" {
		return relation.JoinColumn
	}
	if strings.TrimSpace(relation.Field) != "" {
		return toSnakeCase(relation.Field) + "_id"
	}
	return toSnakeCase(relation.To) + "_id"
}

func relationTargetIDType(spec ErdSpec, targetName string) string {
	for _, entity := range spec.Entities {
		if entity.Name != targetName {
			continue
		}
		for _, field := range entity.Fields {
			if field.ID {
				return field.Type
			}
		}
	}
	return "Long"
}

func relationTargetIDMySQLType(spec ErdSpec, targetName string) string {
	for _, entity := range spec.Entities {
		if entity.Name != targetName {
			continue
		}
		for _, field := range entity.Fields {
			if field.ID {
				return fieldMySQLType(field)
			}
		}
	}
	return mysqlType("Long")
}

func fieldNullableForDiagram(field ErdField) bool {
	if field.ID {
		return false
	}
	return fieldNullable(field)
}

func fieldIndexed(field ErdField) bool {
	return field.Index && !field.ID && !field.Unique
}

func fieldMySQLType(field ErdField) string {
	switch strings.TrimSpace(field.Type) {
	case "String":
		return fmt.Sprintf("VARCHAR(%d)", stringLength(field))
	case "BigDecimal":
		return fmt.Sprintf("DECIMAL(%d,%d)", decimalPrecision(field), decimalScale(field))
	default:
		return mysqlType(field.Type)
	}
}

func stringLength(field ErdField) int {
	if field.Length != nil {
		return *field.Length
	}
	return 255
}

func decimalPrecision(field ErdField) int {
	if field.Precision != nil {
		return *field.Precision
	}
	return 19
}

func decimalScale(field ErdField) int {
	if field.Scale != nil {
		return *field.Scale
	}
	return 2
}

func mysqlType(typeName string) string {
	switch strings.TrimSpace(typeName) {
	case "Long":
		return "BIGINT"
	case "Int", "Integer":
		return "INT"
	case "Short":
		return "SMALLINT"
	case "Byte":
		return "TINYINT"
	case "Double":
		return "DOUBLE"
	case "Float":
		return "FLOAT"
	case "Boolean":
		return "TINYINT(1)"
	case "BigDecimal":
		return "DECIMAL(19,2)"
	case "String":
		return "VARCHAR(255)"
	case "LocalDate":
		return "DATE"
	case "LocalDateTime", "Instant":
		return "DATETIME"
	default:
		return typeName
	}
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
	b.WriteString(sourceDocComment("", entity.Comment))
	b.WriteString("@Entity\n")
	b.WriteString(kotlinTableAnnotation(entity))
	b.WriteString("\n")
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

func kotlinTableAnnotation(entity ErdEntity) string {
	indexes := entityScalarIndexes(entity)
	if len(indexes) == 0 {
		return fmt.Sprintf("@Table(name = \"%s\")", tableName(entity))
	}

	parts := make([]string, 0, len(indexes))
	for _, index := range indexes {
		parts = append(parts, fmt.Sprintf("Index(name = \"%s\", columnList = \"%s\")", index.Name, index.Column))
	}
	return fmt.Sprintf("@Table(name = \"%s\", indexes = [%s])", tableName(entity), strings.Join(parts, ", "))
}

func kotlinFieldProperty(field ErdField) string {
	var b strings.Builder
	b.WriteString(sourceDocComment("    ", field.Comment))
	if field.ID {
		b.WriteString("    @Id\n")
		b.WriteString("    @GeneratedValue(strategy = GenerationType.IDENTITY)\n")
	}
	b.WriteString("    ")
	b.WriteString(jpaColumnAnnotation(field))
	b.WriteString("\n")
	b.WriteString("    open var ")
	b.WriteString(field.Name)
	b.WriteString(": ")
	b.WriteString(kotlinType(field.Type, fieldNullable(field) || field.ID))
	b.WriteString(" = ")
	b.WriteString(kotlinDefault(field.Type, fieldNullable(field) || field.ID))
	return b.String()
}

func jpaColumnAnnotation(field ErdField) string {
	options := []string{fmt.Sprintf("name = \"%s\"", columnName(field))}
	if !fieldNullable(field) {
		options = append(options, "nullable = false")
	}
	if field.Unique {
		options = append(options, "unique = true")
	}
	if strings.TrimSpace(field.Type) == "String" && field.Length != nil {
		options = append(options, fmt.Sprintf("length = %d", stringLength(field)))
	}
	if strings.TrimSpace(field.Type) == "BigDecimal" && (field.Precision != nil || field.Scale != nil) {
		options = append(options, fmt.Sprintf("precision = %d", decimalPrecision(field)))
		options = append(options, fmt.Sprintf("scale = %d", decimalScale(field)))
	}
	return "@Column(" + strings.Join(options, ", ") + ")"
}

func kotlinRelationProperty(relation ErdRelation) string {
	nullable := relationNullable(relation)
	optional := "true"
	if !nullable {
		optional = "false"
	}

	var b strings.Builder
	b.WriteString(sourceDocComment("    ", relation.Comment))
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

func javaFilePath(packageName, entityName string) string {
	if packageName == "" {
		return entityName + ".java"
	}
	return strings.ReplaceAll(packageName, ".", "/") + "/" + entityName + ".java"
}

func generateJavaEntity(spec ErdSpec, entity ErdEntity, relations []ErdRelation) string {
	var b strings.Builder
	if spec.PackageName != "" {
		b.WriteString("package ")
		b.WriteString(spec.PackageName)
		b.WriteString(";\n\n")
	}

	for _, importName := range javaImports(entity, relations) {
		b.WriteString("import ")
		b.WriteString(importName)
		b.WriteString(";\n")
	}
	b.WriteString("\n")
	b.WriteString(sourceDocComment("", entity.Comment))
	b.WriteString("@Getter\n")
	b.WriteString("@Setter\n")
	b.WriteString("@Builder\n")
	b.WriteString("@NoArgsConstructor(access = AccessLevel.PROTECTED)\n")
	b.WriteString("@AllArgsConstructor\n")
	b.WriteString("@Entity\n")
	b.WriteString(javaTableAnnotation(entity))
	b.WriteString("\n")
	b.WriteString("public class ")
	b.WriteString(entity.Name)
	b.WriteString(" {\n\n")

	var props []string
	for _, field := range entity.Fields {
		props = append(props, javaFieldProperty(field))
	}
	for _, relation := range relations {
		props = append(props, javaRelationProperty(relation))
	}
	b.WriteString(strings.Join(props, "\n\n"))
	if len(props) > 0 {
		b.WriteString("\n")
	}
	b.WriteString("}\n")
	return b.String()
}

func javaTableAnnotation(entity ErdEntity) string {
	indexes := entityScalarIndexes(entity)
	if len(indexes) == 0 {
		return fmt.Sprintf("@Table(name = \"%s\")", tableName(entity))
	}

	parts := make([]string, 0, len(indexes))
	for _, index := range indexes {
		parts = append(parts, fmt.Sprintf("@Index(name = \"%s\", columnList = \"%s\")", index.Name, index.Column))
	}
	return fmt.Sprintf("@Table(name = \"%s\", indexes = { %s })", tableName(entity), strings.Join(parts, ", "))
}

func javaImports(entity ErdEntity, relations []ErdRelation) []string {
	imports := []string{
		"jakarta.persistence.*",
		"lombok.AccessLevel",
		"lombok.AllArgsConstructor",
		"lombok.Builder",
		"lombok.Getter",
		"lombok.NoArgsConstructor",
		"lombok.Setter",
	}
	importSet := map[string]bool{}
	for _, field := range entity.Fields {
		switch field.Type {
		case "BigDecimal":
			importSet["java.math.BigDecimal"] = true
		case "LocalDate":
			importSet["java.time.LocalDate"] = true
		case "LocalDateTime":
			importSet["java.time.LocalDateTime"] = true
		case "Instant":
			importSet["java.time.Instant"] = true
		}
	}
	for _, relation := range relations {
		if relation.Type == "one-to-many" || relation.Type == "many-to-many" {
			importSet["java.util.ArrayList"] = true
			importSet["java.util.List"] = true
		}
	}

	var extraImports []string
	for importName := range importSet {
		extraImports = append(extraImports, importName)
	}
	sort.Strings(extraImports)

	result := []string{imports[0]}
	result = append(result, extraImports...)
	result = append(result, imports[1:]...)
	return result
}

func javaFieldProperty(field ErdField) string {
	var b strings.Builder
	b.WriteString(sourceDocComment("    ", field.Comment))
	if field.ID {
		b.WriteString("    @Id\n")
		b.WriteString("    @GeneratedValue(strategy = GenerationType.IDENTITY)\n")
	}
	b.WriteString("    ")
	b.WriteString(jpaColumnAnnotation(field))
	b.WriteString("\n")
	b.WriteString("    private ")
	b.WriteString(javaType(field.Type))
	b.WriteString(" ")
	b.WriteString(field.Name)
	b.WriteString(";")
	return b.String()
}

func javaRelationProperty(relation ErdRelation) string {
	nullable := relationNullable(relation)
	optional := "true"
	if !nullable {
		optional = "false"
	}

	var b strings.Builder
	b.WriteString(sourceDocComment("    ", relation.Comment))
	switch relation.Type {
	case "one-to-one":
		b.WriteString("    @OneToOne(fetch = FetchType.LAZY, optional = ")
	case "many-to-one":
		b.WriteString("    @ManyToOne(fetch = FetchType.LAZY, optional = ")
	case "one-to-many":
		b.WriteString("    @OneToMany\n")
		b.WriteString("    @Builder.Default\n")
		b.WriteString("    private List<")
		b.WriteString(relation.To)
		b.WriteString("> ")
		b.WriteString(relation.Field)
		b.WriteString(" = new ArrayList<>();")
		return b.String()
	case "many-to-many":
		b.WriteString("    @ManyToMany\n")
		b.WriteString("    @Builder.Default\n")
		b.WriteString("    private List<")
		b.WriteString(relation.To)
		b.WriteString("> ")
		b.WriteString(relation.Field)
		b.WriteString(" = new ArrayList<>();")
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
	b.WriteString("    private ")
	b.WriteString(relation.To)
	b.WriteString(" ")
	b.WriteString(relation.Field)
	b.WriteString(";")
	return b.String()
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

func javaType(typeName string) string {
	switch typeName {
	case "Int":
		return "Integer"
	default:
		return typeName
	}
}

func sourceDocComment(indent, comment string) string {
	lines := sourceCommentLines(comment)
	if len(lines) == 0 {
		return ""
	}

	var b strings.Builder
	b.WriteString(indent)
	b.WriteString("/**\n")
	for _, line := range lines {
		b.WriteString(indent)
		if line == "" {
			b.WriteString(" *\n")
			continue
		}
		b.WriteString(" * ")
		b.WriteString(line)
		b.WriteString("\n")
	}
	b.WriteString(indent)
	b.WriteString(" */\n")
	return b.String()
}

func sourceCommentLines(comment string) []string {
	trimmed := strings.TrimSpace(strings.ReplaceAll(comment, "\r\n", "\n"))
	if trimmed == "" {
		return nil
	}

	rawLines := strings.Split(strings.ReplaceAll(trimmed, "\r", "\n"), "\n")
	lines := make([]string, 0, len(rawLines))
	for _, line := range rawLines {
		lines = append(lines, strings.ReplaceAll(strings.TrimSpace(line), "*/", "* /"))
	}
	return lines
}

func mysqlStringLiteral(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	trimmed = strings.ReplaceAll(trimmed, "'", "''")
	return "'" + trimmed + "'"
}

type mysqlDDLColumn struct {
	Name          string
	Type          string
	Comment       string
	NotNull       bool
	AutoIncrement bool
}

type mysqlDDLIndex struct {
	Name   string
	Column string
}

type mysqlDDLForeignKey struct {
	Name            string
	Column          string
	ReferenceTable  string
	ReferenceColumn string
}

func generateMySQLTableDDL(spec ErdSpec, entity ErdEntity, relations []ErdRelation) string {
	table := tableName(entity)
	primaryKeys := mysqlPrimaryKeyColumns(entity)
	singleAutoIncrementPK := len(primaryKeys) == 1

	columns := make([]mysqlDDLColumn, 0, len(entity.Fields)+len(relations))
	uniqueKeys := make([]mysqlDDLIndex, 0)
	indexes := entityScalarIndexes(entity)
	for _, field := range entity.Fields {
		name := columnName(field)
		columns = append(columns, mysqlDDLColumn{
			Name:          name,
			Type:          fieldMySQLType(field),
			Comment:       field.Comment,
			NotNull:       field.ID || !fieldNullable(field),
			AutoIncrement: field.ID && singleAutoIncrementPK && mysqlAutoIncrementType(field.Type),
		})
		if field.Unique {
			uniqueKeys = append(uniqueKeys, mysqlDDLIndex{
				Name:   "uk_" + table + "_" + name,
				Column: name,
			})
		}
	}

	foreignKeys := make([]mysqlDDLForeignKey, 0)
	for _, relation := range relations {
		if !relationOwnsForeignKey(relation) {
			continue
		}

		column := relationForeignKeyName(relation)
		columns = appendOrMergeMySQLColumn(columns, mysqlDDLColumn{
			Name:    column,
			Type:    relationTargetIDMySQLType(spec, relation.To),
			Comment: relation.Comment,
			NotNull: !relationNullable(relation),
		})
		indexes = append(indexes, mysqlDDLIndex{
			Name:   "idx_" + table + "_" + column,
			Column: column,
		})
		foreignKeys = append(foreignKeys, mysqlDDLForeignKey{
			Name:            "fk_" + table + "_" + column + "_" + tableNameByEntityName(spec, relation.To),
			Column:          column,
			ReferenceTable:  tableNameByEntityName(spec, relation.To),
			ReferenceColumn: relationTargetIDColumnName(spec, relation.To),
		})
	}

	lines := make([]string, 0, len(columns)+len(primaryKeys)+len(uniqueKeys)+len(indexes)+len(foreignKeys))
	for _, column := range columns {
		lines = append(lines, mysqlColumnDDL(column))
	}
	if len(primaryKeys) > 0 {
		lines = append(lines, "PRIMARY KEY ("+mysqlQuotedIdentList(primaryKeys)+")")
	}
	for _, uniqueKey := range uniqueKeys {
		lines = append(lines, mysqlIndexDDL("UNIQUE KEY", uniqueKey))
	}
	for _, index := range indexes {
		lines = append(lines, mysqlIndexDDL("KEY", index))
	}
	for _, foreignKey := range foreignKeys {
		lines = append(lines, mysqlForeignKeyDDL(foreignKey))
	}

	var b strings.Builder
	b.WriteString("CREATE TABLE ")
	b.WriteString(mysqlQuoteIdent(table))
	b.WriteString(" (\n")
	for i, line := range lines {
		b.WriteString("  ")
		b.WriteString(line)
		if i < len(lines)-1 {
			b.WriteString(",")
		}
		b.WriteString("\n")
	}
	b.WriteString(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci")
	if comment := mysqlStringLiteral(entity.Comment); comment != "" {
		b.WriteString(" COMMENT=")
		b.WriteString(comment)
	}
	b.WriteString(";")
	return b.String()
}

func entityScalarIndexes(entity ErdEntity) []mysqlDDLIndex {
	table := tableName(entity)
	indexes := make([]mysqlDDLIndex, 0)
	for _, field := range entity.Fields {
		if !fieldIndexed(field) {
			continue
		}
		column := columnName(field)
		indexes = append(indexes, mysqlDDLIndex{
			Name:   "idx_" + table + "_" + column,
			Column: column,
		})
	}
	return indexes
}

func appendOrMergeMySQLColumn(columns []mysqlDDLColumn, next mysqlDDLColumn) []mysqlDDLColumn {
	for i, column := range columns {
		if column.Name != next.Name {
			continue
		}
		if column.Type == "" {
			columns[i].Type = next.Type
		}
		if strings.TrimSpace(columns[i].Comment) == "" {
			columns[i].Comment = next.Comment
		}
		columns[i].NotNull = column.NotNull || next.NotNull
		columns[i].AutoIncrement = column.AutoIncrement || next.AutoIncrement
		return columns
	}
	return append(columns, next)
}

func mysqlPrimaryKeyColumns(entity ErdEntity) []string {
	columns := make([]string, 0)
	for _, field := range entity.Fields {
		if field.ID {
			columns = append(columns, columnName(field))
		}
	}
	return columns
}

func mysqlColumnDDL(column mysqlDDLColumn) string {
	var b strings.Builder
	b.WriteString(mysqlQuoteIdent(column.Name))
	b.WriteString(" ")
	b.WriteString(column.Type)
	if column.NotNull {
		b.WriteString(" NOT NULL")
	}
	if column.AutoIncrement {
		b.WriteString(" AUTO_INCREMENT")
	}
	if comment := mysqlStringLiteral(column.Comment); comment != "" {
		b.WriteString(" COMMENT ")
		b.WriteString(comment)
	}
	return b.String()
}

func mysqlIndexDDL(kind string, index mysqlDDLIndex) string {
	return kind + " " + mysqlQuoteIdent(index.Name) + " (" + mysqlQuoteIdent(index.Column) + ")"
}

func mysqlForeignKeyDDL(foreignKey mysqlDDLForeignKey) string {
	return "CONSTRAINT " + mysqlQuoteIdent(foreignKey.Name) +
		" FOREIGN KEY (" + mysqlQuoteIdent(foreignKey.Column) + ")" +
		" REFERENCES " + mysqlQuoteIdent(foreignKey.ReferenceTable) +
		" (" + mysqlQuoteIdent(foreignKey.ReferenceColumn) + ")"
}

func mysqlQuotedIdentList(values []string) string {
	quoted := make([]string, 0, len(values))
	for _, value := range values {
		quoted = append(quoted, mysqlQuoteIdent(value))
	}
	return strings.Join(quoted, ", ")
}

func mysqlQuoteIdent(value string) string {
	return "`" + strings.ReplaceAll(value, "`", "``") + "`"
}

func mysqlAutoIncrementType(typeName string) bool {
	switch strings.TrimSpace(typeName) {
	case "Long", "Int", "Integer", "Short", "Byte":
		return true
	default:
		return false
	}
}

func tableNameByEntityName(spec ErdSpec, entityName string) string {
	for _, entity := range spec.Entities {
		if entity.Name == entityName {
			return tableName(entity)
		}
	}
	return toSnakeCase(entityName) + "s"
}

func relationTargetIDColumnName(spec ErdSpec, targetName string) string {
	for _, entity := range spec.Entities {
		if entity.Name != targetName {
			continue
		}
		for _, field := range entity.Fields {
			if field.ID {
				return columnName(field)
			}
		}
	}
	return "id"
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
