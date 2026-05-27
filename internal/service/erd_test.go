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
