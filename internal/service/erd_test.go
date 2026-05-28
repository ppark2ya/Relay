package service

import (
	"strings"
	"testing"
)

const sampleErdDSL = `{
  "packageName": "com.example.domain",
  "entities": [
    {
      "name": "User",
      "table": "users",
      "fields": [
        { "name": "id", "type": "Long", "id": true },
        { "name": "email", "type": "String", "nullable": false, "unique": true }
      ]
    },
    {
      "name": "Order",
      "table": "orders",
      "fields": [
        { "name": "id", "type": "Long", "id": true },
        { "name": "amount", "type": "BigDecimal", "nullable": false }
      ]
    }
  ],
  "relations": [
    {
      "from": "Order",
      "to": "User",
      "type": "many-to-one",
      "field": "user",
      "joinColumn": "user_id",
      "nullable": false
    }
  ]
}`

func TestParseErdDSL_ValidatesRelationsAndIds(t *testing.T) {
	doc, diagnostics := ParseErdDSL(sampleErdDSL)
	if len(diagnostics) != 0 {
		t.Fatalf("expected no diagnostics, got %#v", diagnostics)
	}
	if doc.PackageName != "com.example.domain" {
		t.Fatalf("unexpected package name: %q", doc.PackageName)
	}
	if len(doc.Entities) != 2 {
		t.Fatalf("expected 2 entities, got %d", len(doc.Entities))
	}
}

func TestParseErdDSL_ReportsInvalidReferences(t *testing.T) {
	_, diagnostics := ParseErdDSL(`{
	  "entities": [
	    { "name": "Order", "fields": [{ "name": "id", "type": "Long", "id": true }] }
	  ],
	  "relations": [
	    { "from": "Order", "to": "Missing", "type": "many-to-one", "field": "missing" }
	  ]
	}`)

	if len(diagnostics) == 0 {
		t.Fatal("expected diagnostics for missing relation target")
	}
	if !strings.Contains(diagnostics[0].Message, "Missing") {
		t.Fatalf("expected diagnostic to mention Missing, got %q", diagnostics[0].Message)
	}
}

func TestGenerateMermaidERD_IncludesFieldsAndRelationLines(t *testing.T) {
	doc, diagnostics := ParseErdDSL(sampleErdDSL)
	if len(diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", diagnostics)
	}

	mermaid := GenerateMermaidERD(doc)

	for _, want := range []string{
		"erDiagram",
		"User {",
		"String email",
		"Order }o--|| User : user",
	} {
		if !strings.Contains(mermaid, want) {
			t.Fatalf("expected Mermaid output to contain %q:\n%s", want, mermaid)
		}
	}
}

func TestGenerateErdDiagram_IncludesEntitiesAndRelations(t *testing.T) {
	doc, diagnostics := ParseErdDSL(sampleErdDSL)
	if len(diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", diagnostics)
	}

	diagram := GenerateErdDiagram(doc)

	if len(diagram.Entities) != 2 {
		t.Fatalf("expected 2 diagram entities, got %d", len(diagram.Entities))
	}
	if diagram.Entities[0].Name != "User" {
		t.Fatalf("expected first entity User, got %q", diagram.Entities[0].Name)
	}
	wantFields := []string{"Long id PK", "String email UK"}
	if strings.Join(diagram.Entities[0].Fields, "\n") != strings.Join(wantFields, "\n") {
		t.Fatalf("unexpected User fields: %#v", diagram.Entities[0].Fields)
	}

	if len(diagram.Relations) != 1 {
		t.Fatalf("expected 1 diagram relation, got %d", len(diagram.Relations))
	}
	relation := diagram.Relations[0]
	if relation.From != "Order" || relation.FromCardinality != "}o" || relation.To != "User" || relation.ToCardinality != "||" || relation.Label != "user" {
		t.Fatalf("unexpected relation: %#v", relation)
	}
}

func TestGenerateKotlinEntities_UsesJakartaAndRelations(t *testing.T) {
	doc, diagnostics := ParseErdDSL(sampleErdDSL)
	if len(diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", diagnostics)
	}

	files := GenerateKotlinEntities(doc)
	if len(files) != 2 {
		t.Fatalf("expected 2 generated files, got %d", len(files))
	}

	var orderContent string
	for _, file := range files {
		if file.Path == "com/example/domain/Order.kt" {
			orderContent = file.Content
			break
		}
	}
	if orderContent == "" {
		t.Fatal("expected Order.kt to be generated")
	}

	for _, want := range []string{
		"package com.example.domain",
		"import jakarta.persistence.*",
		"@Entity",
		"@Table(name = \"orders\")",
		"open class Order(",
		"@ManyToOne(fetch = FetchType.LAZY, optional = false)",
		"@JoinColumn(name = \"user_id\", nullable = false)",
		"open var user: User",
	} {
		if !strings.Contains(orderContent, want) {
			t.Fatalf("expected Kotlin output to contain %q:\n%s", want, orderContent)
		}
	}
}

func TestGenerateJavaEntities_UsesLombokBuilderAndRelations(t *testing.T) {
	doc, diagnostics := ParseErdDSL(`{
	  "packageName": "com.example.domain",
	  "entities": [
	    {
	      "name": "User",
	      "table": "users",
	      "fields": [
	        { "name": "id", "type": "Long", "id": true },
	        { "name": "email", "type": "String", "nullable": false, "unique": true }
	      ]
	    },
	    {
	      "name": "Order",
	      "table": "orders",
	      "fields": [
	        { "name": "id", "type": "Long", "id": true },
	        { "name": "amount", "type": "BigDecimal", "nullable": false },
	        { "name": "createdAt", "type": "LocalDateTime", "nullable": false }
	      ]
	    }
	  ],
	  "relations": [
	    { "from": "User", "to": "Order", "type": "one-to-many", "field": "orders" },
	    { "from": "Order", "to": "User", "type": "many-to-one", "field": "user", "joinColumn": "user_id", "nullable": false }
	  ]
	}`)
	if len(diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", diagnostics)
	}

	files := GenerateJavaEntities(doc)
	if len(files) != 2 {
		t.Fatalf("expected 2 generated files, got %d", len(files))
	}

	var orderContent, userContent string
	for _, file := range files {
		switch file.Path {
		case "com/example/domain/Order.java":
			orderContent = file.Content
		case "com/example/domain/User.java":
			userContent = file.Content
		}
	}
	if orderContent == "" {
		t.Fatal("expected Order.java to be generated")
	}
	if userContent == "" {
		t.Fatal("expected User.java to be generated")
	}

	for _, want := range []string{
		"package com.example.domain;",
		"import jakarta.persistence.*;",
		"import java.math.BigDecimal;",
		"import java.time.LocalDateTime;",
		"import lombok.AccessLevel;",
		"import lombok.AllArgsConstructor;",
		"import lombok.Builder;",
		"import lombok.Getter;",
		"import lombok.NoArgsConstructor;",
		"import lombok.Setter;",
		"@Getter",
		"@Setter",
		"@Builder",
		"@NoArgsConstructor(access = AccessLevel.PROTECTED)",
		"@AllArgsConstructor",
		"@Entity",
		"@Table(name = \"orders\")",
		"public class Order {",
		"@Id",
		"@GeneratedValue(strategy = GenerationType.IDENTITY)",
		"@Column(name = \"amount\", nullable = false)",
		"private BigDecimal amount;",
		"@Column(name = \"created_at\", nullable = false)",
		"private LocalDateTime createdAt;",
		"@ManyToOne(fetch = FetchType.LAZY, optional = false)",
		"@JoinColumn(name = \"user_id\", nullable = false)",
		"private User user;",
	} {
		if !strings.Contains(orderContent, want) {
			t.Fatalf("expected Java output to contain %q:\n%s", want, orderContent)
		}
	}

	for _, want := range []string{
		"import java.util.ArrayList;",
		"import java.util.List;",
		"@OneToMany",
		"@Builder.Default",
		"private List<Order> orders = new ArrayList<>();",
	} {
		if !strings.Contains(userContent, want) {
			t.Fatalf("expected Java output to contain %q:\n%s", want, userContent)
		}
	}
	for _, notWant := range []string{
		"import java.math.BigDecimal;",
		"import java.time.LocalDateTime;",
	} {
		if strings.Contains(userContent, notWant) {
			t.Fatalf("expected User.java not to contain %q:\n%s", notWant, userContent)
		}
	}
}
